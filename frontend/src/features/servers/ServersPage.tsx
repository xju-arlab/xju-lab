import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, LoaderCircle, Plus, Server, ShieldCheck, Trash2 } from 'lucide-react'
import { apiRequest, type Session } from '../../api/client'
import { ComboBox } from '../../components/common/ComboBox'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { useQuery } from '../../api/useQuery'
import { QueryFeedback } from '../../components/common/QueryFeedback'
import './servers.css'

type Hardware = { kind: 'CPU' | 'GPU' | 'UNKNOWN'; cpuModel: string | null; cpuCores: number | null; memoryBytes: number | null; diskBytes: number | null; os: string | null; gpus: string[]; gpuDetection: string }
type Asset = { id: string; name: string; version: number; enabled: boolean; prometheusJob: string | null; targetLabel: string | null; gpuSupported: boolean; hardware: Hardware | null; discoveredAt: string | null; monitoringSource: 'SSH' | 'PROMETHEUS' | 'NONE' }
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
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent overlayClassName="server-dialog-overlay" className="server-dialog" onInteractOutside={event => event.preventDefault()}>
    <DialogHeader className="server-dialog-heading"><DialogTitle>添加服务器</DialogTitle><DialogDescription>连接服务器，读取硬件信息后保存。</DialogDescription></DialogHeader>
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>中文名称</span><input value={name} onChange={event => setName(event.target.value)} placeholder="例如：算法训练服务器" required maxLength={120} disabled={busy || Boolean(draft.current)} /></label>
      <div className="field"><span id="ssh-alias-label">SSH 配置中的服务器</span><div aria-labelledby="ssh-alias-label"><ComboBox inlineMenu options={aliases.map(value => ({ value, label: value }))} value={alias} onValueChange={setAlias} placeholder={parsing ? '正在解析配置…' : '请选择服务器'} disabled={busy || Boolean(draft.current) || parsing} /></div></div>
      <label className="field"><span>SSH 配置</span><textarea value={config} spellCheck={false} onChange={event => { edited.current = true; setConfig(event.target.value); setAlias(''); setAliases([]); setParsing(true) }} rows={7} maxLength={32768} required disabled={busy || Boolean(draft.current)} placeholder={'Host gpu-lab\n  HostName 192.0.2.10\n  User lab\n  ProxyJump gateway\nHost gateway\n  HostName 192.0.2.20\n  User lab'} /></label>
      <ul className="api-note server-config-notes"><li>自动读取 Lab 服务挂载的配置，也可在此粘贴。</li><li>跳板请声明为 Host 并通过 ProxyJump 引用。</li><li>首次密码登录后会追加 Lab 专用公钥。</li></ul>
      {ignored.length > 0 && <p className="api-note">已忽略客户端偏好：{ignored.join('、')}。连接统一使用 Lab 专用密钥并校验主机指纹。</p>}
      {busy && <div className="server-connecting" role="status"><div className="server-connection"><LoaderCircle className="server-spinner" size={16} aria-hidden="true" /><span>{result.status === 'CONNECTED' ? '正在保存' : '正在连接服务器'}<small>认证与硬件检测中，请稍候</small></span></div><div className="server-progress" aria-hidden="true"><span /></div></div>}
      {!busy && result.status === 'CONNECTED' && <div className="server-connected" role="status"><div className="server-connection"><CheckCircle2 className="server-success-icon" size={18} strokeWidth={1.8} aria-hidden="true" /><strong>连接成功</strong><span className="server-connection-note">已验证密钥登录</span></div>{result.hardware && <HardwareDetails data={result.hardware} />}</div>}
      {error && <p role="alert" className="api-error-text">{error}</p>}
      <DialogFooter className="server-dialog-footer">{draft.current && !busy && <Button type="button" variant="ghost" onClick={() => void reset().catch(reason => setError(message(reason)))}>修改配置</Button>}<Button type="button" variant="outline" onClick={onClose}>取消</Button><Button type="submit" disabled={busy || parsing || !alias || challenge}>{result.status === 'CONNECTED' ? '保存' : '连接'}</Button></DialogFooter>
    </form>
    <Dialog open={challenge} onOpenChange={open => { if (!open) { setPassword(''); setResult({ status: 'FAILED' }) } }}><DialogContent overlayClassName="server-dialog-overlay" className="server-dialog server-challenge" onInteractOutside={event => event.preventDefault()}><DialogHeader><DialogTitle>{result.status === 'HOST_KEY_REQUIRED' ? '确认服务器身份' : '输入 SSH 密码'}</DialogTitle><DialogDescription>{result.host} · {result.message}</DialogDescription></DialogHeader>
      <form className="form-stack" onSubmit={event => { event.preventDefault(); void connect(result.status === 'HOST_KEY_REQUIRED' ? { trustHost: true } : { password }) }}>
        {result.status === 'HOST_KEY_REQUIRED' ? <div className="server-fingerprint"><ShieldCheck size={22} /><code>{result.fingerprint}</code><p>一经确认，后续连接将校验此指纹。</p></div> : <label className="field"><span>密码</span><input aria-label="密码" aria-describedby="ssh-password-help" type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} required maxLength={1024} autoFocus /><small id="ssh-password-help">仅用于本次认证，不保存密码。公钥也会安装到需要密码的跳板账户。</small></label>}
        <DialogFooter className="server-dialog-footer"><Button type="button" variant="outline" onClick={() => { setPassword(''); setResult({ status: 'FAILED' }) }}>取消</Button><Button type="submit">确认</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </DialogContent></Dialog>
}

export function ServersPage({ session }: { session: Session }) {
  const admin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  const assetQuery = useQuery<Asset[]>('/monitor/assets')
  const { loading, error, reload } = assetQuery
  const assets = assetQuery.data ?? []
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Asset | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [seriesId, setSeriesId] = useState<string | null>(null)
  const seriesQuery = useQuery<{ points: { timestamp: string; value: number }[] }>(seriesId ? `/monitor/assets/${seriesId}/series?metric=CPU&range=1h` : null)
  const series = seriesQuery.data
  async function toggle(asset: Asset) {
    try { await apiRequest(`/monitor/admin/assets/${asset.id}`, { method: 'PATCH', headers: { 'If-Match-Version': String(asset.version) }, body: { name: asset.name, prometheusJob: asset.prometheusJob, targetLabel: asset.targetLabel, gpuSupported: asset.gpuSupported, enabled: !asset.enabled } }); setNotice('服务器状态已更新'); reload() }
    catch (reason) { setNotice(message(reason)) }
  }
  async function remove() {
    if (!deleting) return
    setDeletingBusy(true)
    try { await apiRequest(`/monitor/admin/assets/${deleting.id}`, { method: 'DELETE', headers: { 'If-Match-Version': String(deleting.version) } }); setDeleting(null); setNotice('服务器已删除'); reload() }
    catch (reason) { setNotice(message(reason)); setDeleting(null); reload() }
    finally { setDeletingBusy(false) }
  }
  return <><div className="page-heading"><div><div className="eyebrow">算法与科研实验室</div><h1>计算资源</h1><p>服务器硬件与运行状态，缺失指标显示待接入。</p></div>{admin && <Button onClick={() => setAdding(true)}><Plus size={16} />添加服务器</Button>}</div>
    <QueryFeedback loading={loading} error={error} retry={reload} />{notice && <p role="status" className="api-feedback">{notice}</p>}
    <div className="api-card-grid">{assets.map(asset => <section key={asset.id} className="panel api-panel"><div className="section-heading"><h2><Server size={18} /> {asset.name}</h2><span className={`tag tag-${asset.enabled ? 'teal' : 'gray'}`}>{asset.hardware?.kind === 'GPU' ? 'GPU' : asset.hardware?.kind === 'CPU' ? 'CPU' : '服务器'} · {asset.enabled ? '已登记' : '已停用'}</span></div>
      {asset.hardware ? <HardwareDetails data={asset.hardware} /> : <p className="api-note">硬件信息待录入。</p>}
      {asset.discoveredAt && <p className="api-note">硬件采集：{new Date(asset.discoveredAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）</p>}
      <p className="api-note">{!asset.enabled ? '监控已停用' : asset.monitoringSource === 'SSH' ? 'SSH 自动采集 · 每 30 秒更新' : asset.monitoringSource === 'PROMETHEUS' ? 'Prometheus 自动采集' : '尚未配置采集来源'}</p>
      <AssetMetrics asset={asset} />
      <div className="server-actions">{asset.enabled && <Button variant="outline" onClick={() => { if (seriesId === asset.id) seriesQuery.reload(); else setSeriesId(asset.id) }}>读取 1 小时 CPU 曲线</Button>}{admin && <><Button variant="outline" onClick={() => void toggle(asset)}>{asset.enabled ? '停用' : '启用'}</Button><Button variant="ghost" aria-label={`删除${asset.name}`} onClick={() => setDeleting(asset)}><Trash2 size={16} />删除</Button></>}</div>
      {seriesId === asset.id && <QueryFeedback loading={seriesQuery.loading} error={seriesQuery.error} retry={seriesQuery.reload} />}{seriesId === asset.id && series && (series.points.length > 0 ? <svg className="api-series" viewBox="0 0 300 90" role="img" aria-label="过去一小时 CPU 使用率"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={series.points.map((point, index) => `${series.points.length < 2 ? 150 : index * 300 / (series.points.length - 1)},${82 - Math.max(0, Math.min(100, point.value)) * .72}`).join(' ')} /></svg> : <p className="api-note">所选时段没有采样点。</p>)}
    </section>)}</div>{!loading && !error && assets.length === 0 && <section className="panel api-panel"><p>服务器尚未登记。{admin ? '点击“添加服务器”开始连接。' : '请联系管理员添加。'}</p></section>}
    {adding && <AddServerDialog onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setNotice('服务器已添加'); reload() }} />}
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !deletingBusy) setDeleting(null) }}><DialogContent overlayClassName="server-dialog-overlay" className="server-dialog"><DialogHeader><DialogTitle>删除服务器</DialogTitle><DialogDescription>将“{deleting?.name}”从计算资源中移除。服务器上的数据和已安装公钥会保留。</DialogDescription></DialogHeader><DialogFooter className="server-dialog-footer"><Button variant="outline" disabled={deletingBusy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={deletingBusy} onClick={() => void remove()}>{deletingBusy ? '正在删除…' : '确认删除'}</Button></DialogFooter></DialogContent></Dialog>
  </>
}

function AssetMetrics({ asset }: { asset: Asset }) {
  const query = useQuery<{ state: string; metrics: Metric[] }>(asset.enabled ? `/monitor/assets/${asset.id}/metrics` : null)
  useEffect(() => {
    if (!asset.enabled) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') query.reload() }, query.data?.state === 'COLLECTING' ? 2_000 : 30_000)
    return () => window.clearInterval(timer)
  }, [asset.enabled, query.reload, query.data?.state])
  const names: Record<string, string> = { CPU: 'CPU 使用率', MEMORY: '内存使用率', DISK: '系统盘使用率', LOAD: '系统负载', GPU: 'GPU 使用率' }
  const statuses: Record<string, string> = { NOT_CONFIGURED: '未配置', AVAILABLE: '正常', COLLECTING: '首次采集中', SSH_UNAVAILABLE: 'SSH 连接中断', PLATFORM_UNAVAILABLE: '监控服务不可用', EXPORTER_UNREACHABLE: '采集器离线', OK: '正常', STALE: '数据过期', NO_DATA: '暂无采样', UNAVAILABLE: '采集不可用', UNSUPPORTED: '不适用' }
  return <><QueryFeedback loading={query.loading} error={query.error} retry={query.reload} />{query.data?.metrics.filter(metric => metric.status !== 'UNSUPPORTED').map(metric => <div key={metric.metric} className="api-metric"><span>{names[metric.metric] ?? metric.metric}</span><strong>{metric.value == null ? '—' : `${metric.value.toFixed(1)} ${metric.unit === 'load' ? '' : metric.unit}`}<small>{statuses[metric.status] ?? metric.status}</small></strong></div>)}</>
}
