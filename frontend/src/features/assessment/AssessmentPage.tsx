import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Download, FilePenLine, History, Info, Search, Trophy, Upload, Users } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ComboBox } from '../../components/common/ComboBox'
import { dateText } from '../../lib/date'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog'
import { contests, exams as initialExams, students as initialStudents, theoryStudents } from './demo'
import { buildAcmRanking, buildTheoryRanking, gradeValue, validScore, type AcmRow, type TheoryRow } from './scoring'
import { GradeEditor } from './GradeEditor'
import { OjImportDialog } from './OjImportDialog'
import type { Grade, GradeStatus, HistoryScope } from './types'
import './assessment.css'

const STORAGE_KEY = 'xju-lab.assessment.v2'
const historyScope: HistoryScope = 'combined'
type Saved = { grades: Record<string, Record<string, Grade>>; veterans: Record<string, boolean> }
const gradeLabels: Record<GradeStatus, string> = { graded: '已评分', pending: '待评分', absent: '缺考', exempt: '免考' }
const kindLabel = (kind: string) => kind === 'written' ? '笔试' : '机试'
const valueText = (value: number | null | undefined) => value === null || value === undefined ? '—' : value.toFixed(2)
const scoreLabel = (grade?: Grade) => gradeValue(grade) === null ? gradeLabels[grade?.status ?? 'pending'] : valueText(grade!.score)
const matches = (query: string, student: { name: string; number: string; handle: string }) => `${student.name} ${student.number} ${student.handle}`.toLowerCase().includes(query.trim().toLowerCase())
function restore(): Saved {
  const clean: Saved = { grades: {}, veterans: {} }
  try {
    if (typeof window === 'undefined') return clean
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    for (const student of initialStudents) if (typeof raw?.veterans?.[student.id] === 'boolean') clean.veterans[student.id] = raw.veterans[student.id]
    for (const exam of initialExams) for (const student of theoryStudents) {
      const grade = raw?.grades?.[exam.id]?.[student.id]
      if (!grade || !['graded', 'pending', 'absent', 'exempt'].includes(grade.status) || (grade.status === 'graded' && !validScore(grade.score))) continue
      const parts = grade.parts && exam.criteria.every(item => validScore(grade.parts[item.id])) ? Object.fromEntries(exam.criteria.map(item => [item.id, grade.parts[item.id]])) : undefined
      ;(clean.grades[exam.id] ??= {})[student.id] = { studentId: student.id, status: grade.status, score: grade.status === 'graded' ? grade.score : null, parts, note: typeof grade.note === 'string' ? grade.note.slice(0, 500) : '' }
    }
  } catch { /* Ignore incompatible or corrupt prototype state. */ }
  return clean
}
function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: string }) { return <span className={`tag tag-${tone}`}>{children}</span> }
function Rank({ value }: { value: number | null }) { return <span className={`growth-rank ${value && value <= 3 ? 'growth-rank-top' : ''}`}>{value ?? '—'}</span> }
function WeightNote({ acm = false }: { acm?: boolean }) { return <div className="growth-weight-note"><History size={15} /><span>历史{acm ? '排名分' : '成绩'}均值 <b>25%</b><span className="growth-plus">+</span>当次{acm ? '排名分' : '成绩'} <b>75%</b></span></div> }
function Summary({ values }: { values: { label: string; value: string | number; suffix?: string; detail: string }[] }) { return <div className="growth-summary">{values.map(item => <section key={item.label}><span>{item.label}</span><strong>{item.value}<small>{item.suffix}</small></strong><p>{item.detail}</p></section>)}</div> }
function exportCsv(rows: (string | number)[][], filename: string) {
  const content = '\uFEFF' + rows.map(row => row.map(value => { let text = String(value); if (/^[=+@\-\t\r]/.test(text)) text = "'" + text; return `"${text.replaceAll('"', '""')}"` }).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function AssessmentPage({ onNotice }: { onNotice: (message: string) => void }) {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'theory' ? 'theory' : 'acm'
  const [saved, setSaved] = useState<Saved>(restore)
  const [storageFailed, setStorageFailed] = useState(false)
  const [contestId, setContestId] = useState(contests.at(-1)!.id)
  const [examId, setExamId] = useState(initialExams.at(-1)!.id)
  const [excludeVeterans, setExcludeVeterans] = useState(true)
  const [rankView, setRankView] = useState<'current' | 'history'>('current')
  const [importOpen, setImportOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rules, setRules] = useState(false)
  const [groups, setGroups] = useState(false)
  const [detail, setDetail] = useState<{ type: 'acm' | 'theory'; studentId: string } | null>(null)
  const [edit, setEdit] = useState<{ studentId?: string } | null>(null)
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); setStorageFailed(false) } catch { setStorageFailed(true) } }, [saved])
  const students = initialStudents.map(student => ({ ...student, veteran: saved.veterans[student.id] ?? student.veteran }))
  const exams = initialExams.map(exam => ({ ...exam, grades: exam.grades.map(grade => saved.grades[exam.id]?.[grade.studentId] ?? grade) }))
  const currentContest = contests.find(item => item.id === contestId)!
  const currentExam = exams.find(item => item.id === examId)!
  const acmRows = buildAcmRanking(contests, currentContest, students, excludeVeterans)
  const theoryRows = buildTheoryRanking(exams, currentExam, theoryStudents, historyScope)
  const shownAcm = (rankView === 'current' ? [...acmRows].sort((a, b) => (a.current?.rank ?? Infinity) - (b.current?.rank ?? Infinity) || a.student.number.localeCompare(b.student.number)) : acmRows).filter(row => matches(query, row.student))
  const shownTheory = (rankView === 'current' ? [...theoryRows].sort((a, b) => (a.currentRank ?? Infinity) - (b.currentRank ?? Infinity) || a.student.number.localeCompare(b.student.number)) : theoryRows).filter(row => matches(query, row.student))
  const detailRow = detail?.type === 'acm' ? acmRows.find(row => row.student.id === detail.studentId) : theoryRows.find(row => row.student.id === detail?.studentId)
  const scored = theoryRows.filter(row => row.currentScore !== null)
  const average = scored.length ? scored.reduce((total, row) => total + row.currentScore!, 0) / scored.length : null
  const previousCount = contests.filter(item => item.term === currentContest.term && item.date < currentContest.date).length
  function switchTab(value: string) { const next = new URLSearchParams(params); next.set('tab', value); setParams(next, { replace: true }); setQuery(''); setDetail(null) }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 'acm' : event.key === 'End' ? 'theory' : tab === 'acm' ? 'theory' : 'acm'
    switchTab(next); document.getElementById(`growth-tab-${next}`)?.focus()
  }
  function download() {
    if (tab === 'acm') exportCsv([['显示范围', '排名口径', '排名', '本次排名', '综合排名', '学号', '姓名', 'OJ 账号', '参赛人数', 'AC', '罚时秒', '当次排名分', '历史均分', '有效历史场次', '综合分'], ...shownAcm.map(row => [excludeVeterans ? '过滤老成员' : '全部成员', rankView === 'current' ? '本次排名' : '历史排名', (rankView === 'current' ? row.current?.rank : row.overallRank) ?? '', row.current?.rank ?? '', row.overallRank ?? '', row.student.number, row.student.name, row.student.handle, row.current?.count ?? '', row.current?.solved ?? '', row.current?.penalty ?? '', valueText(row.current?.points), valueText(row.historyAverage), row.historyCount, valueText(row.composite)])], `${currentContest.id}-${rankView}-演示.csv`)
    else exportCsv([['考核', '类型', '排名口径', '排名', '本次排名', '综合排名', '学号', '姓名', '状态', '当次成绩', '历史均分', '有效历史次数', '综合分'], ...shownTheory.map(row => [currentExam.title, kindLabel(currentExam.kind), rankView === 'current' ? '本次排名' : '历史排名', (rankView === 'current' ? row.currentRank : row.overallRank) ?? '', row.currentRank ?? '', row.overallRank ?? '', row.student.number, row.student.name, gradeLabels[row.grade?.status ?? 'pending'], valueText(row.currentScore), valueText(row.historyAverage), row.historyCount, valueText(row.composite)])], `${currentExam.id}-${rankView}-演示成绩.csv`)
    onNotice('已导出当前筛选结果（演示数据）')
  }
  function saveGrade(grade: Grade) { setSaved(previous => ({ ...previous, grades: { ...previous.grades, [examId]: { ...previous.grades[examId], [grade.studentId]: grade } } })); onNotice('演示成绩已更新，综合分已重新计算') }

  return <div className="growth-page">
    <div className="page-heading"><div><h1>成长与考核</h1><p>从每次训练与考核中，看见进步。</p></div><div className="heading-actions"><Button variant="outline" onClick={() => setRules(true)}><Info />计算规则</Button><Button variant="outline" onClick={download}><Download />导出成绩</Button></div></div>
    <div className="growth-tabs" role="tablist" aria-label="考核类型">{[{ id: 'acm', title: 'ACM 算法', Icon: Trophy }, { id: 'theory', title: '深度学习理论基础', Icon: BookOpen }].map(({ id, title, Icon }) => <button key={id} id={`growth-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`growth-panel-${id}`} tabIndex={tab === id ? 0 : -1} onKeyDown={tabKey} onClick={() => switchTab(id)}><Icon size={17} />{title}</button>)}</div>
    {storageFailed && <p className="growth-error" role="alert">浏览器存储不可用，当前修改仅在本页会话保留。</p>}
    <section role="tabpanel" id={`growth-panel-${tab}`} aria-labelledby={`growth-tab-${tab}`}>
      <div className="growth-intro"><div><Badge tone={tab === 'acm' ? 'teal' : 'purple'}>{tab === 'acm' ? 'ALGORITHM' : 'DEEP LEARNING'}</Badge><h2>{tab === 'acm' ? '以赛促练，持续积累' : '理解原理，也动手验证'}</h2><p>{tab === 'acm' ? '按解题数与罚时查看比赛表现，通过历史综合榜追踪长期进步。' : '笔试与机试均为百分制，保留每次成绩与评分依据。'}</p></div><WeightNote acm={tab === 'acm'} /></div>
      {tab === 'acm' ? <>
        <div className="growth-controls"><label className="field growth-event-select"><span>本次比赛</span><ComboBox value={contestId} onValueChange={value => { setContestId(value); setDetail(null) }} options={[...contests].reverse().map(item => ({ value: item.id, label: `${dateText(item.date)} · ${item.title}` }))} /></label><div className="growth-controls-end"><label className="growth-check"><input type="checkbox" checked={excludeVeterans} onChange={event => setExcludeVeterans(event.target.checked)} />过滤老成员<small>{students.filter(student => student.veteran).length}</small></label><Button variant="ghost" onClick={() => setGroups(true)}><Users />成员分组</Button><Button onClick={() => setImportOpen(true)}><Upload />导入成绩</Button><a href="https://oj.icthub.top/contest/13/rank" target="_blank" rel="noreferrer">查看 OJ 参考榜<ArrowUpRight size={14} /></a></div></div>
        <Summary values={[{ label: '当次参赛', value: acmRows.filter(row => row.current).length, suffix: '人', detail: excludeVeterans ? '已按新成员范围重新排名' : '当前展示全部成员' }, { label: '比赛题目', value: currentContest.problems.length, suffix: '题', detail: 'AC 优先，同解题数按罚时' }, { label: '历史比赛', value: previousCount, suffix: '场', detail: '同一培养期，且早于本次比赛' }, { label: '当次权重', value: '75', suffix: '%', detail: '历史排名分平均占 25%' }]} />
        <div className="panel growth-board"><div className="growth-board-toolbar"><RankingTabs value={rankView} onChange={setRankView} /><SearchBox value={query} onChange={setQuery} /></div>
          <div className="growth-table-scroll" role="region" aria-label={rankView === 'current' ? 'ACM 本次排名表' : 'ACM 历史排名表'} tabIndex={0}><table className="growth-table"><thead><tr><th scope="col">排名</th><th scope="col" className="growth-student-col">学生</th>{rankView === 'current' ? <><th scope="col">AC / 提交</th><th scope="col">罚时</th>{currentContest.problems.map(problem => <th scope="col" key={problem} className="growth-problem-col">{problem}</th>)}</> : <><th scope="col">当次名次</th><th scope="col">当次排名分 <small>75%</small></th><th scope="col">历史平均 <small>25%</small></th><th scope="col">历史场次</th><th scope="col">综合分</th></>}<th scope="col"><span className="sr-only">详情</span></th></tr></thead><tbody>{shownAcm.map(row => <tr key={row.student.id}><td><Rank value={rankView === 'current' ? row.current?.rank ?? null : row.overallRank} /></td><td><StudentCell student={row.student} showHandle onClick={() => setDetail({ type: 'acm', studentId: row.student.id })} /></td>{rankView === 'current' ? <><td className="growth-number"><b>{row.current?.solved ?? '—'}</b><span className="muted"> / {row.current?.submissions ?? '—'}</span></td><td className="growth-number">{row.current ? `${Math.floor(row.current.penalty / 60)} min` : '未参赛'}</td>{currentContest.problems.map(problem => { const result = row.current?.problems[problem]; return <td className="growth-problem-col" key={problem}>{result ? <div className={`growth-problem ${result.accepted ? result.first ? 'is-first' : 'is-ac' : 'is-wa'}`} title={`${problem}：${result.accepted ? `通过，用时 ${result.minutes} 分钟` : '尚未通过'}，错误 ${result.wrong} 次${result.first ? '，全场首解' : ''}`}><strong>{result.accepted ? result.wrong ? `+${result.wrong}` : '+' : `−${result.wrong}`}</strong>{result.accepted && <small>{result.minutes} min</small>}</div> : <span className="growth-unattempted">—</span>}</td> })}</> : <><td>{row.current ? `${row.current.tied ? '并列 ' : ''}${row.current.rank} / ${row.current.count}` : '未参赛'}</td><td className="growth-number">{valueText(row.current?.points)}</td><td className="growth-number">{valueText(row.historyAverage)}</td><td><span className="growth-history-count">{row.historyCount} / {row.historyTotal} 场</span>{!row.historyCount && row.current && <small className="growth-muted-line">首场按当次计算</small>}</td><td className="growth-composite">{valueText(row.composite)}</td></>}<td><button className="growth-link-button" aria-label={`查看${row.student.name}比赛记录`} onClick={() => setDetail({ type: 'acm', studentId: row.student.id })}><History size={15} /></button></td></tr>)}</tbody></table>{!shownAcm.length && <EmptyRows />}</div>
          <div className="growth-board-footer"><span>共 {shownAcm.length} 位成员 · 演示数据</span>{rankView === 'current' ? <div className="growth-legend"><i className="first" />首解<i className="ac" />通过<i className="wa" />未通过</div> : <span>先换算百分位排名分，再按 25% / 75% 加权；分值越高越靠前。</span>}</div>
        </div>
      </> : <>
        <div className="growth-controls"><label className="field growth-event-select"><span>本次考核</span><ComboBox value={examId} onValueChange={value => { setExamId(value); setDetail(null) }} options={[...exams].reverse().map(exam => ({ value: exam.id, label: `${dateText(exam.date)} · ${exam.title}` }))} /></label><div className="growth-controls-end"><div className="growth-exam-kind"><span>本场形式</span><Badge tone={currentExam.kind === 'written' ? 'purple' : 'teal'}>{kindLabel(currentExam.kind)}</Badge></div><Button onClick={() => setEdit({})}><FilePenLine />录入成绩</Button></div></div>
        <Summary values={[{ label: '已评分', value: scored.length, suffix: `/ ${theoryRows.length} 人`, detail: `${theoryRows.filter(row => row.grade?.status === 'pending').length} 人待评分 · ${theoryRows.filter(row => row.grade?.status === 'absent').length} 人缺考` }, { label: '当次平均', value: valueText(average), suffix: '/ 100', detail: '仅计入已评分成绩，包含有效 0 分' }, { label: '当次最高', value: scored.length ? valueText(Math.max(...scored.map(row => row.currentScore!))) : '—', suffix: '/ 100', detail: `${dateText(currentExam.date)} · ${kindLabel(currentExam.kind)}` }, { label: '历史考核', value: theoryRows[0]?.historyTotal ?? 0, suffix: '次', detail: historyScope === 'combined' ? '笔试、机试合并取有效成绩均值' : '仅同类考试的有效成绩' }]} />
        <div className="panel growth-board"><div className="growth-board-toolbar"><RankingTabs value={rankView} onChange={setRankView} /><SearchBox value={query} onChange={setQuery} /></div>
          <div className="growth-table-scroll" role="region" aria-label={rankView === 'current' ? '深度学习本次排名表' : '深度学习历史排名表'} tabIndex={0}>
            <table className="growth-table growth-theory-table"><thead><tr>
              <th scope="col">排名</th><th scope="col" className="growth-student-col">学生</th>
              {rankView === 'current' ? <>{currentExam.criteria.map(item => <th scope="col" key={item.id}>{item.label}<small>{item.weight * 100}%</small></th>)}<th scope="col" className="growth-divider-col">本次成绩<small>满分 100</small></th></> : <><th scope="col">本次名次</th><th scope="col">本次成绩<small>75%</small></th><th scope="col">历史平均<small>25%</small></th><th scope="col">历史场次</th><th scope="col">综合分</th></>}
              <th scope="col">记录</th>
            </tr></thead><tbody>{shownTheory.map(row => <tr key={row.student.id}>
              <td><Rank value={rankView === 'current' ? row.currentRank : row.overallRank} /></td><td><StudentCell student={row.student} onClick={() => setDetail({ type: 'theory', studentId: row.student.id })} /></td>
              {rankView === 'current' ? <>{currentExam.criteria.map(item => <td key={item.id} className="growth-number" title={row.grade?.parts ? `${item.label}满分 100，占本次 ${item.weight * 100}%` : '无分项记录；总分可能为直接录入'}>{row.grade?.status === 'graded' ? valueText(row.grade.parts?.[item.id]) : '—'}</td>)}<td className="growth-divider-col growth-number">{row.currentScore === null ? <Badge tone={row.grade?.status === 'absent' ? 'orange' : 'gray'}>{scoreLabel(row.grade)}</Badge> : <b>{valueText(row.currentScore)}</b>}</td></> : <>
                <td>{row.currentRank === null ? '—' : `${row.currentRank} / ${scored.length}`}</td><td className="growth-number">{row.currentScore === null ? <Badge tone={row.grade?.status === 'absent' ? 'orange' : 'gray'}>{scoreLabel(row.grade)}</Badge> : valueText(row.currentScore)}</td><td className="growth-number">{valueText(row.historyAverage)}</td><td><span className="growth-history-count">{row.historyCount} / {row.historyTotal} 场</span>{!row.historyCount && row.currentScore !== null && <small className="growth-muted-line">首场按本次计算</small>}</td><td className="growth-composite">{valueText(row.composite)}</td>
              </>}
              <td><button className="growth-link-button" aria-label={`查看${row.student.name}考核明细`} onClick={() => setDetail({ type: 'theory', studentId: row.student.id })}>明细<ArrowUpRight size={13} /></button></td>
            </tr>)}</tbody></table>{!shownTheory.length && <EmptyRows />}
          </div>
          <div className="growth-board-footer"><span>共 {shownTheory.length} 位成员 · 演示数据</span><span>{rankView === 'current' ? '仅按本场百分制成绩排名，同分并列。' : '历史有效成绩均值 × 25% + 本次成绩 × 75%，按综合分排名。'}</span><a href="https://dl.icthub.top/" target="_blank" rel="noreferrer">查看机试作品与评分参考<ArrowUpRight size={13} /></a></div>
        </div><p className="growth-footnote"><Info size={14} />每场只采用一种形式：笔试或机试。历史均分合并同一培养期此前两类考试；待评分、缺考与免考不自动记为 0 分。</p>
      </>}
    </section>
    {importOpen && <OjImportDialog onClose={() => setImportOpen(false)} />}
    <Rules open={rules} onClose={() => setRules(false)} />
    <Dialog open={groups} onOpenChange={setGroups}><DialogContent className="lab-dialog growth-dialog"><DialogTitle>成员分组</DialogTitle><DialogDescription>按明确标记过滤，不根据姓名或学号猜测。修改会重算当次及历史各场名次，仅保存到当前浏览器。</DialogDescription><div className="growth-group-list">{students.map(student => <label key={student.id}><span><strong>{student.name}</strong><small>{student.number}</small></span><span><input type="checkbox" checked={student.veteran} onChange={event => setSaved(previous => ({ ...previous, veterans: { ...previous.veterans, [student.id]: event.target.checked } }))} />老成员</span></label>)}</div></DialogContent></Dialog>
    <Dialog open={!!detail && !!detailRow} onOpenChange={open => { if (!open) setDetail(null) }}><DialogContent className="lab-dialog growth-dialog growth-detail-dialog"><DialogTitle>{detailRow?.student.name} · {detail?.type === 'acm' ? '比赛记录' : '考核明细'}</DialogTitle><DialogDescription>{detailRow?.student.number} · 截至所选场次的记录，不包含未来成绩</DialogDescription>{detailRow && <><div className="growth-detail-summary"><div><span>历史均分 · 25%</span><strong>{valueText(detailRow.historyAverage)}</strong></div><div><span>当次 · 75%</span><strong>{valueText(detail?.type === 'acm' ? (detailRow as AcmRow).current?.points : (detailRow as TheoryRow).currentScore)}</strong></div><div><span>综合分</span><strong>{valueText(detailRow.composite)}</strong></div></div><p className="growth-footnote">有效历史 {detailRow.historyCount} / {detailRow.historyTotal} 次。{!detailRow.historyCount ? '暂无有效历史时，综合分采用当次结果。' : '未参加或未评分的记录不按 0 分纳入历史均值。'}</p>{detail?.type === 'acm' ? <AcmHistory row={detailRow as AcmRow} /> : <><TheoryHistory row={detailRow as TheoryRow} /><div className="growth-review-note"><b>当次评语</b><p>{(detailRow as TheoryRow).grade?.note || '暂无评语。'}</p></div><Button variant="outline" onClick={() => { setEdit({ studentId: detailRow.student.id }); setDetail(null) }}><FilePenLine />编辑当次成绩</Button></>}</>}</DialogContent></Dialog>
    {edit && <GradeEditor key={`${examId}-${edit.studentId ?? 'new'}`} exam={currentExam} students={theoryStudents} initialStudentId={edit.studentId} onClose={() => setEdit(null)} onSave={saveGrade} />}
  </div>
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <label className="growth-search"><Search size={15} /><input type="search" aria-label="搜索姓名、学号或账号" placeholder="搜索姓名、学号或账号" value={value} onChange={event => onChange(event.target.value)} /></label> }
function StudentCell({ student, showHandle, onClick }: { student: { name: string; number: string; handle: string; veteran?: boolean }; showHandle?: boolean; onClick: () => void }) { return <button className="growth-student" onClick={onClick}><span className="growth-avatar">{student.name.slice(0, 1)}</span><span><strong>{student.name}{student.veteran && <Badge>老成员</Badge>}</strong><small>{showHandle ? student.handle : student.number}</small></span></button> }
function EmptyRows() { return <div className="empty-state"><Search size={22} /><h3>没有符合条件的成员</h3><p>调整搜索内容或成员范围后重试。</p></div> }
function AcmHistory({ row }: { row: AcmRow }) { return <div className="growth-table-scroll"><table className="growth-table growth-history-table"><thead><tr><th>历史比赛</th><th>名次 / 人数</th><th>排名分</th></tr></thead><tbody>{row.history.map(item => <tr key={item.id}><td>{item.title}<small className="growth-muted-line">{dateText(item.date)}</small></td><td>{item.result ? `${item.result.tied ? '并列 ' : ''}${item.result.rank} / ${item.result.count}` : '未参赛'}</td><td>{valueText(item.result?.points)}</td></tr>)}</tbody></table>{!row.history.length && <p className="growth-footnote">这是该培养期的第一场比赛。</p>}</div> }
function TheoryHistory({ row }: { row: TheoryRow }) { return <div className="growth-table-scroll"><table className="growth-table growth-history-table"><thead><tr><th>历史考核</th><th>形式</th><th>成绩 / 100</th></tr></thead><tbody>{row.history.map(item => <tr key={item.id}><td>{item.title}<small className="growth-muted-line">{dateText(item.date)}</small></td><td>{kindLabel(item.kind)}</td><td>{scoreLabel(item.grade)}</td></tr>)}</tbody></table>{!row.history.length && <p className="growth-footnote">暂无更早的有效考核记录。</p>}</div> }
function Rules({ open, onClose }: { open: boolean; onClose: () => void }) { return <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}><DialogContent className="lab-dialog growth-dialog growth-rules"><DialogTitle>综合成绩如何计算</DialogTitle><DialogDescription>两类考核独立排名；历史占 25%，当次占 75%。</DialogDescription><section><h3>深度学习理论基础</h3><p>每次考核均为百分制。历史均分取同一培养期、早于所选场次的{historyScope === 'combined' ? '笔试与机试' : '同类考试'}有效成绩。</p><div className="growth-formula">综合分 = 历史均分 × 25% + 当次成绩 × 75%</div><p>机试分项参考作品质量 40%、提交速度 40%、提交规范 20%；这是单次评分内部的比例，不替代历史 / 当次比例。直接录入总分时不虚构分项。</p></section><section><h3>ACM 算法</h3><p>每场先按 AC 数降序、罚时升序排名，再将名次换算为 0–100 的排名分，解决不同比赛人数不可直接比较的问题。</p><div className="growth-formula">排名分 = 100 × (人数 − 计分名次) / (人数 − 1)<br />综合分 = 历史排名分均值 × 25% + 当次排名分 × 75%</div><p>例如历史均分 80，当次 20 人中第 4：当次排名分 84.21，综合分 83.16。开启老成员过滤后，当次及历史每场都先过滤，再重新排名。</p><p>同 AC、同罚时显示并列名次，计分取占用名次的平均值；单人场次取中性 50 分。搜索只筛选显示，不影响计分。</p></section><section><h3>空缺与并列</h3><p>暂无有效历史时采用当次分数，并标明首场。未参加当次或尚未评分不进入综合排名；缺考、免考单独显示，0 分仍是有效分数。综合分相同并列，显示两位小数，排序使用完整精度。</p><p>本页是前端演示，未连接 OJ 或真实学生成绩库；不依据排行榜自动作出录取、转正等决定。</p></section></DialogContent></Dialog> }

function RankingTabs({ value, onChange }: { value: 'current' | 'history'; onChange: (value: 'current' | 'history') => void }) {
  return <div className="filter-tabs" role="group" aria-label="排行榜视图"><button className={value === 'current' ? 'selected' : ''} aria-pressed={value === 'current'} onClick={() => onChange('current')}>本次排名</button><button className={value === 'history' ? 'selected' : ''} aria-pressed={value === 'history'} onClick={() => onChange('history')}><History size={13} />历史排名</button></div>
}
