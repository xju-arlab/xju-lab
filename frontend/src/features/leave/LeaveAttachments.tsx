import { useRef, useState } from 'react'
import { FileText, Paperclip, UploadCloud, X } from 'lucide-react'
import './leave-attachments.css'

const extensions = 'jpg jpeg png gif webp bmp tif tiff heic heif avif pdf doc docx xls xlsx ppt pptx odt ods odp rtf wps et dps txt csv md zip 7z rar'.split(' ')
const accept = extensions.map(ext => `.${ext}`).join(',')
export type LeaveAttachment = { id: string; filename: string; byteSize: number }
function sizeText(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.ceil(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB` }

export function LeaveAttachmentPicker({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  function add(incoming: File[]) {
    if (disabled) return
    const next = [...files]
    for (const file of incoming) {
      if (!next.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file)
    }
    if (next.some(file => !extensions.includes(file.name.split('.').at(-1)?.toLowerCase() ?? ''))) { setError('请选择图片、PDF、Office 文档、文本或压缩包。'); return }
    if (next.some(file => !file.size)) { setError('不能上传空文件。'); return }
    if (next.length > 5 || next.some(file => file.size > 10 * 1024 * 1024) || next.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) { setError('最多 5 个附件，单个最多 10 MB，合计最多 25 MB。'); return }
    setError(''); onChange(next)
  }
  return <div className="leave-attachments-field">
    <span className="leave-attachments-label">附件</span>
    <input ref={input} aria-label="选择请假附件" type="file" multiple accept={accept} hidden disabled={disabled} onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <button type="button" className={`leave-dropzone${dragging ? ' is-dragging' : ''}`} disabled={disabled} onClick={() => input.current?.click()}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); add(Array.from(event.dataTransfer.files)) }}>
      <UploadCloud size={22} /><strong>拖拽文件到此处，或点击上传</strong><span>图片、PDF、Office 文档、文本、压缩包</span><small>最多 5 个 · 单个 10 MB · 合计 25 MB</small>
    </button>
    {error && <p className="api-error-text" role="alert">{error}</p>}
    {files.length > 0 && <ul className="leave-attachment-list">{files.map((file, index) => <li key={`${file.name}-${index}`}><FileText size={16} /><span>{file.name}<small>{sizeText(file.size)}</small></span><button type="button" disabled={disabled} aria-label={`移除 ${file.name}`} onClick={() => { setError(''); onChange(files.filter((_, i) => i !== index)) }}><X size={16} /></button></li>)}</ul>}
  </div>
}

export function LeaveAttachmentLinks({ leaveId, attachments }: { leaveId: string; attachments?: LeaveAttachment[] }) {
  if (!attachments?.length) return null
  return <ul className="leave-saved-attachments" aria-label="申请附件">{attachments.map(file => <li key={file.id}><a href={`/api/v1/leaves/${encodeURIComponent(leaveId)}/attachments/${encodeURIComponent(file.id)}`} download={file.filename}><Paperclip size={14} /><span>{file.filename}</span><small>{sizeText(file.byteSize)}</small></a></li>)}</ul>
}
