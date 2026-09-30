import { useState, type FormEvent } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { apiRequest } from '../../api/client'
import './projects.css'

type Mode = 'GITHUB' | 'BAIDU'
const fields: Record<Mode, { key: string; label: string; placeholder: string }[]> = {
  GITHUB: [{ key: 'github', label: 'GitHub 链接', placeholder: 'https://github.com/…' }, { key: 'huggingFace', label: 'HuggingFace 链接', placeholder: 'https://huggingface.co/…' }],
  BAIDU: [{ key: 'deliverables', label: '作品与答辩材料', placeholder: 'https://pan.baidu.com/s/…' }, { key: 'sources', label: '素材与源码', placeholder: 'https://pan.baidu.com/s/…' }, { key: 'documents', label: '设计与开发文档', placeholder: 'https://pan.baidu.com/s/…' }, { key: 'video', label: '作品展示视频', placeholder: 'https://pan.baidu.com/s/…' }],
}

export function ProjectCreateForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('GITHUB')
  const [links, setLinks] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const form = event.currentTarget, data = new FormData(form)
    setBusy(true); setError('')
    try {
      await apiRequest('/projects', { method: 'POST', body: { title: data.get('title'), description: data.get('description'), resourceMode: mode, resourceLinks: Object.fromEntries(fields[mode].map(field => [field.key, links[field.key]?.trim() ?? ''])) } })
      form.reset(); setLinks({}); setMode('GITHUB'); onCreated()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '创建失败，请重试。') }
    finally { setBusy(false) }
  }
  return <div className="api-create project-create">
    <div className="project-create-heading"><button type="button" className="project-create-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}><ChevronDown size={15} className={open ? 'is-open' : ''} />新建项目</button><div className={`project-mode-switch${mode === 'BAIDU' ? ' is-baidu' : ''}`} role="group" aria-label="项目资源类型"><span aria-hidden="true" /><button type="button" disabled={busy} aria-pressed={mode === 'GITHUB'} onClick={() => { setMode('GITHUB'); setOpen(true); setError('') }}>GitHub</button><button type="button" disabled={busy} aria-pressed={mode === 'BAIDU'} onClick={() => { setMode('BAIDU'); setOpen(true); setError('') }}>百度网盘</button></div></div>
    <form className="form-stack" hidden={!open} onSubmit={submit}>
      <label className="field"><span>项目名称</span><input name="title" required maxLength={160} disabled={busy} /></label>
      <label className="field"><span>项目简介</span><input name="description" maxLength={2000} disabled={busy} /></label>
      {fields[mode].map(field => <label className="field" key={field.key}><span>{field.label}</span><input type="url" name={field.key} value={links[field.key] ?? ''} placeholder={field.placeholder} maxLength={2048} disabled={busy} onChange={event => setLinks(values => ({ ...values, [field.key]: event.target.value }))} /></label>)}
      {error && <p className="api-error-text" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? '正在创建…' : '创建项目'}</button>
    </form>
  </div>
}

export function ProjectResourceLinks({ mode = 'GITHUB', links = {} }: { mode?: string; links?: Record<string, string> }) {
  const visible = (fields[mode as Mode] ?? fields.GITHUB).filter(field => links[field.key])
  if (!visible.length) return null
  return <div className="project-resource-links" aria-label="项目资源">{visible.map(field => <a key={field.key} href={links[field.key]} target="_blank" rel="noopener noreferrer"><span>{field.label}</span><ExternalLink size={13} /></a>)}</div>
}
