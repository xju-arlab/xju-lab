import { useEffect, useRef, useState, type FormEvent } from 'react'
import { apiRequest } from '../../api/client'
import { useQuery } from '../../api/useQuery'
import type { components } from '../../api/openapi'
import { Button } from '../../components/ui/button'
import { ComboBox } from '../../components/common/ComboBox'
import { QueryFeedback } from '../../components/common/QueryFeedback'
import { dateText } from '../../lib/date'
import './hongqingting.css'

type Config = components['schemas']['HongqingtingConfiguration']
type Batch = components['schemas']['HongqingtingBatch']
type Summary = components['schemas']['HongqingtingSummary']
type BatchPage = components['schemas']['HongqingtingBatchPage']
const base = '/admin/hongqingting'
const statuses: Record<string, string> = {
  QUEUED: '排队中', RUNNING: '进行中', COMPLETED: '发送完成', CANCELLED: '已停止',
  FAILED: '已失败', UNKNOWN: '结果待核实', PENDING: '待发送', SENDING: '发送中', RECEIVED: '已收到响应',
}
const active = (batch: Batch) => batch.status === 'QUEUED' || batch.status === 'RUNNING'
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '请求失败，请稍后重试。'

export function HongqingtingPanel() {
  const config = useQuery<Config>(`${base}/configuration`)
  const [page, setPage] = useState(1)
  const history = useQuery<BatchPage>(`${base}/batches?page=${page}&pageSize=5`)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryStudent, setSummaryStudent] = useState('')
  const [querying, setQuerying] = useState(false)
  const [queryError, setQueryError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [stopping, setStopping] = useState<string | null>(null)
  const pendingRequest = useRef<{ fingerprint: string; key: string } | null>(null)
  const submissionLock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const running = history.data?.items.some(active)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') history.reload() }, 2500)
    return () => window.clearInterval(timer)
  }, [running, history.reload])

  async function query(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (querying) return
    const studentNo = String(new FormData(event.currentTarget).get('studentNo') ?? '').trim()
    setQuerying(true); setSummary(null); setQueryError(''); setSummaryStudent(studentNo)
    try {
      const result = await apiRequest<Summary>(`${base}/summary`, { method: 'POST', body: { studentNo }, signal: AbortSignal.timeout(35_000) })
      if (mounted.current) setSummary(result)
    } catch (error) { if (mounted.current) setQueryError(errorMessage(error)) }
    finally { if (mounted.current) setQuerying(false) }
  }
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current) return
    const form = new FormData(event.currentTarget)
    const body = { studentNo: String(form.get('studentNo') ?? '').trim(), track: String(form.get('track')), days: Number(form.get('days')), dailyOffset: Number(form.get('dailyOffset')) }
    const fingerprint = JSON.stringify(body)
    if (pendingRequest.current?.fingerprint !== fingerprint) pendingRequest.current = { fingerprint, key: crypto.randomUUID() }
    submissionLock.current = true; setSubmitting(true); setNotice('')
    try {
      await apiRequest<Batch>(`${base}/batches`, { method: 'POST', headers: { 'Idempotency-Key': pendingRequest.current.key }, body, signal: AbortSignal.timeout(15_000) })
      if (mounted.current) { setNotice('任务已保存，后台将依次发送。刷新或离开页面不影响进度。'); setPage(1) }
      pendingRequest.current = null
    } catch (error) { if (mounted.current) setNotice(`${errorMessage(error)} 请先查看任务记录；相同表单重试会复用本次请求标识。`) }
    finally { submissionLock.current = false; if (mounted.current) { setSubmitting(false); history.reload() } }
  }
  async function cancel(batch: Batch) {
    setStopping(batch.id); setNotice('')
    try {
      const result = await apiRequest<Batch>(`${base}/batches/${batch.id}/cancel`, { method: 'POST', headers: { 'If-Match-Version': String(batch.version) } })
      if (mounted.current) setNotice(active(result) ? '已停止后续发送，正在等待当前请求结束。' : '任务已停止。')
    } catch (error) { if (mounted.current) setNotice(errorMessage(error)) }
    finally { if (mounted.current) { setStopping(null); history.reload() } }
  }

  const enabled = config.data?.configured === true
  return <div className="hongqingting-panel">
    <QueryFeedback loading={config.loading} error={config.error} retry={config.reload} />
    {config.data && <p className="api-note" role="status">{enabled ? '使用当前管理员账号，无需额外密钥。' : '红蜻蜓尚未接入，请由运维完成服务端配置。'}</p>}
    <div className="api-two-col">
      <section className="panel api-panel api-form-panel" aria-labelledby="runner-summary-title">
        <h2 id="runner-summary-title">查询跑步里程</h2>
        <p className="api-note">当前接口只返回汇总，未提供所属学期，暂不能按学期筛选。请在<a href="https://zhty.xju.edu.cn/main.php?module=stu&title=stu_sun_score" target="_blank" rel="noopener noreferrer">官方成绩页</a>核对学年和学期。</p>
        <form className="form-stack" onSubmit={query}>
          <label className="field"><span>查询学号</span><input name="studentNo" inputMode="numeric" pattern="[0-9]{5,32}" minLength={5} maxLength={32} placeholder="请输入学号" required disabled={querying} /></label>
          <Button type="submit" disabled={!enabled || querying}>{querying ? '查询中…' : '查询里程'}</Button>
        </form>
        {queryError && <p className="api-error" role="alert">{queryError}</p>}
        {summary && <div className="runner-summary" role="status"><span>{summaryStudent} · 学期未返回</span><strong>{summary.distanceKm == null ? '未返回里程' : `${summary.distanceKm} 公里`}</strong>{summary.lastRunAt && <small>查询时间：{dateText(summary.lastRunAt)}</small>}<p>{summary.message || '上游未返回说明。'}</p></div>}
      </section>
      <section className="panel api-panel api-form-panel" aria-labelledby="runner-upload-title">
        <h2 id="runner-upload-title">批量上传跑步数据</h2>
        <form className="form-stack" onSubmit={start}>
          <label className="field"><span>上传学号</span><input name="studentNo" inputMode="numeric" pattern="[0-9]{5,32}" minLength={5} maxLength={32} placeholder="请输入学号" required disabled={submitting} /></label>
          <label className="field"><span>轨迹</span><ComboBox name="track" defaultValue="location_1_6km" options={(config.data?.tracks ?? []).filter(track => track.available).map(track => ({ value: track.id, label: track.label }))} required disabled={!enabled || submitting} /></label>
          <div className="runner-fields"><label className="field"><span>上传天数</span><input name="days" type="number" min={1} max={config.data?.maxDays ?? 90} step={1} defaultValue={30} required disabled={submitting} /></label><label className="field"><span>每天偏移（天）</span><input name="dailyOffset" type="number" min={-0.9} max={0.9} step={0.1} defaultValue={0.3} required disabled={submitting} /></label></div>
          <p className="api-note">每天发送一次，从第 0 天向前推算；正偏移会把时间后移，0.3 天为 7.2 小时，第 0 天可能落在未来。当前仅开放 1.6 公里轨迹，其余轨迹尚未验证。</p>
          <Button type="submit" disabled={!enabled || submitting}>{submitting ? '正在保存任务…' : '开始上传'}</Button>
        </form>
      </section>
    </div>
    {notice && <p className="api-feedback" role="status">{notice}</p>}
    <section className="panel api-panel" aria-labelledby="runner-history-title">
      <div className="section-heading"><h2 id="runner-history-title">我的任务记录</h2><Button variant="outline" onClick={history.reload}>刷新记录</Button></div>
      <p className="api-note">“已收到响应”表示上游已回复，实际计入里程请查询确认。结果待核实的请求不会自动重发；停止仅取消尚未发送的记录。</p>
      <QueryFeedback loading={history.loading} error={history.error} retry={history.reload} />
      {history.data?.items.length === 0 && <p className="api-empty">暂无上传任务。</p>}
      {history.data?.items.map(batch => {
        const done = batch.runs.filter(run => !['PENDING', 'SENDING'].includes(run.status)).length
        const received = batch.runs.filter(run => run.status === 'RECEIVED').length
        return <article className="runner-batch" key={batch.id}>
          <div className="section-heading"><div><strong>{batch.studentNo} · 1.6 公里 × {batch.days} 天</strong><p className="api-note">{dateText(batch.createdAt)} · {batch.cancelRequested && active(batch) ? '正在停止' : statuses[batch.status]}</p></div>{active(batch) && <Button variant="outline" disabled={batch.cancelRequested || stopping === batch.id} onClick={() => void cancel(batch)}>{batch.cancelRequested ? '正在停止…' : '停止任务'}</Button>}</div>
          <progress aria-label={`${batch.studentNo} 上传进度`} max={batch.days} value={done} />
          <p className="api-note">已处理 {done} / {batch.days} · 已收到响应 {received}</p>
          <details><summary>查看逐条结果</summary><ol className="runner-results">{batch.runs.map(run => <li key={run.id}><span>第 {run.ordinal + 1} 次 · {statuses[run.status]}</span>{run.message && <small>{run.message}</small>}</li>)}</ol></details>
        </article>
      })}
      {history.data && history.data.total > 5 && <div className="api-actions"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><span>第 {page} 页</span><Button variant="outline" disabled={page * 5 >= history.data.total} onClick={() => setPage(page + 1)}>下一页</Button></div>}
    </section>
  </div>
}
