import { useState, type FormEvent } from 'react'
import { Link2, Upload } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { parseOjContestLink, type OjContestLink } from './ojImport'

export function OjImportDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [recognized, setRecognized] = useState<OjContestLink | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const link = parseOjContestLink(url)
    if (!link) {
      setError('请粘贴 oj.icthub.top 的 HTTPS 比赛或排行榜链接。')
      setRecognized(null)
      return
    }
    setError('')
    setRecognized(link)
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="lab-dialog growth-dialog">
      <DialogTitle>导入算法成绩</DialogTitle>
      <DialogDescription>管理员粘贴 OJ 比赛或排行榜链接，即可导入该场成绩。</DialogDescription>
      <form className="form-stack" onSubmit={submit} noValidate>
        <label className="field"><span>OJ 比赛链接</span><input type="url" inputMode="url" autoComplete="off" required maxLength={2048} value={url} aria-invalid={!!error} aria-describedby={error ? 'oj-import-error' : 'oj-import-help'} onChange={event => { setUrl(event.target.value); setError(''); setRecognized(null) }} placeholder="https://oj.icthub.top/contest/13/rank" /></label>
        <p className="growth-footnote" id="oj-import-help"><Link2 size={14} />支持比赛主页和排行榜链接，无需上传成绩文件。</p>
        {error && <p className="growth-error" id="oj-import-error" role="alert">{error}</p>}
        {recognized && <div className="growth-import-result" role="status"><strong>已识别比赛 {recognized.contestId}</strong><span>{recognized.canonicalUrl}</span><p>当前为前端原型，成绩导入服务尚未接入，尚未导入任何成绩。</p></div>}
        <div className="growth-form-footer"><span>管理员功能 · 当前仅演示链接校验</span><Button type="submit" disabled={!!recognized}><Upload />导入成绩</Button></div>
      </form>
    </DialogContent>
  </Dialog>
}
