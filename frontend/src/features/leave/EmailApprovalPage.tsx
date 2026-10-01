import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, LoaderCircle } from 'lucide-react'
import { apiRequest } from '../../api/client'
import { leaveTimeText } from '../../lib/date'
import type { components } from '../../api/openapi'
import { LeaveAttachmentLinks } from './LeaveAttachments'
import './email-approval.css'

type Preview = components['schemas']['EmailApprovalPreview']
export function EmailApprovalPage() {
  const navigate = useNavigate()
  const opening = useRef<Promise<Preview>>()
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED')
  const [reason, setReason] = useState('')
  const [result, setResult] = useState('')
  useEffect(() => {
    let active = true
    opening.current ??= (async () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1))
      const query = new URLSearchParams(window.location.search)
      const token = fragment.get('token') ?? query.get('token')
      if (token) {
        await apiRequest('/leaves/email-action/context', { method: 'POST', body: { token } })
        navigate(window.location.pathname, { replace: true })
      }
      // Opening and reloading only preview; a deliberate submit is required below.
      return apiRequest<Preview>('/leaves/email-action', { cache: 'no-store' })
    })()
    void opening.current.then(data => { if (active) setPreview(data) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : '暂时无法读取申请，请重新打开邮件。') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function confirm(event: FormEvent) {
    event.preventDefault()
    if (!preview || busy || result) return
    setBusy(true); setError('')
    try {
      const response = await apiRequest<Preview>('/leaves/email-action', { method: 'POST', body: { applicationId: preview.applicationId, version: preview.version, decision, reason } })
      setResult(response.status === 'APPROVED' ? '申请已批准' : '申请已驳回')
    } catch (err) { setError(err instanceof Error ? err.message : '提交失败，请稍后重试。') }
    finally { setBusy(false) }
  }
  return <main className="api-auth-screen"><section className="api-auth-card email-approval-card api-page-enter">
    <div className="email-approval-brand"><img src="/brand/lab-seal.png" width="40" height="40" alt="" /><span className="eyebrow">算法与科研实验室</span></div>
    <h1>请假审批</h1>
    {loading && <p role="status"><LoaderCircle size={16} className="api-loading-spinner" /> 正在读取申请…</p>}
    {result ? <div className="email-approval-result" role="status"><Check size={28} /><h2>{result}</h2><p>处理结果已保存，申请人将收到结果通知。</p></div> : preview && <>
      <dl className="email-approval-details"><div><dt>申请人</dt><dd>{preview.memberName}</dd></div><div><dt>请假时间</dt><dd className="email-approval-time">{leaveTimeText(preview.startsAt)} — {leaveTimeText(preview.endsAt)}</dd></div><div><dt>请假原因</dt><dd>{preview.reason}</dd></div></dl>
      <LeaveAttachmentLinks leaveId={preview.applicationId} attachments={preview.attachments} basePath={`/api/v1/leaves/email-action/attachments/${encodeURIComponent(preview.applicationId)}`} />
      <form onSubmit={confirm}>
        <fieldset disabled={busy}><legend>处理结果</legend><div className="email-approval-choices"><label><input type="radio" name="decision" checked={decision === 'APPROVED'} onChange={() => setDecision('APPROVED')} />批准</label><label><input type="radio" name="decision" checked={decision === 'REJECTED'} onChange={() => setDecision('REJECTED')} />驳回</label></div>
          {decision === 'REJECTED' && <label className="field"><span>驳回原因 <span aria-hidden="true">*</span></span><textarea required maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></label>}
          <div className="email-approval-actions"><button type="submit" className="button button-primary" disabled={busy}>{busy ? <><LoaderCircle size={16} className="api-loading-spinner" />正在提交…</> : decision === 'APPROVED' ? '确认批准' : '确认驳回'}</button><Link to="/app/leave">前往请假页面</Link></div>
        </fieldset>
      </form>
    </>}
    {error && <p className="api-error-text" role="alert">{error}</p>}
    {(result || !preview) && <Link className="api-auth-public" to="/app/leave">前往请假页面</Link>}
  </section></main>
}
