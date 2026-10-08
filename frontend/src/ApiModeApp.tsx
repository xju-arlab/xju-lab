import { EmailApprovalPage } from './features/leave/EmailApprovalPage'
import { HongqingtingPanel } from './features/hongqingting/HongqingtingPanel'
import { ServersPage } from './features/servers/ServersPage'
import { PrinterStatusPanel, printerStatusLabels, type PrinterDevice } from './features/printers/PrinterStatusPanel'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type MouseEvent } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Activity, ArrowDownToLine, ArrowRight, Bell, BookOpen, CalendarDays, Check, ChevronRight, CircleHelp, Coffee, FileText, FolderKanban, GraduationCap, LayoutDashboard, LayoutGrid, Menu, Maximize, Minus, Plus, LoaderCircle, Search, Server, Settings2, ShieldCheck, Users, X } from 'lucide-react'
import { ApiError, apiRequest, clearSessionData, sessionScope, toApiError, type Session } from './api/client'
import { useQuery as useLoad } from './api/useQuery'
import { checkSession, plainClick, SessionGate, type SessionCheck } from './api/SessionGate'
import { QueryFeedback as LoadingOrError } from './components/common/QueryFeedback'
import { QueryProgress } from './components/common/QueryProgress'
import './api-mode.css'
import './features/seats/seats.css'
import type { Seat as DemoSeat } from './demo'
import { ComboBox } from './components/common/ComboBox'
import { DateInput } from './components/common/DateInput'
import { dateText, todayInLab } from './lib/date'
import { LeaveAttachmentPicker, LeaveAttachmentLinks, type LeaveAttachment } from './features/leave/LeaveAttachments'
import { ProjectCreateForm, ProjectResourceLinks } from './features/projects/ProjectCreateForm'
import { AsyncSection } from './components/common/AsyncSection'
import { ApiSeatPopover, type ApiSeat as Seat } from './features/seats/ApiSeatPopover'
import { FloorPlan } from './features/seats/FloorPlan'
import { makeLayoutDocument, validateLayoutDocument } from './features/seats/layout'
import { useLayoutEditor } from './features/seats/useLayoutEditor'
import { LayoutInspector, LayoutToolbar } from './features/seats/LayoutEditor'
import { exportFloorPlan } from './features/seats/export'

type Page<T> = { items: T[]; total: number; page: number; pageSize: number }
type Problem = { message: string }
type Overview = { activeProjects: number; openTasks: number; upcomingMeetings: number; pendingLeaves: number; assignedSeat: string | null }
type Project = { id: string; title: string; description: string; status: string; leadId: string; version: number; updatedAt: string; resourceMode?: string; resourceLinks?: Record<string, string> }
type Task = { id: string; projectId: string | null; title: string; description: string; assigneeId: string | null; dueDate: string | null; status: string; version: number }
type Meeting = { id: string; projectId: string | null; title: string; startsAt: string; version: number; location?: string }
type Leave = { id: string; memberName: string; approverName: string; startsAt: string; endsAt: string; reason: string; status: string; version: number; attachments?: LeaveAttachment[] }
type Term = { id: string; name: string; startsOn: string; endsOn: string; active: boolean; version: number }
type Exam = { id: string; termId: string; title: string; kind: string; startsAt: string; version: number }
type Contest = { id: string; contestId: string; title: string; sourceVersion: string; complete: boolean }
type Profile = { id: string; displayName: string; realName: string | null; studentNumber: string | null; className: string | null; grade: number | null; directions: string[]; direction: string | null; introduction: string | null; version: number; registrationComplete: boolean }
type Settings = { name: string; location: string; timezone: string; description: string; mailEnabled: boolean; tonerAlertEnabled: boolean; version: number }
type AdminMember = { id: string; accountId: string | null; displayName: string; realName: string | null; studentNumber: string | null; className: string | null; contact: string | null; cohort: number | null; active: boolean; version: number; roles: string[]; ojAdminDesired: boolean | null; ojSyncVersion: number | null; ojConfirmedVersion: number | null; ojSyncStatus: string | null; ojLastError: string | null }

function messageOf(error: unknown) {
  return error instanceof ApiError ? error.problem.message : error instanceof Error ? error.message : '服务暂时不可用，请稍后重试。'
}
function Heading({ title, description, actions, titleActions }: { title: string; description?: string; actions?: ReactNode; titleActions?: ReactNode }) {
  return <div className="page-heading"><div className={titleActions ? 'heading-copy' : undefined}><div className="eyebrow">算法与科研实验室</div>{titleActions ? <div className="heading-title-row"><h1>{title}</h1>{titleActions}</div> : <h1>{title}</h1>}{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`panel api-panel ${className}`}>{children}</section> }
function Status({ children, tone = 'gray' }: { children: ReactNode; tone?: string }) { return <span className={`tag tag-${tone}`}>{children}</span> }
function Empty({ text }: { text: string }) { return <div className="empty-state"><Search size={22} /><p>{text}</p></div> }
function Button({ children, type = 'button', disabled = false, onClick, variant = 'primary', value }: { children: ReactNode; type?: 'button' | 'submit'; disabled?: boolean; onClick?: () => void; variant?: 'primary' | 'outline' | 'danger'; value?: string }) {
  return <button className={`button button-${variant}`} type={type} disabled={disabled} onClick={onClick} value={value}>{children}</button>
}
function TextField({ label, name, type = 'text', required = false, defaultValue, maxLength }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string; maxLength?: number }) {
  if (type === 'date' || type === 'datetime-local') return <label className="field"><span>{label}</span><DateInput name={name} aria-label={label} type={type} defaultValue={defaultValue} required={required} /></label>
  return <label className="field"><span>{label}</span><input name={name} type={type} defaultValue={defaultValue} required={required} maxLength={maxLength} /></label>
}

function PublicPage({ entering, enterError, onEnter }: { entering: boolean; enterError: string; onEnter: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const { data, loading, error, reload } = useLoad<{ version: number; payload: Record<string, unknown>; publishedAt: string | null; isPublished: boolean }>('/public/snapshot')
  const payload = data?.payload
  const labName = String(payload?.labName ?? '算法与科研实验室')
  const description = String(payload?.description ?? '新疆大学算法与科研实验室')
  const projects = Array.isArray(payload?.projects) ? payload?.projects as Array<Record<string, unknown>> : []
  return <main className="api-public"><header className="api-public-top"><Link className="brand" to="/"><img className="brand-logo" src="/brand/lab-seal.png" alt="" /><span>LabOS<span className="brand-dot">.</span></span></Link><Link className="button button-outline" to="/app/dashboard" onClick={onEnter} aria-disabled={entering} aria-busy={entering}>{entering ? <><LoaderCircle size={15} className="api-loading-spinner" />正在确认登录…</> : <>成员登录<ArrowRight size={15} /></>}</Link></header><section className="api-public-hero"><div className="api-public-hero-copy"><div className="eyebrow">新疆大学 · XJU Lab</div><h1>{labName}<span>。</span></h1><p>{description}</p><Link className="button button-primary" to="/app/dashboard" onClick={onEnter} aria-disabled={entering} aria-busy={entering}>{entering ? <><LoaderCircle size={16} className="api-loading-spinner" /><span role="status">正在确认登录状态…</span></> : <>进入实验室平台<ArrowRight size={16} /></>}</Link>{enterError && <p className="api-error-text" role="alert">{enterError}，请重试。</p>}</div><img className="api-public-mark" src="/brand/lab-wide.png" alt="算法与科研实验室 · XJU Algorithm & Research Lab" /></section><section className="api-public-section"><Heading title="公开项目" description="仅展示经管理员明确发布并脱敏的内容。" /><LoadingOrError loading={loading} error={error} retry={reload} />{!loading && !error && projects.length === 0 && <Panel><Empty text="目前还没有发布的项目内容。" /></Panel>}{projects.length > 0 && <div className="api-card-grid">{projects.map((item, index) => <Panel key={String(item.id ?? index)}><span className="eyebrow">研究项目</span><h2>{String(item.title ?? '项目')}</h2><p>{String(item.summary ?? '')}</p></Panel>)}</div>}</section><footer className="api-public-footer">{data?.isPublished ? `公开快照 v${data.version} · ${data.publishedAt ? dateText(data.publishedAt) : ''}` : '尚未发布公开内容 · 内部资料不会自动公开'}</footer></main>
}

function DashboardPage() {
  const overview = useLoad<Overview>('/overview')
  const tasks = useLoad<Page<Task>>('/tasks/mine?page=1&pageSize=8')
  const meetings = useLoad<Page<Meeting>>('/meetings?page=1&pageSize=5')
  return <><Heading title="总览" description="你的项目、待办和近期安排。" /><LoadingOrError loading={overview.loading} error={overview.error} retry={overview.reload} />{overview.data && <div className="api-stat-grid">{[['参与项目', overview.data.activeProjects], ['待办任务', overview.data.openTasks], ['近期会议', overview.data.upcomingMeetings], ['请假待处理', overview.data.pendingLeaves]].map(([label, value]) => <Panel key={String(label)}><span>{label}</span><strong>{value}</strong></Panel>)}</div>}<div className="api-two-col"><Panel><div className="section-heading"><h2>我的待办</h2><Link to="/app/projects">项目空间</Link></div><LoadingOrError loading={tasks.loading} error={tasks.error} retry={tasks.reload} />{tasks.data?.items.map(task => <div className="api-row" key={task.id}><span><strong>{task.title}</strong><small>{dateText(task.dueDate, '未设截止日期')}</small></span><Status tone={task.status === 'DONE' ? 'teal' : 'orange'}>{task.status}</Status></div>)}{tasks.data?.items.length === 0 && <Empty text="目前没有待办任务。" />}</Panel><Panel><div className="section-heading"><h2>近期会议</h2><Link to="/app/meetings">会议记录</Link></div><LoadingOrError loading={meetings.loading} error={meetings.error} retry={meetings.reload} />{meetings.data?.items.map(meeting => <div className="api-row" key={meeting.id}><span><strong>{meeting.title}</strong><small>{dateText(meeting.startsAt)}</small></span><CalendarDays size={17} /></div>)}{meetings.data?.items.length === 0 && <Empty text="目前没有已安排的会议。" />}</Panel></div><PrinterStatusPanel /></>
}

function SeatsPage({ session }: { session: Session }) {
  const seats = useLoad<Page<Seat>>('/seats?page=1&pageSize=100')
  const layout = useLoad<{ version: number; layout: { canvas: { width: number; height: number }; desks: Array<Record<string, unknown>>; [key: string]: unknown } }>('/seats/layout')
  const members = useLoad<Page<{ id: string; displayName: string }>>('/members?page=1&pageSize=100')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = seats.data?.items.find(seat => seat.id === selectedId)
  const [assignmentBusy, setAssignmentBusy] = useState(false)
  const [assignmentError, setAssignmentError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [exporting, setExporting] = useState(false)
  const [zoom, setZoom] = useState(1)
  const mapScroller = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const layoutVersion = useRef<number | null>(null)
  const isAdmin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  const editor = useLayoutEditor(setNotice, { persist: async next => {
    if (layoutVersion.current === null) throw new Error('请先载入布局')
    await apiRequest('/seats/layout', { method: 'PUT', headers: { 'If-Match-Version': String(layoutVersion.current) }, body: makeLayoutDocument(next) })
    layout.reload(); seats.reload()
  } })
  const editing = editor.editing
  useEffect(() => {
    if (layout.data && !editor.editing) {
      try { editor.preview(validateLayoutDocument(layout.data.layout)) }
      catch (error) { setNotice(messageOf(error)) }
    }
  }, [layout.data])
  function toggleEditor() {
    if (editor.saving) return
    if (editing) { editor.cancel(); layout.reload(); return }
    if (!layout.data) return
    try {
      editor.preview(validateLayoutDocument(layout.data.layout))
      layoutVersion.current = layout.data.version
      setSelectedId(null); setQuery(''); editor.start()
    } catch (error) { setNotice(messageOf(error)) }
  }
  const planSeats = useMemo<DemoSeat[]>(() => (seats.data?.items ?? []).map(seat => ({
    id: seat.id,
    name: seat.displayName ?? undefined,
    memberId: seat.memberId ?? undefined,
    direction: seat.direction ?? undefined,
    directions: seat.directions,
    className: seat.className ?? undefined,
    grade: seat.cohort == null ? undefined : seat.cohort < 100 ? 2000 + seat.cohort : seat.cohort,
    status: seat.kind !== 'seat' ? 'temporary' : seat.onLeaveNow ? 'leave' : seat.memberId ? 'occupied' : 'empty',
  })), [seats.data])
  const matchingSeatIds = useMemo(() => new Set((seats.data?.items ?? []).filter(seat =>
    [seat.id, seat.kind, seat.displayName, seat.className, ...seat.directions, seat.cohort]
      .filter(value => value !== null && value !== undefined).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  ).map(seat => seat.id)), [query, seats.data])
  const seatCount = seats.data?.items.filter(seat => seat.kind === 'seat').length ?? 0
  const assignedCount = seats.data?.items.filter(seat => seat.kind === 'seat' && seat.memberId).length ?? 0
  function closeSeat() {
    setSelectedId(null); setAssignmentError('')
    if (selectedId) requestAnimationFrame(() => svgRef.current?.querySelector<SVGElement>(`[data-seat-id="${selectedId}"]`)?.focus({ preventScroll: true }))
  }
  async function assign(memberId: string) {
    if (!selected || assignmentBusy) return
    setAssignmentBusy(true); setAssignmentError('')
    try { await apiRequest(`/seats/${encodeURIComponent(selected.id)}/assignment`, { method: 'PUT', body: { memberId } }); setNotice('工位分配已保存'); seats.reload() }
    catch (error) { setAssignmentError(messageOf(error)) }
    finally { setAssignmentBusy(false) }
  }
  async function release() {
    if (!selected || assignmentBusy) return
    setAssignmentBusy(true); setAssignmentError('')
    try { await apiRequest(`/seats/${encodeURIComponent(selected.id)}/assignment`, { method: 'DELETE' }); setNotice('工位分配已解除'); seats.reload() }
    catch (error) { setAssignmentError(messageOf(error)) }
    finally { setAssignmentBusy(false) }
  }
  async function exportPlan(format: 'svg' | 'png') {
    if (!svgRef.current || exporting) return
    setExporting(true)
    try { await exportFloorPlan(svgRef.current, format); setNotice(format.toUpperCase() + ' 平面图已生成') }
    catch (error) { console.error('工位平面图导出失败', error); setNotice('图片导出失败，请重试') }
    finally { setExporting(false) }
  }
  return <><Heading title="工位一览" description="点击工位查看成员资料与请假状态。" actions={isAdmin && <Button variant="outline" disabled={!layout.data || editor.saving} onClick={toggleEditor}>{editing ? '退出标定' : '标定布局'}</Button>} /><LoadingOrError loading={seats.loading || layout.loading} error={seats.error || layout.error} retry={() => { seats.reload(); layout.reload() }} />{notice && <p className="api-feedback" role="status">{notice}</p>}{editing && <fieldset className="api-layout-toolbar-wrap" disabled={editor.saving}><LayoutToolbar editor={editor} toast={setNotice} /></fieldset>}<div className={`api-seat-editor-grid${editing ? ' is-editing' : ''}`}><Panel className="api-seat-panel"><div className="api-seat-toolbar"><label className="field"><span>搜索工位或成员</span><input aria-label="搜索工位或成员" placeholder="工位编号、成员、方向…" value={query} onChange={event => setQuery(event.target.value)} /></label><div className="api-seat-legend"><span>工位数 {seatCount}</span><span>已分配 {assignedCount}</span><span>空闲 {Math.max(0, seatCount - assignedCount)}</span><span>请假状态淡显</span></div><div className="api-actions"><button className="seat-export-button" disabled={exporting || seats.loading || layout.loading} onClick={() => void exportPlan('svg')}><ArrowDownToLine size={14} />SVG</button><button className="seat-export-button" disabled={exporting || seats.loading || layout.loading} onClick={() => void exportPlan('png')}><ArrowDownToLine size={14} />PNG</button></div></div><div className="api-seat-viewport" ref={mapScroller}><div className="api-seat-canvas" style={{ width: `max(${zoom * 100}%, ${zoom * 650}px)` }}><FloorPlan ref={svgRef} seats={planSeats} selectedId={selected?.id} matches={query.trim() ? matchingSeatIds : undefined} showAssignments demoRoster={false} onSelect={id => { setSelectedId(current => current === id && !editing ? null : id); setAssignmentError('') }} layout={editor.layout} editor={editor.saving ? undefined : editor} /></div></div><footer className="space-map-footer"><span>{editing ? '拖动自动吸附 · 方向键微调' : '点击工位查看成员信息'}</span><div className="map-zoom-controls"><button aria-label="缩小平面图" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .25))}><Minus size={15} /></button><output aria-live="polite">{Math.round(zoom * 100)}%</output><button aria-label="放大平面图" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .25))}><Plus size={15} /></button><button aria-label="适应画布" onClick={() => { setZoom(1); mapScroller.current?.scrollTo({ left: 0, top: 0 }) }}><Maximize size={15} /></button></div></footer></Panel>{editing && <fieldset className="api-layout-inspector" disabled={editor.saving}><LayoutInspector editor={editor} toast={setNotice} /></fieldset>}</div>{selected && !editing && <ApiSeatPopover key={selected.id} seat={selected} svg={svgRef} canManage={isAdmin} members={(members.data?.items ?? []).filter(member => !seats.data?.items.some(seat => seat.memberId === member.id)).map(member => ({ value: member.id, label: member.displayName }))} membersLoading={members.loading} membersError={members.error} busy={assignmentBusy} error={assignmentError} onClose={closeSeat} onAssign={assign} onRelease={release} />}</>
}

function ProjectsPage({ session }: { session: Session }) {
  const projects = useLoad<Page<Project>>('/projects?page=1&pageSize=50')
  const [selected, setSelected] = useState<Project | null>(null)
  const tasks = useLoad<Page<Task>>(selected ? `/projects/${selected.id}/tasks?page=1&pageSize=100` : '/tasks/mine?page=1&pageSize=1')
  const projectMembers = useLoad<Array<{ memberId: string; displayName: string; direction: string | null; cohort: number | null; role: string }>>(selected ? `/projects/${selected.id}/members` : null)
  const milestones = useLoad<Array<{ id: string; title: string; dueDate: string | null; completedAt: string | null; version: number }>>(selected ? `/projects/${selected.id}/milestones` : null)
  const directory = useLoad<Page<{ id: string; displayName: string }>>('/members?page=1&pageSize=100')
  const [notice, setNotice] = useState('')
  const isAdmin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  const canManage = Boolean(selected && (isAdmin || selected.leadId === session.memberId))
  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return
    const formElement = event.currentTarget; const form = new FormData(formElement)
    try { await apiRequest(`/projects/${selected.id}/tasks`, { method: 'POST', body: { title: form.get('title'), dueDate: form.get('dueDate') || null } }); setNotice('任务已创建'); tasks.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function updateTask(task: Task, status: string) {
    try { await apiRequest(`/tasks/${task.id}`, { method: 'PATCH', headers: { 'If-Match-Version': String(task.version) }, body: { status } }); tasks.reload() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function addProjectMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return
    const formElement = event.currentTarget; const memberId = String(new FormData(formElement).get('memberId') ?? '')
    try { await apiRequest(`/projects/${selected.id}/members/${memberId}`, { method: 'PUT', body: { role: 'MEMBER' } }); setNotice('项目成员已添加'); projectMembers.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function removeProjectMember(memberId: string) {
    if (!selected) return
    try { await apiRequest(`/projects/${selected.id}/members/${memberId}`, { method: 'DELETE' }); setNotice('项目成员已移除'); projectMembers.reload() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function addMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return
    const formElement = event.currentTarget; const form = new FormData(formElement)
    try { await apiRequest(`/projects/${selected.id}/milestones`, { method: 'POST', body: { title: form.get('title'), dueDate: form.get('dueDate') || null } }); setNotice('里程碑已创建'); milestones.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function toggleMilestone(item: { id: string; title: string; dueDate: string | null; completedAt: string | null; version: number }, completed: boolean) {
    if (!selected) return
    try { await apiRequest(`/projects/${selected.id}/milestones/${item.id}`, { method: 'PATCH', headers: { 'If-Match-Version': String(item.version) }, body: { title: item.title, dueDate: item.dueDate, completed } }); milestones.reload() }
    catch (error) { setNotice(messageOf(error)); milestones.reload() }
  }
  async function archiveProject() {
    if (!selected) return
    try { await apiRequest(`/projects/${selected.id}`, { method: 'PATCH', headers: { 'If-Match-Version': String(selected.version) }, body: { title: selected.title, description: selected.description, status: 'ARCHIVED' } }); setNotice('项目已归档'); setSelected(null); projects.reload() }
    catch (error) { setNotice(messageOf(error)); projects.reload() }
  }
  const projectPanelFallback = <Empty text="从左侧选择项目。" />
  return <><Heading title="项目空间" description="项目、任务、成员和里程碑均由服务端保存，并按成员权限显示。" />{notice && <p className="api-feedback" role="status">{notice}</p>}<LoadingOrError loading={projects.loading} error={projects.error} retry={projects.reload} /><div className="api-two-col"><Panel><div className="section-heading"><h2>我的项目</h2><span>{projects.data?.total ?? 0}</span></div>{projects.data?.items.map(project => <button className={`api-select-row ${selected?.id === project.id ? 'selected' : ''}`} key={project.id} onClick={() => setSelected(project)}><span><strong>{project.title}</strong><small>{project.description || '暂无项目简介'}</small></span><ChevronRight size={16} /></button>)}{projects.data?.items.length === 0 && <Empty text="你还没有可见项目。" />}<ProjectCreateForm onCreated={() => { setNotice('项目已创建'); projects.reload() }} /></Panel><div className="api-project-workspace">{selected ? <><Panel><div className="section-heading"><h2>{selected.title}</h2>{canManage && <Button variant="outline" onClick={archiveProject}>归档项目</Button>}</div><ProjectResourceLinks mode={selected.resourceMode} links={selected.resourceLinks} /><LoadingOrError loading={tasks.loading} error={tasks.error} retry={tasks.reload} />{tasks.data?.items.map(task => <label className="api-task-row" key={task.id}><input type="checkbox" checked={task.status === 'DONE'} onChange={event => updateTask(task, event.target.checked ? 'DONE' : 'OPEN')} /><span><strong>{task.title}</strong><small>{dateText(task.dueDate, '未设截止日期')}</small></span><Status>{task.status}</Status></label>)}{tasks.data?.items.length === 0 && <Empty text="这个项目还没有任务。" />}<form className="api-inline-form" onSubmit={createTask}><input className="text-input" name="title" placeholder="下一步任务" required maxLength={200} /><DateInput name="dueDate" aria-label="截止日期" /><Button type="submit">添加任务</Button></form></Panel><Panel><div className="section-heading"><h2>项目成员</h2><span>{projectMembers.data?.length ?? 0}</span></div>{projectMembers.data?.map(person => <div className="api-row" key={person.memberId}><span><strong>{person.displayName}</strong><small>{person.direction ?? '研究方向待填写'}{person.cohort ? ` · ${person.cohort} 级` : ''} · {person.role === 'LEAD' ? '负责人' : '成员'}</small></span>{canManage && person.role !== 'LEAD' && <Button variant="outline" onClick={() => removeProjectMember(person.memberId)}>移除</Button>}</div>)}{canManage && <form className="api-inline-form" onSubmit={addProjectMember}><label className="field"><span>添加成员</span><ComboBox name="memberId" required defaultValue="" placeholder="选择成员" options={(directory.data?.items ?? []).filter(person => !projectMembers.data?.some(row => row.memberId === person.id)).map(person => ({ value: person.id, label: person.displayName }))} /></label><Button type="submit">添加</Button></form>}</Panel><Panel><div className="section-heading"><h2>里程碑</h2><span>{milestones.data?.filter(item => item.completedAt).length ?? 0} / {milestones.data?.length ?? 0}</span></div>{milestones.data?.map(item => <label className="api-task-row" key={item.id}><input type="checkbox" checked={Boolean(item.completedAt)} disabled={!canManage} onChange={event => toggleMilestone(item, event.target.checked)} /><span><strong>{item.title}</strong><small>{dateText(item.dueDate, '未设置日期')}</small></span><Status>{item.completedAt ? '完成' : '进行中'}</Status></label>)}{canManage && <form className="api-inline-form" onSubmit={addMilestone}><input className="text-input" name="title" placeholder="新增里程碑" required maxLength={200} /><DateInput name="dueDate" aria-label="里程碑日期" /><Button type="submit">添加</Button></form>}</Panel></> : <Panel>{projectPanelFallback}</Panel>}</div></div></>
}

function MeetingsPage() {
  const [today] = useState(todayInLab)
  const meetings = useLoad<Page<Meeting>>('/meetings?page=1&pageSize=50')
  const members = useLoad<Page<{ id: string; displayName: string }>>('/members?page=1&pageSize=100')
  const [selected, setSelected] = useState<Meeting | null>(null)
  const minutes = useLoad<{ meetingId: string; version: number; body: string }>(selected ? `/meetings/${selected.id}/minutes` : null)
  const actions = useLoad<Task[]>(selected ? `/meetings/${selected.id}/actions` : null)
  const [notice, setNotice] = useState('')
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    const participants = form.getAll('participants').map(String)
    try { await apiRequest('/meetings', { method: 'POST', body: { title: form.get('title'), location: form.get('location'), startsAt: `${form.get('startsAt')}:00+08:00`, participants } }); setNotice('会议已创建'); meetings.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function saveMinutes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !minutes.data) return
    const body = String(new FormData(event.currentTarget).get('body') ?? '')
    try { await apiRequest(`/meetings/${selected.id}/minutes`, { method: 'PUT', headers: { 'If-Match-Version': String(minutes.data.version) }, body: { body } }); setNotice('会议纪要已保存'); minutes.reload(); meetings.reload() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function createAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return
    const formElement = event.currentTarget; const form = new FormData(formElement)
    try { await apiRequest(`/meetings/${selected.id}/actions`, { method: 'POST', body: { title: form.get('title'), description: form.get('description'), assigneeId: form.get('assigneeId') || null, dueDate: form.get('dueDate') || null } }); setNotice('会议行动项已加入统一任务'); actions.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function updateAction(task: Task, done: boolean) {
    try { await apiRequest(`/tasks/${task.id}`, { method: 'PATCH', headers: { 'If-Match-Version': String(task.version) }, body: { status: done ? 'DONE' : 'OPEN' } }); actions.reload() }
    catch (error) { setNotice(messageOf(error)); actions.reload() }
  }
  return <>
    <Heading title="会议记录" />
    {notice && <p className="api-feedback" role="status">{notice}</p>}
    <div className="api-two-col">
      <Panel>
        <div className="section-heading"><h2>会议</h2><span>{meetings.data?.total ?? 0}</span></div>
        <LoadingOrError loading={meetings.loading} error={meetings.error} retry={meetings.reload} />
        {meetings.data?.items.map(meeting => <button className={`api-select-row ${selected?.id === meeting.id ? 'selected' : ''}`} key={meeting.id} onClick={() => setSelected(meeting)}><span><strong>{meeting.title}</strong><small>{dateText(meeting.startsAt)}</small>{meeting.location && <small>{meeting.location}</small>}</span><ChevronRight size={16} /></button>)}
        <details className="api-create"><summary>安排会议</summary><form className="form-stack" onSubmit={create}><TextField name="title" label="会议主题" required maxLength={160} /><TextField name="location" label="会议地址" maxLength={500} /><TextField name="startsAt" label="开始时间（北京时间）" type="datetime-local" required defaultValue={`${today}T09:00`} /><label className="field"><span>参会成员（可多选）</span><ComboBox name="participants" multiple placeholder="选择参会成员" options={(members.data?.items ?? []).map(person => ({ value: person.id, label: person.displayName }))} /></label><Button type="submit">创建会议</Button></form></details>
      </Panel>
      <div className="api-project-workspace">
        <Panel>
          <h2>{selected?.title ?? '会议纪要'}</h2>{selected?.location && <p className="api-note">会议地址 · {selected.location}</p>}
          {selected ? <><LoadingOrError loading={minutes.loading} error={minutes.error} retry={minutes.reload} />{minutes.data && <form className="form-stack" onSubmit={saveMinutes}><label className="field"><span>纪要内容</span><textarea name="body" defaultValue={minutes.data.body} key={`${minutes.data.meetingId}-${minutes.data.version}`} rows={12} maxLength={20000} /></label><span className="api-note">版本 {minutes.data.version} · 保存时使用版本校验</span><Button type="submit">保存纪要</Button></form>}</> : <Empty text="选择会议以查看或编辑纪要。" />}
        </Panel>
        {selected && <Panel>
          <div className="section-heading"><h2>行动项</h2><span>共享任务</span></div>
          <LoadingOrError loading={actions.loading} error={actions.error} retry={actions.reload} />
          {actions.data?.map(task => <label className="api-task-row" key={task.id}><input type="checkbox" checked={task.status === 'DONE'} onChange={event => updateAction(task, event.target.checked)} /><span><strong>{task.title}</strong><small>{task.assigneeId ? members.data?.items.find(person => person.id === task.assigneeId)?.displayName ?? '已分配成员' : '未分配'} · {dateText(task.dueDate, '未设截止日期')}</small></span><Status>{task.status}</Status></label>)}
          {actions.data?.length === 0 && <Empty text="会议还没有行动项。" />}
          <form className="form-stack" onSubmit={createAction}><TextField name="title" label="行动项" required maxLength={200} /><TextField name="description" label="说明" maxLength={5000} /><label className="field"><span>负责人</span><ComboBox name="assigneeId" defaultValue="" options={[{ value: "", label: "未分配" }, ...(members.data?.items ?? []).map(person => ({ value: person.id, label: person.displayName }))]} /></label><TextField name="dueDate" label="截止日期" type="date" defaultValue={today} /><Button type="submit">创建行动项</Button></form>
        </Panel>}
      </div>
    </div>
  </>
}

function LeavePage({ session }: { session: Session }) {
  const isAdmin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  const [rejecting, setRejecting] = useState<Leave | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [deciding, setDeciding] = useState(false)
  const [today] = useState(todayInLab)
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const mine = useLoad<Page<Leave>>('/leaves/mine?page=1&pageSize=50')
  const inbox = useLoad<Page<Leave>>(isAdmin ? '/leaves/inbox?page=1&pageSize=50' : null)
  const approvers = useLoad<{ id: string; displayName: string }[]>('/leaves/approvers')
  const [notice, setNotice] = useState('')
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting) return; const formElement = event.currentTarget; const form = new FormData(formElement)
    const application = { startsAt: `${form.get('startsAt')}:00+08:00`, endsAt: `${form.get('endsAt')}:00+08:00`, approverId: form.get('approverId'), reason: form.get('reason') }
    const upload = new FormData()
    upload.append('application', new Blob([JSON.stringify(application)], { type: 'application/json' }))
    files.forEach(file => upload.append('files', file, file.name))
    setSubmitting(true)
    try { await apiRequest('/leaves', { method: 'POST', body: files.length ? upload : application }); setNotice('申请已提交'); mine.reload(); inbox.reload(); formElement.reset(); setFiles([]) }
    catch (error) { setNotice(messageOf(error)) }
    finally { setSubmitting(false) }
  }
  async function decide(leave: Leave, decision: 'APPROVED' | 'REJECTED') {
    if (deciding) return
    setDeciding(true)
    try { await apiRequest(`/leaves/${leave.id}/decision`, { method: 'POST', body: { decision, reason: decision === 'REJECTED' ? rejectReason : undefined, version: leave.version } }); setRejecting(null); setRejectReason(''); inbox.reload(); mine.reload() }
    catch (error) { setNotice(messageOf(error)) }
    finally { setDeciding(false) }
  }
  async function withdraw(leave: Leave) {
    try { await apiRequest(`/leaves/${leave.id}/withdraw`, { method: 'POST', body: { version: leave.version } }); mine.reload(); inbox.reload() }
    catch (error) { setNotice(messageOf(error)) }
  }
  return <><Heading title="请假申请" description="申请原因仅对申请人、指定审批人和授权管理员开放。" />{notice && <p className="api-feedback" role="status">{notice}</p>}<Panel className="api-form-panel"><h2>提交申请</h2><form className="api-leave-form" onSubmit={apply}><TextField name="startsAt" label="开始时间（北京时间）" type="datetime-local" required defaultValue={`${today}T09:00`} /><TextField name="endsAt" label="结束时间（北京时间）" type="datetime-local" required defaultValue={`${today}T18:00`} /><label className="field"><span>审批人</span><ComboBox name="approverId" required defaultValue="" placeholder="选择审批人" options={(approvers.data ?? []).map(person => ({ value: person.id, label: person.displayName }))} /><LoadingOrError loading={approvers.loading} error={approvers.error} retry={approvers.reload} />{approvers.data?.length === 0 && <small>暂无可用的实验室管理员，请联系管理员配置审批人。</small>}</label><label className="field"><span>请假原因</span><textarea name="reason" required maxLength={1000} rows={3} /></label><LeaveAttachmentPicker files={files} onChange={setFiles} disabled={submitting} /><Button type="submit" disabled={submitting || !approvers.data?.length}>{submitting ? '正在提交…' : '提交申请'}</Button></form></Panel><div className="api-two-col"><Panel><div className="section-heading"><h2>我的申请</h2></div><LoadingOrError loading={mine.loading} error={mine.error} retry={mine.reload} />{mine.data?.items.map(leave => <div className="api-leave-card" key={leave.id}><div><strong>{dateText(leave.startsAt)} — {dateText(leave.endsAt)}</strong><Status tone={leave.status === 'APPROVED' ? 'teal' : 'orange'}>{leave.status}</Status></div><p>{leave.reason}</p><LeaveAttachmentLinks leaveId={leave.id} attachments={leave.attachments} /><small>审批人：{leave.approverName}</small>{leave.status === 'PENDING' && <div className="api-actions"><Button variant="outline" onClick={() => withdraw(leave)}>撤回</Button></div>}</div>)}{mine.data?.items.length === 0 && <Empty text="暂无申请记录。" />}</Panel>{isAdmin && <Panel><div className="section-heading"><h2>待我审批</h2></div><LoadingOrError loading={inbox.loading} error={inbox.error} retry={inbox.reload} />{inbox.data?.items.map(leave => <div className="api-leave-card" key={leave.id}><div><strong>{leave.memberName}</strong><Status>{leave.status}</Status></div><p>{dateText(leave.startsAt)} — {dateText(leave.endsAt)}</p><p>{leave.reason}</p><LeaveAttachmentLinks leaveId={leave.id} attachments={leave.attachments} />{leave.status === 'PENDING' && <div className="api-actions"><Button disabled={deciding} onClick={() => decide(leave, 'APPROVED')}>批准</Button><Button disabled={deciding} variant="outline" onClick={() => { setRejecting(leave); setRejectReason('') }}>驳回</Button></div>}</div>)}{inbox.data?.items.length === 0 && !inbox.error && <Empty text="没有待处理申请。" />}{rejecting && <form onSubmit={event => { event.preventDefault(); void decide(rejecting, 'REJECTED') }}><label className="field"><span>驳回原因 · {rejecting.memberName}</span><textarea required maxLength={1000} rows={3} value={rejectReason} onChange={event => setRejectReason(event.target.value)} /></label><div className="api-actions"><Button variant="outline" disabled={deciding} onClick={() => setRejecting(null)}>取消</Button><Button type="submit" disabled={deciding}>{deciding ? '正在提交…' : '确认驳回'}</Button></div></form>}</Panel>}</div></>
}


function AssessmentPage({ session }: { session: Session }) {
  const terms = useLoad<Term[]>('/assessment/terms')
  const [termId, setTermId] = useState('')
  const [examId, setExamId] = useState('')
  const [contestId, setContestId] = useState('')
  const [subject, setSubject] = useState<'acm' | 'theory'>('acm')
  const [rankingView, setRankingView] = useState<'current' | 'history'>('current')
  const [excludeVeterans, setExcludeVeterans] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [importId, setImportId] = useState('')
  const [notice, setNotice] = useState('')
  const canManage = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  const canGrade = canManage || session.roles.includes('TEACHER')
  const selectedTerm = termId || terms.data?.find(term => term.active)?.id || terms.data?.[0]?.id || ''
  const selectedTermRow = terms.data?.find(term => term.id === selectedTerm)
  const exams = useLoad<Exam[]>(selectedTerm ? `/assessment/terms/${selectedTerm}/exams` : null)
  const contests = useLoad<Contest[]>(selectedTerm ? `/assessment/terms/${selectedTerm}/contests` : null)
  const selectedExam = exams.data?.find(item => item.id === examId) ?? exams.data?.[0]
  const selectedContest = contests.data?.find(item => item.id === contestId) ?? contests.data?.find(item => item.complete) ?? contests.data?.[0]
  const rankingPath = subject === 'theory' && selectedExam
    ? `/assessment/exams/${selectedExam.id}/ranking?excludeVeterans=${excludeVeterans}`
    : subject === 'acm' && selectedContest?.complete
      ? `/assessment/terms/${selectedTerm}/contests/${selectedContest.id}/ranking?excludeVeterans=${excludeVeterans}` : ''
  const ranking = useLoad<{ items: Array<Record<string, unknown>>; total: number; algorithmVersion: string; sourceVersion: string }>(rankingPath || null)
  const importStatus = useLoad<{ id: string; status: string; result: Record<string, unknown> }>(importId ? `/assessment/acm/imports/${importId}` : null)
  useEffect(() => { if (importId) { const timer = window.setInterval(importStatus.reload, 2500); return () => window.clearInterval(timer) } }, [importId, importStatus.reload])

  async function importContest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const key = crypto.randomUUID()
    try { const result = await apiRequest<{ id: string; status: string }>('/assessment/acm/imports', { method: 'POST', headers: { 'Idempotency-Key': key }, body: { sourceUrl } }); setImportId(result.id); setNotice(`导入任务已进入队列：${result.status}`); setSourceUrl('') }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function saveGrade(event: FormEvent<HTMLFormElement>, row: Record<string, unknown>) {
    event.preventDefault(); if (!selectedExam) return
    const form = new FormData(event.currentTarget); const student = row.student as { id: string } | undefined
    if (!student?.id) return
    const status = String(form.get('status') ?? 'GRADED'); const scoreText = String(form.get('score') ?? '')
    try {
      await apiRequest(`/assessment/exams/${selectedExam.id}/grades/${student.id}`, { method: 'PUT', headers: { 'If-Match-Version': String(selectedExam.version) }, body: { status, score: status === 'GRADED' && scoreText !== '' ? Number(scoreText) : null, parts: {}, comment: form.get('comment'), reason: form.get('reason') } })
      setNotice('成绩修订已保存并记录'); ranking.reload(); exams.reload(); terms.reload()
    } catch (error) { setNotice(messageOf(error)); exams.reload() }
  }
  async function publishRanking() {
    if (!selectedTermRow) return
    try {
      const path = subject === 'theory' && selectedExam ? `/assessment/exams/${selectedExam.id}/publish` : selectedContest ? `/assessment/terms/${selectedTerm}/contests/${selectedContest.id}/publish` : ''
      if (!path) return
      await apiRequest(path, { method: 'POST', headers: { 'If-Match-Version': String(selectedTermRow.version) } }); setNotice('排行快照已发布'); terms.reload()
    } catch (error) { setNotice(messageOf(error)); terms.reload() }
  }
  async function downloadCsv() {
    const path = subject === 'theory' && selectedExam ? `/api/v1/assessment/exams/${selectedExam.id}/ranking.csv?excludeVeterans=${excludeVeterans}` : selectedContest ? `/api/v1/assessment/terms/${selectedTerm}/contests/${selectedContest.id}/ranking.csv?excludeVeterans=${excludeVeterans}` : ''
    if (!path) return
    try { const response = await fetch(path, { credentials: 'same-origin' }); if (!response.ok) throw await toApiError(response); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `assessment-${subject}.csv`; link.click(); URL.revokeObjectURL(url) }
    catch (error) { setNotice(messageOf(error)) }
  }

  const activeImport = importStatus.data
  const catalog = subject === 'theory' ? exams : contests
  const loading = terms.loading || terms.refreshing || catalog.loading || catalog.refreshing || ranking.loading || ranking.refreshing
  const error = terms.error || catalog.error || ranking.error
  const retry = () => { terms.reload(); catalog.reload(); ranking.reload() }
  const emptyText = !selectedTerm ? '暂无培养期。' : subject === 'theory' ? '暂无理论考试。' : !selectedContest ? '暂无 ACM 比赛，可导入 OJ 比赛后查看。' : '比赛尚未完成，完成后可查看排行。'
  return <><Heading title="成长与考核" description="ACM 算法与深度学习理论基础分开展示；服务端按已确认规则重算本次与历史排行。" titleActions={<div className="filter-tabs api-subject-tabs" role="tablist" aria-label="考核方向"><button role="tab" aria-selected={subject === 'acm'} className={subject === 'acm' ? 'selected' : ''} onClick={() => setSubject('acm')}>ACM 算法</button><button role="tab" aria-selected={subject === 'theory'} className={subject === 'theory' ? 'selected' : ''} onClick={() => setSubject('theory')}>深度学习理论基础</button></div>} />
    <div className="api-assessment-toolbar"><label className="field"><span>培养期</span><ComboBox value={selectedTerm} onValueChange={setTermId} disabled={!terms.data?.length} placeholder={terms.loading ? "正在读取培养期…" : "暂无培养期"} options={(terms.data ?? []).map(term => ({ value: term.id, label: term.name + (term.active ? " · 当前" : "") }))} /></label><label className="api-check"><input type="checkbox" checked={excludeVeterans} onChange={event => setExcludeVeterans(event.target.checked)} />排除已标记老成员并重算各场</label></div>
    {notice && <p className="api-feedback" role="status">{notice}</p>}
    {canManage && <div className={'api-assessment-import' + (subject === 'acm' ? ' is-open' : '')} aria-hidden={subject !== 'acm'} {...(subject !== 'acm' ? { inert: '' } : {})}><div><Panel className="api-form-panel"><h2>导入整场 ACM 比赛</h2><form className="api-inline-form" onSubmit={importContest}><label className="field api-grow"><span>OJ 比赛链接</span><input value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} type="url" placeholder="https://oj.icthub.top/contest/123" required /></label><Button type="submit">提交导入</Button></form>{activeImport && <p className="api-feedback">导入状态：{activeImport.status}{activeImport.result?.code ? ` · ${String(activeImport.result.code)}` : ''}</p>}</Panel></div></div>}
    <div className="api-assessment-toolbar">{subject === 'theory' ? <label className="field"><span>理论场次</span><ComboBox value={selectedExam?.id ?? ""} onValueChange={setExamId} placeholder="选择考试" options={(exams.data ?? []).map(exam => ({ value: exam.id, label: exam.title + " · " + (exam.kind === "WRITTEN" ? "笔试" : "机试") }))} /></label> : <label className="field"><span>ACM 比赛</span><ComboBox value={selectedContest?.id ?? ""} onValueChange={setContestId} placeholder="选择比赛" options={(contests.data ?? []).map(contest => ({ value: contest.id, label: contest.title + (contest.complete ? "" : " · 尚未完成") }))} /></label>}<div className="filter-tabs"><button className={rankingView === 'current' ? 'selected' : ''} onClick={() => setRankingView('current')}>本次排名</button><button className={rankingView === 'history' ? 'selected' : ''} onClick={() => setRankingView('history')}>历史排名</button></div><div className="api-actions"><Button variant="outline" disabled={loading || !!error || !ranking.data} onClick={downloadCsv}>导出 CSV</Button>{canManage && <Button disabled={loading || !!error || !ranking.data} onClick={publishRanking}>发布排行</Button>}</div></div>
    <AsyncSection loading={loading} error={error} hasContent={!!ranking.data} contentKey={`${rankingPath}:${rankingView}`} onRetry={retry}>
    {rankingPath && ranking.data?.items ? <Panel className="api-table-panel"><div className="section-heading"><h2>{subject === 'acm' ? 'ACM 算法' : '深度学习理论基础'}</h2><Status>{ranking.data.algorithmVersion ?? '服务端计分'}</Status></div><div className="api-table-wrap"><table><thead><tr><th>名次</th><th>成员</th><th>{rankingView === 'current' ? subject === 'theory' ? '本次成绩' : '本场 AC' : '综合分'}</th><th>历史均分</th><th>有效场次</th></tr></thead><tbody>{ranking.data.items.map((row, index) => { const student = row.student as { id?: string; name?: string; number?: string } | undefined; const grade = row.grade as { status?: string; score?: number | null; comment?: string | null } | undefined; return <tr key={student?.id ?? index}><td>{rankingView === 'current' ? String(row.currentRank ?? '—') : String(row.overallRank ?? '—')}</td><td><strong>{student?.name ?? '成员'}</strong><small>{student?.number ?? ''}</small>{canGrade && subject === 'theory' && selectedExam && student?.id && <details className="api-grade-editor"><summary>录入 / 修订</summary><form className="form-stack" onSubmit={event => saveGrade(event, row)}><label className="field"><span>状态</span><ComboBox name="status" defaultValue={grade?.status ?? "GRADED"} options={[{ value: "GRADED", label: "已评分" }, { value: "PENDING", label: "待评分" }, { value: "ABSENT", label: "缺考" }, { value: "EXEMPT", label: "免考" }]} /></label><TextField label="百分制成绩" name="score" type="number" defaultValue={grade?.score == null ? '' : String(grade.score)} /><TextField label="评语" name="comment" defaultValue={grade?.comment ?? ''} maxLength={2000} /><TextField label="修订原因" name="reason" required maxLength={1000} /><Button type="submit">保存修订</Button></form></details>}</td><td>{rankingView === 'current' ? String(subject === 'theory' ? row.currentScore ?? '—' : row.currentCount ?? '—') : String(row.composite ?? '—')}</td><td>{String(row.historyAverage ?? '—')}</td><td>{String(row.historyCount ?? 0)} / {String(row.historyTotal ?? 0)}</td></tr> })}</tbody></table></div>{ranking.data.items.length === 0 && <Empty text="当前没有可展示的成绩。" />}</Panel> : <Panel><Empty text={emptyText} /></Panel>}
    </AsyncSection>
  </>
}

function DirectionPicker({ value, onChange, allowCustom = true }: { value: string[]; onChange: (value: string[]) => void; allowCustom?: boolean }) {
  const [custom, setCustom] = useState('')
  const choices = [...new Set(['算法', '深度学习', ...value])]
  function toggle(direction: string) { onChange(value.includes(direction) ? value.filter(item => item !== direction) : [...value, direction]) }
  function addCustom() {
    const direction = custom.trim()
    if (!direction || value.includes(direction) || value.length >= 8) return
    onChange([...value, direction]); setCustom('')
  }
  return <div className="field"><span>研究方向（可多选）</span><div className="profile-direction-options">{choices.map(direction => <button key={direction} type="button" className={`profile-direction-option ${value.includes(direction) ? 'selected' : ''}`} aria-pressed={value.includes(direction)} onClick={() => toggle(direction)}>{direction}</button>)}</div>{allowCustom && <div className="profile-direction-add"><input aria-label="自定义方向" value={custom} onChange={event => setCustom(event.target.value)} placeholder="添加自定义方向" maxLength={32} /><Button type="button" variant="outline" disabled={!custom.trim() || value.length >= 8} onClick={addCustom}>添加</Button></div>}<small className="profile-direction-hint">{allowCustom ? '至少选择一个，最多八个；可多选建议方向或添加自定义方向。' : '至少选择一个。'}</small></div>
}

function RegistrationPage() {
  const profile = useLoad<Profile>('/members/me')
  const [directions, setDirections] = useState<string[]>(['算法'])
  const [realName, setRealName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [className, setClassName] = useState('')
  const [formInitialized, setFormInitialized] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!profile.data || formInitialized) return
    setRealName(profile.data.realName ?? '')
    setStudentNumber(profile.data.studentNumber ?? '')
    setClassName(profile.data.className ?? '')
    if (profile.data.directions.length) setDirections(profile.data.directions)
    setFormInitialized(true)
  }, [profile.data, formInitialized])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!profile.data) return
    try {
      await apiRequest('/members/me/registration', { method: 'PUT', headers: { 'If-Match-Version': String(profile.data.version) }, body: { realName, studentNumber, className, directions } })
      window.location.assign('/app/dashboard')
    } catch (error) { setNotice(messageOf(error)); profile.reload() }
  }
  async function logout() { try { await apiRequest('/logout', { method: 'POST' }) } finally { clearSessionData(); window.location.assign('/') } }
  return <main className="api-auth-screen"><section className="api-auth-card api-registration-card">
    <div className="eyebrow">XJU Lab · LabOS</div><h1>完成成员实名登记</h1>
    <LoadingOrError loading={profile.loading} error={profile.error} retry={profile.reload} />
    {notice && <p className="api-feedback" role="alert">{notice}</p>}
    {profile.data && formInitialized && <form className="form-stack" onSubmit={save}>
      <label className="field"><span>真实姓名<span className="api-required-mark" aria-hidden="true">*</span></span><input name="realName" required maxLength={80} value={realName} onChange={event => setRealName(event.target.value)} readOnly={Boolean(profile.data.realName)} /></label>
      <label className="field"><span>学号<span className="api-required-mark" aria-hidden="true">*</span></span><input name="studentNumber" required maxLength={32} value={studentNumber} onChange={event => setStudentNumber(event.target.value)} readOnly={Boolean(profile.data.studentNumber)} /></label>
      <label className="field"><span>班级<span className="api-required-mark" aria-hidden="true">*</span></span><input name="className" required maxLength={32} value={className} onChange={event => setClassName(event.target.value)} /></label>
      <p className="api-note">格式：专业简称 + 两位入学年份 - 班号，例如 计算机24-3。</p>
      <DirectionPicker value={directions} onChange={setDirections} allowCustom={false} />
      <Button type="submit" disabled={!profile.data || directions.length === 0}>保存并进入实验室</Button>
    </form>}
    <button className="api-auth-public" onClick={() => void logout()}>退出登录</button>
  </section></main>
}

function ProfilePage({ session }: { session: Session }) {
  const profile = useLoad<Profile>('/members/me')
  const [notice, setNotice] = useState('')
  const [directions, setDirections] = useState<string[]>([])
  useEffect(() => { if (profile.data) setDirections(profile.data.directions) }, [profile.data])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!profile.data) return
    const form = new FormData(event.currentTarget)
    try { await apiRequest('/members/me', { method: 'PATCH', headers: { 'If-Match-Version': String(profile.data.version) }, body: { className: form.get('className'), directions, introduction: form.get('introduction') } }); setNotice('个人资料已保存'); profile.reload() }
    catch (error) { setNotice(messageOf(error)); profile.reload() }
  }
  return <><Heading title="个人资料" description="姓名和学号由超级管理员维护；班级和研究方向可自行修改。" /><Panel className="api-form-panel"><LoadingOrError loading={profile.loading} error={profile.error} retry={profile.reload} />{notice && <p className="api-feedback" role="status">{notice}</p>}{profile.data && <><p className="api-note">登录身份：{session.issuer}</p><form className="form-stack" onSubmit={save}><label className="field"><span>真实姓名</span><input value={profile.data.realName ?? ''} readOnly /></label><label className="field"><span>学号</span><input value={profile.data.studentNumber ?? ''} readOnly /></label><TextField label="班级" name="className" required defaultValue={profile.data.className ?? ''} maxLength={32} /><p className="api-note">格式：专业简称 + 两位入学年份 - 班号，例如 计算机24-3。年级由班级自动解析：{profile.data.grade == null ? '待生成' : `${profile.data.grade} 级`}。</p><DirectionPicker value={directions} onChange={setDirections} /><label className="field"><span>一句话介绍</span><textarea name="introduction" defaultValue={profile.data.introduction ?? ''} rows={4} maxLength={1000} /></label><Button type="submit" disabled={directions.length === 0}>保存资料</Button></form></>}</Panel></>
}

function SettingsPage() {
  const settings = useLoad<Settings>('/lab/settings')
  const [notice, setNotice] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings.data) return
    const form = new FormData(event.currentTarget)
    try { await apiRequest('/lab/settings', { method: 'PUT', headers: { 'If-Match-Version': String(settings.data.version) }, body: { name: form.get('name'), location: form.get('location'), timezone: form.get('timezone'), description: form.get('description'), mailEnabled: form.get('mailEnabled') === 'on', tonerAlertEnabled: form.get('tonerAlertEnabled') === 'on' } }); setNotice('实验室设置已保存'); settings.reload() }
    catch (error) { setNotice(messageOf(error)); settings.reload() }
  }
  return <><Heading title="管理与设置" description="实验室信息保存在服务端；仅管理员可以修改。" /><Panel className="api-form-panel"><LoadingOrError loading={settings.loading} error={settings.error} retry={settings.reload} />{notice && <p className="api-feedback">{notice}</p>}{settings.data && <form className="form-stack" onSubmit={save}><TextField name="name" label="实验室名称" required defaultValue={settings.data.name} maxLength={120} /><TextField name="location" label="所在位置" required defaultValue={settings.data.location} maxLength={160} /><label className="field"><span>业务时区</span><ComboBox name="timezone" defaultValue={settings.data.timezone} options={[{ value: "Asia/Shanghai", label: "北京时间（Asia/Shanghai）" }, { value: "Asia/Urumqi", label: "新疆时间（Asia/Urumqi）" }, { value: "UTC", label: "UTC" }]} /></label><label className="field"><span>对外简介</span><textarea name="description" defaultValue={settings.data.description} rows={4} maxLength={2000} /></label><label className="api-check"><input type="checkbox" name="mailEnabled" defaultChecked={settings.data.mailEnabled} />允许发送邮件通知</label><label className="api-check"><input type="checkbox" name="tonerAlertEnabled" defaultChecked={settings.data.tonerAlertEnabled} />启用耗材告警</label><Button type="submit">保存设置</Button></form>}</Panel><PrinterSetupPanel /></>
}

function PrinterSetupPanel() {
  const printers = useLoad<PrinterDevice[]>('/admin/printers')
  const [notice, setNotice] = useState('')
  const [credential, setCredential] = useState<{ printerId: string; agentId: string; token: string } | null>(null)
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    try { setCredential(await apiRequest<{ printerId: string; agentId: string; token: string }>('/admin/printers', { method: 'POST', body: { name: form.get('printerName'), location: form.get('printerLocation') } })); setNotice('打印机已登记。凭据仅显示本次，请保存到受限服务配置。'); printers.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function rotate(printerId: string) {
    try { setCredential(await apiRequest<{ printerId: string; agentId: string; token: string }>(`/admin/printers/${printerId}/rotate-agent-token`, { method: 'POST' })); setNotice('Agent 凭据已轮换，旧凭据立即失效。') }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function setEnabled(printer: PrinterDevice) {
    try { await apiRequest(`/admin/printers/${printer.id}/enabled`, { method: 'PATCH', body: { enabled: printer.status === 'DISABLED' } }); printers.reload() }
    catch (error) { setNotice(messageOf(error)); printers.reload() }
  }
  return <Panel className="api-form-panel"><div className="section-heading"><h2>打印机状态接入</h2><Button variant="outline" onClick={printers.reload}>刷新</Button></div><p className="api-note">管理打印机状态接入与设备启停。</p>{notice && <p className="api-feedback" role="status">{notice}</p>}{credential && <div className="api-credential-panel"><div className="section-heading"><h3>新签发的 Agent 凭据</h3><Button variant="outline" onClick={() => setCredential(null)}>已安全保存</Button></div><pre className="api-credential">PRINTER_ID={credential.printerId}{'\n'}AGENT_ID={credential.agentId}{'\n'}AGENT_TOKEN={credential.token}</pre></div>}<form className="api-inline-form" onSubmit={register}><TextField name="printerName" label="打印机名称" required maxLength={120} /><TextField name="printerLocation" label="位置" maxLength={160} /><Button type="submit">登记打印机</Button></form><LoadingOrError loading={printers.loading} error={printers.error} retry={printers.reload} />{printers.data?.map(printer => <div className="api-row" key={printer.id}><span><strong>{printer.name}</strong><small>{printer.source === 'HP_STATUS' ? '状态接口同步' : printer.location || '位置待录入'} · {printerStatusLabels[printer.status]} · 最近读取 {dateText(printer.lastSeenAt)}</small></span><div className="api-actions"><Button variant="outline" onClick={() => setEnabled(printer)}>{printer.status === 'DISABLED' ? '启用设备' : '停用设备'}</Button>{printer.source !== 'HP_STATUS' && <Button variant="outline" onClick={() => rotate(printer.id)}>轮换 Agent 凭据</Button>}</div></div>)}</Panel>
}

function MembersAdminPage({ session }: { session: Session }) {
  const members = useLoad<AdminMember[]>('/admin/members')
  const [notice, setNotice] = useState('')
  const isSuperAdmin = session.roles.includes('SUPER_ADMIN')
  async function saveIdentity(member: AdminMember, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await apiRequest(`/admin/members/${member.id}/identity`, { method: 'PATCH', headers: { 'If-Match-Version': String(member.version) }, body: { realName: form.get('realName'), studentNumber: form.get('studentNumber') } })
      setNotice(`${member.displayName} 的姓名和学号已更新`); members.reload()
    } catch (error) { setNotice(messageOf(error)); members.reload() }
  }
  async function setRole(member: AdminMember, role: 'LAB_ADMIN' | 'SUPER_ADMIN', granted: boolean) {
    try {
      await apiRequest(`/admin/members/${member.id}/roles/${role}`, { method: 'PUT', body: { granted, version: member.version } })
      setNotice(`${member.displayName} 的角色已更新`); members.reload()
    } catch (error) { setNotice(messageOf(error)); members.reload() }
  }
  async function setActive(member: AdminMember) {
    try {
      await apiRequest(`/admin/members/${member.id}/status`, { method: 'PATCH', body: { active: !member.active, version: member.version } })
      setNotice(`${member.displayName} 已${member.active ? '停用' : '重新启用'}`); members.reload()
    } catch (error) { setNotice(messageOf(error)); members.reload() }
  }
  async function retryOj(member: AdminMember) {
    try { await apiRequest(`/admin/members/${member.id}/oj-role-sync/retry`, { method: 'POST' }); setNotice('OJ 管理员同步已重新排队'); members.reload() }
    catch (error) { setNotice(messageOf(error)); members.reload() }
  }
  return <><Heading title="成员管理" description="验证过的 icthub.top 邮箱可注册 Lab；成员角色由服务端控制。" />{notice && <p className="api-feedback" role="status">{notice}</p>}<LoadingOrError loading={members.loading} error={members.error} retry={members.reload} /><div className="api-card-grid">{members.data?.map(member => <Panel key={member.id}><div className="section-heading"><h2>{member.realName ?? member.displayName}</h2><Status tone={member.active ? 'teal' : 'gray'}>{member.active ? '有效' : '已停用'}</Status></div><p className="api-note">班级 {member.className || '待登记'} · 学号 {member.studentNumber || '未录入'} · OJ 账号 {member.accountId || '未映射'}{member.cohort ? ` · ${member.cohort} 级` : ''}</p>{member.contact && <p className="api-note">联系方式：{member.contact}</p>}{isSuperAdmin && <details className="api-create"><summary>修改实名信息</summary><form className="form-stack" onSubmit={event => void saveIdentity(member, event)}><TextField name="realName" label="真实姓名" required defaultValue={member.realName ?? member.displayName} maxLength={80} /><TextField name="studentNumber" label="学号" required defaultValue={member.studentNumber ?? ''} maxLength={32} /><Button type="submit">保存实名信息</Button></form></details>}<div className="api-actions">{['LAB_ADMIN', 'SUPER_ADMIN', 'TEACHER'].map(role => <Status key={role} tone={member.roles.includes(role) ? 'teal' : 'gray'}>{role}</Status>)}</div><div className="api-actions"><Button variant="outline" onClick={() => setRole(member, 'LAB_ADMIN', !member.roles.includes('LAB_ADMIN'))}>{member.roles.includes('LAB_ADMIN') ? '撤销实验室管理员' : '设为实验室管理员'}</Button>{isSuperAdmin && <Button variant="outline" onClick={() => setRole(member, 'SUPER_ADMIN', !member.roles.includes('SUPER_ADMIN'))}>{member.roles.includes('SUPER_ADMIN') ? '撤销超级管理员' : '设为超级管理员'}</Button>}<Button variant={member.active ? 'danger' : 'primary'} onClick={() => setActive(member)}>{member.active ? '停用账户' : '重新启用'}</Button></div>{member.roles.includes('SUPER_ADMIN') || member.ojSyncStatus ? <div className="api-sync-status"><strong>OJ Admin：{member.ojAdminDesired === null ? '尚未请求' : member.ojAdminDesired ? '期望启用' : '期望撤销'}</strong><span>同步状态：{member.ojSyncStatus ?? 'NOT_REQUESTED'} · 已确认版本 {member.ojConfirmedVersion ?? 0} / {member.ojSyncVersion ?? 0}</span>{member.ojLastError && <span className="api-error-text">{member.ojLastError}</span>}{isSuperAdmin && <Button variant="outline" onClick={() => retryOj(member)}>重试 OJ 同步</Button>}</div> : null}</Panel>)}{members.data?.length === 0 && <Panel><Empty text="尚无账户完成统一身份登录。" /></Panel>}</div></>
}

function PublicationPage() {
  const snapshot = useLoad<{ version: number; payload: Record<string, unknown>; publishedAt: string | null; isPublished: boolean }>('/public/snapshot')
  const savedDraft = useLoad<{ version: number; payload: Record<string, unknown>; updatedAt: string | null }>('/admin/public/draft')
  const settings = useLoad<Settings>('/lab/settings')
  const [notice, setNotice] = useState('')
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    const projects = String(form.get('projects') ?? '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const [title, ...summary] = line.split(/[|｜]/)
      return { title: title.trim(), summary: summary.join('｜').trim() }
    })
    const payload = { labName: String(form.get('labName') ?? ''), description: String(form.get('description') ?? ''), projects }
    const intent = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement ? (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') : 'publish'
    try {
      await apiRequest('/admin/public/draft', { method: 'PUT', headers: { 'If-Match-Version': String(savedDraft.data?.version ?? 0) }, body: payload })
      if (intent === 'draft') { setNotice('公开草稿已保存'); savedDraft.reload(); return }
      await apiRequest('/admin/public/snapshot', { method: 'POST', body: payload }); setNotice('脱敏公开快照已发布'); savedDraft.reload(); snapshot.reload()
    }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function withdraw() {
    try { await apiRequest('/admin/public/snapshot/withdraw', { method: 'POST' }); setNotice('公开内容已撤回'); snapshot.reload() }
    catch (error) { setNotice(messageOf(error)); snapshot.reload() }
  }
  const current = savedDraft.data?.payload
  const projects = Array.isArray(current?.projects) ? (current.projects as Array<{ title?: string; summary?: string }>).map(item => `${item.title ?? ''}｜${item.summary ?? ''}`).join('\n') : ''
  return <><Heading title="公开发布" description="草稿仅对管理员可见；发布后匿名主页读取脱敏快照。" />{notice && <p className="api-feedback" role="status">{notice}</p>}<LoadingOrError loading={snapshot.loading || savedDraft.loading || settings.loading} error={snapshot.error || savedDraft.error || settings.error} retry={() => { snapshot.reload(); savedDraft.reload(); settings.reload() }} />{settings.data && <div className="api-two-col"><Panel className="api-form-panel"><div className="section-heading"><h2>公开草稿</h2><Status tone={snapshot.data?.isPublished ? 'teal' : 'orange'}>{snapshot.data?.isPublished ? `已发布 v${snapshot.data.version}` : '未发布'}</Status></div><form className="form-stack" onSubmit={publish}><TextField name="labName" label="公开名称" required maxLength={120} defaultValue={String(current?.labName ?? settings.data.name)} /><label className="field"><span>公开简介</span><textarea name="description" rows={4} maxLength={2000} defaultValue={String(current?.description ?? settings.data.description)} /></label><label className="field"><span>公开项目（每行一个：标题｜简介）</span><textarea name="projects" rows={7} maxLength={6000} defaultValue={projects} placeholder="多模态学习｜探索视觉、语言与声音的联合表示" /></label><p className="api-note">成员名单、成绩、联系方式、请假原因和内部任务不会复制到公开快照。</p><div className="api-actions"><button className="button button-outline" type="submit" value="draft">保存草稿</button><Button type="submit" value="publish">发布公开快照</Button>{snapshot.data?.isPublished && <Button variant="danger" onClick={withdraw}>撤回公开内容</Button>}</div></form></Panel><Panel><span className="eyebrow">公开预览</span><h2>{String(current?.labName ?? settings.data.name)}</h2><p>{String(current?.description ?? settings.data.description)}</p>{Array.isArray(current?.projects) && (current.projects as Array<{ title?: string; summary?: string }>).map((project, index) => <article className="api-public-preview" key={`${project.title}-${index}`}><span className="eyebrow">研究项目</span><h3>{project.title}</h3><p>{project.summary}</p></article>)}<p className="api-note">草稿预览与公开页面使用相同的文本字段；内部成员信息不会加入预览。</p></Panel></div>}</>
}

function NotificationsPage() {
  const notifications = useLoad<Page<{ id: string; kind: string; payload: Record<string, unknown>; readAt: string | null; createdAt: string }>>('/notifications?page=1&pageSize=50')
  async function markRead(id: string) { try { await apiRequest(`/notifications/${id}/read`, { method: 'PUT' }); notifications.reload() } catch { notifications.reload() } }
  return <><Heading title="通知中心" description="仅显示当前登录成员的站内通知。" /><LoadingOrError loading={notifications.loading} error={notifications.error} retry={notifications.reload} /><Panel>{notifications.data?.items.map(item => <div className="api-row" key={item.id}><span><strong>{String(item.payload?.title ?? item.kind)}</strong><small>{String(item.payload?.summary ?? '')} · {dateText(item.createdAt)}</small></span>{item.readAt ? <Status>已读</Status> : <Button variant="outline" onClick={() => markRead(item.id)}>标为已读</Button>}</div>)}{notifications.data?.items.length === 0 && <Empty text="暂无通知。" />}</Panel></>
}

const navigation = [
    { path: 'dashboard', label: '总览', icon: LayoutDashboard }, { path: 'seats', label: '工位一览', icon: LayoutGrid },
  { path: 'projects', label: '项目空间', icon: FolderKanban }, { path: 'meetings', label: '会议记录', icon: CalendarDays },
  { path: 'leave', label: '请假申请', icon: Coffee },
  { path: 'assessment', label: '成长与考核', icon: GraduationCap }, { path: 'servers', label: '计算资源', icon: Server },
]

function SignedInApp({ session }: { session: Session }) {
  const location = useLocation()
  const [mobileNav, setMobileNav] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { data: currentProfile } = useLoad<Profile>('/members/me')
  const title = navigation.find(item => location.pathname.includes(item.path))?.label ?? (location.pathname.includes('profile') ? '个人资料' : location.pathname.includes('publish') ? '公开发布' : location.pathname.includes('hongqingting') ? '红蜻蜓' : '管理与设置')
  useEffect(() => setMobileNav(false), [location.pathname])
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileNav(false) }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape) }, [])
  async function logout() { if (leaving) return; setLeaving(true); try { await apiRequest('/logout', { method: 'POST' }) } catch { /* Leave the private screen even if the server is unreachable. */ } finally { clearSessionData(); window.location.assign('/') } }
  const isAdmin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  if (leaving) return <main className="api-auth-screen"><section className="api-auth-card"><LoadingOrError loading error="" retry={() => {}} /></section></main>
  if (!session.registrationComplete) return <RegistrationPage />
  return <div className="app-shell api-app-shell">{mobileNav && <button className="nav-backdrop" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}<aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`} id="primary-navigation"><Link className="brand" to="/app/dashboard"><img className="brand-logo" src="/brand/lab-seal.png" alt="" /><span>LabOS<span className="brand-dot">.</span></span></Link><div className="workspace-picker"><span className="workspace-icon">算</span><span><strong>算法与科研实验室</strong><small>信息楼A411</small></span></div><div className="nav-caption">工作空间</div><nav aria-label="主导航">{navigation.map(({ path, label, icon: Icon }) => <NavLink key={path} to={`/app/${path}`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={17} strokeWidth={1.65} /><span>{label}</span></NavLink>)}</nav><div className="nav-caption nav-caption-second">实验室</div>{isAdmin && <NavLink to="/app/hongqingting" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Activity size={17} /><span>红蜻蜓</span></NavLink>}<NavLink to="/" className="nav-item"><BookOpen size={17} /><span>公开主页</span></NavLink>{isAdmin && <><NavLink to="/app/members" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Users size={17} /><span>成员管理</span></NavLink><NavLink to="/app/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Settings2 size={17} /><span>管理与设置</span></NavLink><NavLink to="/app/publish" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><ShieldCheck size={17} /><span>公开发布</span></NavLink></>}<div className="sidebar-bottom"><NavLink className="profile-button" to="/app/profile"><span className="avatar">{(currentProfile?.displayName ?? session.displayName ?? '成').slice(0, 1)}</span><span><strong>{currentProfile?.displayName ?? session.displayName}</strong></span><ShieldCheck size={15} /></NavLink></div></aside><div className="main-shell"><QueryProgress /><header className="topbar"><button className="icon-button mobile-menu" aria-label="打开导航" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>工作空间</span><ChevronRight size={13} /><strong>{title}</strong></div><div className="topbar-actions"><Status tone="teal"><span className="status-dot" />API 实时数据</Status><Link className="icon-button" to="/app/notifications" aria-label="查看通知"><Bell size={18} /></Link><button className="icon-button" aria-label="退出登录" onClick={logout}><X size={17} /></button><div className="topbar-divider" /><span className="avatar avatar-sm">{(currentProfile?.displayName ?? session.displayName ?? '成').slice(0, 1)}</span></div></header><main id="main-content" className="page-content api-page-enter" key={location.pathname}><Routes><Route path="/" element={<Navigate to="/app/dashboard" replace />} /><Route path="/app/dashboard" element={<DashboardPage />} /><Route path="/app/seats" element={<SeatsPage session={session} />} /><Route path="/app/projects" element={<ProjectsPage session={session} />} /><Route path="/app/meetings" element={<MeetingsPage />} /><Route path="/app/leave" element={<LeavePage session={session} />} /><Route path="/app/print" element={<Navigate to="/app/dashboard" replace />} /><Route path="/app/assessment" element={<AssessmentPage session={session} />} /><Route path="/app/servers" element={<ServersPage session={session} />} /><Route path="/app/profile" element={<ProfilePage session={session} />} /><Route path="/app/members" element={isAdmin ? <MembersAdminPage session={session} /> : <div className="api-error" role="alert">当前账户无权访问成员管理。</div>} /><Route path="/app/hongqingting" element={isAdmin ? <><Heading title="红蜻蜓" description="跑步里程查询与批量上传。" /><HongqingtingPanel /></> : <div className="api-error" role="alert">当前账户无权访问红蜻蜓。</div>} /><Route path="/app/settings" element={isAdmin ? <SettingsPage /> : <div className="api-error" role="alert">当前账户无权访问实验室设置。</div>} /><Route path="/app/publish" element={isAdmin ? <PublicationPage /> : <div className="api-error" role="alert">当前账户无权发布公开内容。</div>} /><Route path="/app/notifications" element={<NotificationsPage />} /></Routes></main></div></div>
}

export function ApiModeApp() {
  const location = useLocation()
  const navigate = useNavigate()
  const initial = useRef<SessionCheck | null>(null)
  const [entering, setEntering] = useState(false)
  const [enterError, setEnterError] = useState('')
  const enteringRef = useRef(false)
  const currentPath = useRef(location.pathname)
  currentPath.current = location.pathname
  const takeInitial = useCallback(() => { const result = initial.current; initial.current = null; return result }, [])
  async function enter(event: MouseEvent<HTMLAnchorElement>) {
    if (!plainClick(event)) return
    event.preventDefault()
    if (enteringRef.current) return
    enteringRef.current = true; setEntering(true); setEnterError('')
    try {
      const result = await checkSession()
      if (currentPath.current !== '/') return
      initial.current = result
      navigate('/app/dashboard')
    } catch (reason) { setEnterError(messageOf(reason)) }
    finally { enteringRef.current = false; setEntering(false) }
  }
  if (location.pathname === '/app/leave/email-action') return <EmailApprovalPage key={location.key} />
  if (location.pathname === '/') return <PublicPage entering={entering} enterError={enterError} onEnter={event => void enter(event)} />
  return <SessionGate takeInitial={takeInitial}>{session => <SignedInApp key={sessionScope(session)} session={session} />}</SessionGate>
}
