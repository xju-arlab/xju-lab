import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, LoaderCircle, Plus, Server, ShieldCheck, Trash2 } from 'lucide-react'
import { apiRequest, type Session } from '../../api/client'
import { ComboBox } from '../../components/common/ComboBox'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import './servers.css'

type Hardware = { kind: 'CPU' | 'GPU' | 'UNKNOWN'; cpuModel: string | null; cpuCores: number | null; memoryBytes: number | null; diskBytes: number | null; os: string | null; gpus: string[]; gpuDetection: string }
type Asset = { id: string; name: string; version: number; enabled: boolean; prometheusJob: string | null; targetLabel: string | null; gpuSupported: boolean; hardware: Hardware | null; discoveredAt: string | null }
type Result = { status: 'READY' | 'CONNECTED' | 'FAILED' | 'PASSWORD_REQUIRED' | 'HOST_KEY_REQUIRED'; message?: string; host?: string; fingerprint?: string; hardware?: Hardware }
type Catalog = { config?: string; aliases: string[]; ignoredOptions: string[] }
type Metric = { metric: string; unit: string; value: number | null; status: string }
const base = '/monitor/admin/ssh'
const message = (error: unknown) => error instanceof Error ? error.message : '操作失败，请稍后重试'
const size = (value: number | null) => value == null ? '待识别' : `${(value / 1024 ** 3).toFixed(1)} GiB`

function HardwareDetails({ data }: { data: Hardware }) {
  return <dl className="server-hardware"><div><dt>服务器类型</dt><dd>{data.kind === 'UNKNOWN' ? '待确认' : `${data.kind} 服务器`}</dd></div><div><dt>处理器</dt><dd>{data.cpuModel ?? '待识别'}{data.cpuCores == null ? '' : ` · ${data.cpuCores} 核`}</dd></div><div><dt>内存 / 系统盘</dt><dd>{size(data.memoryBytes)} / {size(data.diskBytes)}</dd></div><div><dt>系统</dt><dd>{data.os ?? '待识别'}</dd></div>{data.gpus.length > 0 && <div><dt>GPU</dt><dd>{data.gpus.join('；')}</dd></div>}</dl>
}

function AddServerDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [config, setConfig] = useState('')
  const [alias, setAlias] = useState('')
  const [aliases, setAliases] = useState<string[]>([])
  const [ignored, setIgnored] = useState<string[]>([])
  const [result, setResult] = useState<Result>({ status: 'READY' })
  const [busy, setBusy] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const draft = useRef<string | null>(null)
  const alive = useRef(true)
  const edited = useRef(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    alive.current = true
    apiRequest<Catalog>(`${base}/config`).then(data => {
      if (!alive.current || edited.current) return
      setConfig(data.config ?? ''); setAliases(data.aliases); setAlias(data.aliases[0] ?? ''); setIgnored(data.ignoredOptions)
    }).catch(reason => { if (alive.current) setError(message(reason)) })
    return () => { alive.current = false; request.current?.abort(); if (draft.current) void apiRequest(`${base}/connections/${draft.current}`, { method: 'DELETE' }).catch(() => {}) }
  }, [])
  useEffect(() => {
    if (!edited.current) return
    let active = true
    if (!config.trim()) { setAliases([]); setAlias(''); setParsing(false); return }
    setParsing(true)
    const timeout = window.setTimeout(() => {
      apiRequest<Catalog>(`${base}/config/parse`, { method: 'POST', body: { config } }).then(data => {
        if (!active) return
        setAliases(data.aliases); setAlias(previous => data.aliases.includes(previous) ? previous : data.aliases[0] ?? ''); setIgnored(data.ignoredOptions); setError('')
      }).catch(reason => { if (active) { setAliases([]); setAlias(''); setError(message(reason)) } }).finally(() => { if (active) setParsing(false) })
    }, 450)
    return () => { active = false; window.clearTimeout(timeout) }
  }, [config])
  async function connect(options: { password?: string; trustHost?: boolean } = {}) {
    setBusy(true); setError(''); setPassword('')
    request.current = new AbortController()
    try {
      if (!draft.current) {
        const created = await apiRequest<{ id: string }>(`${base}/connections`, { method: 'POST', body: { name, config, alias } })
        draft.current = created.id
        if (!alive.current) { await apiRequest(`${base}/connections/${created.id}`, { method: 'DELETE' }); return }
      }
      const response = await apiRequest<Result>(`${base}/connections/${draft.current}/connect`, { method: 'POST', body: options, signal: request.current.signal })
      if (alive.current) { setResult(response); if (response.status === 'FAILED') setError(response.message ?? '连接失败') }
    } catch (reason) { if (alive.current) { setError(message(reason)); setResult({ status: 'FAILED' }) } }
    finally { if (alive.current) setBusy(false) }
  }
  async function reset() {
    if (draft.current) await apiRequest(`${base}/connections/${draft.current}`, { method: 'DELETE' })
    draft.current = null; setResult({ status: 'READY' }); setError(''); setPassword('')
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (result.status !== 'CONNECTED') { await connect(); return }
    setBusy(true); setError('')
    try { await apiRequest(`${base}/connections/${draft.current}/save`, { method: 'POST' }); draft.current = null; onSaved() }
    catch (reason) { setError(message(reason)); setBusy(false) }
  }
  const challenge = !busy && ['PASSWORD_REQUIRED', 'HOST_KEY_REQUIRED'].includes(result.status)
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="server-dialog" onInteractOutside={event => event.preventDefault()}>
    <DialogHeader><DialogTitle>添加服务器</DialogTitle><DialogDescription>连接并识别硬件信息，确认后保存到计算资源。</DialogDescription></DialogHeader>
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>中文名称</span><input value={name} onChange={event => setName(event.target.value)} placeholder="例如：算法训练服务器" required maxLength={120} disabled={busy || Boolean(draft.current)} /></label>
      <div className="field"><span id="ssh-alias-label">SSH 配置中的服务器</span><div aria-labelledby="ssh-alias-label"><ComboBox inlineMenu options={aliases.map(value => ({ value, label: value }))} value={alias} onValueChange={setAlias} placeholder={parsing ? '正在解析配置…' : '请选择服务器'} disabled={busy || Boolean(draft.current) || parsing} /></div></div>
      <label className="field"><span>SSH 配置</span><textarea value={config} spellCheck={false} onChange={event => { edited.current = true; setConfig(event.target.value); setAlias(''); setAliases([]); setParsing(true) }} rows={7} maxLength={32768} required disabled={busy || Boolean(draft.current)} placeholder={'Host gpu-lab\n  HostName 192.0.2.10\n  User lab\n  ProxyJump gateway\nHost gateway\n  HostName 192.0.2.20\n  User lab'} /></label>
      <p className="api-note">自动读取 Lab 服务挂载的配置，也可在此粘贴。跳板请声明为 Host 并通过 ProxyJump 引用。首次密码登录后会追加 Lab 专用公钥。</p>
      {ignored.length > 0 && <p className="api-note">已忽略客户端偏好：{ignored.join('、')}。连接统一使用 Lab 专用密钥并校验主机指纹。</p>}
      {busy && <div className="server-connection connecting" role="status"><LoaderCircle className="server-spinner" size={28} /><div><strong>{result.status === 'CONNECTED' ? '正在保存' : '正在连接服务器'}</strong><p>正在认证、验证公钥并识别硬件，请稍候…</p></div></div>}
      {!busy && result.status === 'CONNECTED' && <div className="server-connected" role="status"><div className="server-connection"><span className="server-success-icon"><Check size={26} strokeWidth={3} /></span><div><strong>连接成功</strong><p>硬件信息已读取，公钥登录已验证。</p></div></div>{result.hardware && <HardwareDetails data={result.hardware} />}</div>}
      {error && <p role="alert" className="api-error-text">{error}</p>}
      <DialogFooter>{draft.current && !busy && <Button type="button" variant="ghost" onClick={() => void reset().catch(reason => setError(message(reason)))}>修改配置</Button>}<Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="submit" disabled={busy || parsing || !alias || challenge}>{result.status === 'CONNECTED' ? '保存' : '连接'}</Button></DialogFooter>
    </form>
    <Dialog open={challenge} onOpenChange={open => { if (!open) { setPassword(''); setResult({ status: 'FAILED' }) } }}><DialogContent className="server-dialog server-challenge" onInteractOutside={event => event.preventDefault()}><DialogHeader><DialogTitle>{result.status === 'HOST_KEY_REQUIRED' ? '确认服务器身份' : '输入 SSH 密码'}</DialogTitle><DialogDescription>{result.host} · {result.message}</DialogDescription></DialogHeader>
      <form className="form-stack" onSubmit={event => { event.preventDefault(); void connect(result.status === 'HOST_KEY_REQUIRED' ? { trustHost: true } : { password }) }}>
        {result.status === 'HOST_KEY_REQUIRED' ? <div className="server-fingerprint"><ShieldCheck size={22} /><code>{result.fingerprint}</code><p>请与服务器管理员提供的指纹核对。一经确认，后续连接将校验此指纹。</p></div> : <label className="field"><span>密码</span><input type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} required maxLength={1024} autoFocus /><small>仅用于本次认证，不保存密码。公钥也会安装到需要密码的跳板账户。</small></label>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => { setPassword(''); setResult({ status: 'FAILED' }) }}>取消</Button><Button type="submit">确认</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </DialogContent></Dialog>
}

export function ServersPage({ session }: { session: Session }) {
  const admin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  const [assets, setAssets] = useState<Asset[]>([])
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Asset | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [metrics, setMetrics] = useState<Record<string, Metric[]>>({})
  const [metricErrors, setMetricErrors] = useState<Record<string, string>>({})
  const [series, setSeries] = useState<{ id: string; points: { timestamp: string; value: number }[] } | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    apiRequest<Asset[]>('/monitor/assets').then(data => { if (active) setAssets(data) }).catch(reason => { if (active) setError(message(reason)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [version])
  useEffect(() => {
    let active = true
    setMetrics({}); setMetricErrors({})
    for (const asset of assets.filter(item => item.enabled)) void apiRequest<{ metrics: Metric[] }>(`/monitor/assets/${asset.id}/metrics`).then(data => { if (active) setMetrics(previous => ({ ...previous, [asset.id]: data.metrics })) }).catch(reason => { if (active) setMetricErrors(previous => ({ ...previous, [asset.id]: message(reason) })) })
    return () => { active = false }
  }, [assets])
  async function toggle(asset: Asset) {
    try { await apiRequest(`/monitor/admin/assets/${asset.id}`, { method: 'PATCH', headers: { 'If-Match-Version': String(asset.version) }, body: { name: asset.name, prometheusJob: asset.prometheusJob, targetLabel: asset.targetLabel, gpuSupported: asset.gpuSupported, enabled: !asset.enabled } }); setNotice('服务器状态已更新'); setVersion(value => value + 1) }
    catch (reason) { setNotice(message(reason)) }
  }
  async function remove() {
    if (!deleting) return
    setDeletingBusy(true)
    try { await apiRequest(`/monitor/admin/assets/${deleting.id}`, { method: 'DELETE', headers: { 'If-Match-Version': String(deleting.version) } }); setDeleting(null); setNotice('服务器已删除'); setVersion(value => value + 1) }
    catch (reason) { setNotice(message(reason)); setDeleting(null); setVersion(value => value + 1) }
    finally { setDeletingBusy(false) }
  }
  async function loadSeries(id: string) {
    try { const data = await apiRequest<{ points: { timestamp: string; value: number }[] }>(`/monitor/assets/${id}/series?metric=CPU&range=1h`); setSeries({ id, points: data.points }) }
    catch (reason) { setNotice(message(reason)) }
  }
  return <><div className="page-heading"><div><div className="eyebrow">算法与科研实验室</div><h1>计算资源</h1><p>服务器硬件与运行状态，缺失指标显示待接入。</p></div>{admin && <Button onClick={() => setAdding(true)}><Plus size={16} />添加服务器</Button>}</div>
    {loading && <p role="status">正在加载服务器…</p>}{error && <div role="alert" className="api-feedback">{error}<Button variant="outline" onClick={() => setVersion(value => value + 1)}>重试</Button></div>}{notice && <p role="status" className="api-feedback">{notice}</p>}
    <div className="api-card-grid">{assets.map(asset => <section key={asset.id} className="panel api-panel"><div className="section-heading"><h2><Server size={18} /> {asset.name}</h2><span className={`tag tag-${asset.enabled ? 'teal' : 'gray'}`}>{asset.hardware?.kind === 'GPU' ? 'GPU' : asset.hardware?.kind === 'CPU' ? 'CPU' : '服务器'} · {asset.enabled ? '已登记' : '已停用'}</span></div>
      {asset.hardware ? <HardwareDetails data={asset.hardware} /> : <p className="api-note">硬件信息待录入。</p>}
      {asset.discoveredAt && <p className="api-note">硬件采集：{new Date(asset.discoveredAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）</p>}
      <p className="api-note">运行指标：{asset.prometheusJob && asset.targetLabel ? `${asset.prometheusJob} · ${asset.targetLabel}` : '待接入监控'}</p>
      {metricErrors[asset.id] && <p className="api-error-text">{metricErrors[asset.id]}</p>}{(metrics[asset.id] ?? []).map(metric => <div key={metric.metric} className="api-metric"><span>{metric.metric}</span><strong>{metric.value == null ? '—' : `${metric.value.toFixed(1)} ${metric.unit}`}<small>{metric.status === 'NOT_CONFIGURED' ? '待接入' : metric.status}</small></strong></div>)}
      <div className="server-actions">{asset.enabled && <Button variant="outline" onClick={() => void loadSeries(asset.id)}>读取 1 小时 CPU 曲线</Button>}{admin && <><Button variant="outline" onClick={() => void toggle(asset)}>{asset.enabled ? '停用' : '启用'}</Button><Button variant="ghost" aria-label={`删除${asset.name}`} onClick={() => setDeleting(asset)}><Trash2 size={16} />删除</Button></>}</div>
      {series?.id === asset.id && (series.points.length > 0 ? <svg className="api-series" viewBox="0 0 300 90" role="img" aria-label="过去一小时 CPU 使用率"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={series.points.map((point, index) => `${series.points.length < 2 ? 150 : index * 300 / (series.points.length - 1)},${82 - Math.max(0, Math.min(100, point.value)) * .72}`).join(' ')} /></svg> : <p className="api-note">所选时段没有采样点。</p>)}
    </section>)}</div>{!loading && !error && assets.length === 0 && <section className="panel api-panel"><p>服务器尚未登记。{admin ? '点击“添加服务器”开始连接。' : '请联系管理员添加。'}</p></section>}
    {adding && <AddServerDialog onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setNotice('服务器已添加'); setVersion(value => value + 1) }} />}
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !deletingBusy) setDeleting(null) }}><DialogContent className="server-dialog"><DialogHeader><DialogTitle>删除服务器</DialogTitle><DialogDescription>将“{deleting?.name}”从计算资源中移除。服务器上的数据和已安装公钥会保留。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={deletingBusy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={deletingBusy} onClick={() => void remove()}>{deletingBusy ? '正在删除…' : '确认删除'}</Button></DialogFooter></DialogContent></Dialog>
  </>
}
