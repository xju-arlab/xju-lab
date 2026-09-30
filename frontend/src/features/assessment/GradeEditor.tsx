import { useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ComboBox } from '../../components/common/ComboBox'
import { dateText } from '../../lib/date'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { rubricScore, validScore } from './scoring'
import type { Exam, Grade, GradeStatus, Student } from './types'

export function GradeEditor({ exam, students, initialStudentId, onClose, onSave }: { exam: Exam; students: Student[]; initialStudentId?: string; onClose: () => void; onSave: (grade: Grade) => void }) {
  const [studentId, setStudentId] = useState(initialStudentId ?? students[0].id)
  const original = exam.grades.find(grade => grade.studentId === studentId)
  const [status, setStatus] = useState<GradeStatus>(original?.status ?? 'pending')
  const [mode, setMode] = useState('total')
  const [total, setTotal] = useState(original?.score === null || original?.score === undefined ? '' : original.score.toFixed(2))
  const [parts, setParts] = useState<Record<string, string>>(() => Object.fromEntries(exam.criteria.map(item => [item.id, original?.parts?.[item.id]?.toString() ?? ''])))
  const [note, setNote] = useState(original?.note ?? '')
  const [error, setError] = useState('')
  function changeStudent(id: string) {
    const grade = exam.grades.find(item => item.studentId === id)
    setStudentId(id); setStatus(grade?.status ?? 'pending'); setMode('total')
    setTotal(grade?.score === null || grade?.score === undefined ? '' : grade.score.toFixed(2))
    setParts(Object.fromEntries(exam.criteria.map(item => [item.id, grade?.parts?.[item.id]?.toString() ?? ''])))
    setNote(grade?.note ?? ''); setError('')
  }
  const numericParts = Object.fromEntries(Object.entries(parts).map(([id, value]) => [id, value.trim() ? Number(value) : NaN]))
  const preview = mode === 'parts' ? rubricScore(numericParts, exam.criteria) : total.trim() ? Number(total) : null
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === 'graded' && !validScore(preview)) { setError('请填写完整的 0–100 分成绩，0 分也是有效成绩。'); return }
    onSave({ studentId, status, score: status === 'graded' ? preview : null, ...(status === 'graded' && mode === 'parts' ? { parts: numericParts } : {}), note: note.trim() })
    onClose()
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="lab-dialog growth-dialog"><DialogTitle>录入考核成绩</DialogTitle><DialogDescription>{exam.title} · {dateText(exam.date)} · 仅保存在本浏览器的演示数据中</DialogDescription>
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>学生</span><ComboBox value={studentId} onValueChange={changeStudent} options={students.map(student => ({ value: student.id, label: `${student.name} · ${student.number}` }))} /></label>
      <div className="growth-form-row"><label className="field"><span>成绩状态</span><ComboBox value={status} onValueChange={value => { setStatus(value as GradeStatus); setError('') }} options={[{ value: 'graded', label: '已评分' }, { value: 'pending', label: '待评分' }, { value: 'absent', label: '缺考' }, { value: 'exempt', label: '免考' }]} /></label>
        <label className="field"><span>录入方式</span><ComboBox value={mode} onValueChange={setMode} disabled={status !== 'graded'} options={[{ value: 'total', label: '直接录入总分' }, { value: 'parts', label: '按分项加权' }]} /></label></div>
      {status === 'graded' && (mode === 'total' ? <label className="field"><span>当次总分 / 100</span><input aria-label="当次总分" type="number" min="0" max="100" step="0.01" required value={total} onChange={event => setTotal(event.target.value)} placeholder="0–100" /></label> : <div className="growth-grade-fields">{exam.criteria.map(item => <label className="field" key={item.id}><span>{item.label} · {item.weight * 100}%</span><input type="number" min="0" max="100" step="0.01" required aria-label={item.label} value={parts[item.id]} onChange={event => setParts(previous => ({ ...previous, [item.id]: event.target.value }))} placeholder="每项 0–100 分" /></label>)}</div>)}
      <label className="field"><span>评语 / 状态说明</span><textarea value={note} maxLength={500} rows={3} onChange={event => setNote(event.target.value)} placeholder="记录评分依据或缺考、免考原因" /></label>
      {error && <p className="growth-error" role="alert">{error}</p>}
      <div className="growth-form-footer"><span>{status === 'graded' ? validScore(preview) ? `当次成绩 ${preview.toFixed(2)} / 100` : '请填写完整的 0–100 分成绩' : '未评分状态不按 0 分计算'}</span><Button type="submit"><Save />保存成绩</Button></div>
    </form>
  </DialogContent></Dialog>
}
