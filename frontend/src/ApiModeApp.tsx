import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Activity, ArrowRight, Bell, BookOpen, CalendarDays, Check, ChevronRight, CircleHelp, Coffee, FileText, FolderKanban, GraduationCap, LayoutDashboard, LayoutGrid, Menu, Printer, Search, Server, Settings2, ShieldCheck, Users, X } from 'lucide-react'
import { ApiError, apiRequest, getSession, loginUrl, toApiError, type Session } from './api/client'
import './api-mode.css'

type Page<T> = { items: T[]; total: number; page: number; pageSize: number }
type Problem = { message: string }
type Loaded<T> = { data: T | null; loading: boolean; error: string; reload: () => void }
type Overview = { activeProjects: number; openTasks: number; upcomingMeetings: number; pendingLeaves: number; assignedSeat: string | null }
type Seat = { id: string; kind: string; layoutItem: Record<string, unknown>; memberId: string | null; displayName: string | null; direction: string | null; cohort: number | null; onLeaveNow: boolean }
type Project = { id: string; title: string; description: string; status: string; leadId: string; version: number; updatedAt: string }
type Task = { id: string; projectId: string | null; title: string; description: string; assigneeId: string | null; dueDate: string | null; status: string; version: number }
type Meeting = { id: string; projectId: string | null; title: string; startsAt: string; version: number }
type Leave = { id: string; memberName: string; approverName: string; startsAt: string; endsAt: string; reason: string; status: string; version: number }
type Term = { id: string; name: string; startsOn: string; endsOn: string; active: boolean; version: number }
type Exam = { id: string; termId: string; title: string; kind: string; startsAt: string; version: number }
type Contest = { id: string; contestId: string; title: string; sourceVersion: string; complete: boolean }
type PrintJob = { id: string; printerId: string; printerName: string; fileId: string; fileName: string; pageCount: number; options: { estimatedSheets?: number }; status: string; version: number; createdAt: string }
type PrinterDevice = { id: string; name: string; location: string; capabilities: Record<string, unknown>; status: string }
type Profile = { id: string; displayName: string; direction: string | null; introduction: string | null; version: number }
type Settings = { name: string; location: string; timezone: string; description: string; mailEnabled: boolean; tonerAlertEnabled: boolean; version: number }
type ApiAsset = { id: string; name: string; prometheusJob: string | null; targetLabel: string | null; gpuSupported: boolean | null; enabled: boolean; version: number }
type Metric = { metric: string; unit: string; value: number | null; status: string; sampledAt: string | null; expiresAt: string | null }
type AdminMember = { id: string; accountId: string | null; displayName: string; studentNumber: string | null; contact: string | null; cohort: number | null; active: boolean; version: number; roles: string[]; ojAdminDesired: boolean | null; ojSyncVersion: number | null; ojConfirmedVersion: number | null; ojSyncStatus: string | null; ojLastError: string | null }

function useLoad<T>(path: string): Loaded<T> {
  const [data, setData] = useState<T | null>(null)
  const [loadedPath, setLoadedPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(value => value + 1), [])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    apiRequest<T>(path).then(value => { if (active) { setData(value); setLoadedPath(path) } })
      .catch(reason => { if (active) setError(messageOf(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [path, version])
  return { data: loadedPath === path ? data : null, loading, error, reload }
}

function messageOf(error: unknown) {
  return error instanceof ApiError ? error.problem.message : error instanceof Error ? error.message : '服务暂时不可用，请稍后重试。'
}
function dateText(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
function Heading({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">算法与科研实验室</div><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="heading-actions">{actions}</div></div>
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`panel api-panel ${className}`}>{children}</section> }
function Status({ children, tone = 'gray' }: { children: ReactNode; tone?: string }) { return <span className={`tag tag-${tone}`}>{children}</span> }
function Empty({ text }: { text: string }) { return <div className="empty-state"><Search size={22} /><p>{text}</p></div> }
function LoadingOrError({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  if (loading) return <p className="api-feedback" role="status">正在读取服务端数据…</p>
  if (error) return <div className="api-error" role="alert"><span>{error}</span><button className="button button-outline" onClick={retry}>重试</button></div>
  return null
}
function Button({ children, type = 'button', disabled = false, onClick, variant = 'primary', value }: { children: ReactNode; type?: 'button' | 'submit'; disabled?: boolean; onClick?: () => void; variant?: 'primary' | 'outline' | 'danger'; value?: string }) {
  return <button className={`button button-${variant}`} type={type} disabled={disabled} onClick={onClick} value={value}>{children}</button>
}
function TextField({ label, name, type = 'text', required = false, defaultValue, maxLength }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string; maxLength?: number }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} defaultValue={defaultValue} required={required} maxLength={maxLength} /></label>
}

function PublicPage() {
  const { data, loading, error, reload } = useLoad<{ version: number; payload: Record<string, unknown>; publishedAt: string | null; isPublished: boolean }>('/public/snapshot')
  const payload = data?.payload
  const labName = String(payload?.labName ?? '算法与科研实验室')
  const description = String(payload?.description ?? '新疆大学算法与科研实验室')
  const projects = Array.isArray(payload?.projects) ? payload?.projects as Array<Record<string, unknown>> : []
  return <main className="api-public"><header className="api-public-top"><Link className="brand" to="/"><img className="brand-logo" src="/brand/lab-seal.png" alt="" /><span>LabOS<span className="brand-dot">.</span></span></Link><Link className="button button-outline" to="/app/dashboard">成员登录<ArrowRight size={15} /></Link></header><section className="api-public-hero"><div className="eyebrow">新疆大学 · XJU Lab</div><h1>{labName}<span>。</span></h1><p>{description}</p><Link className="button button-primary" to="/app/dashboard">进入实验室平台<ArrowRight size={16} /></Link></section><section className="api-public-section"><Heading title="公开项目" description="仅展示经管理员明确发布并脱敏的内容。" /><LoadingOrError loading={loading} error={error} retry={reload} />{!loading && !error && projects.length === 0 && <Panel><Empty text="目前还没有发布的项目内容。" /></Panel>}{projects.length > 0 && <div className="api-card-grid">{projects.map((item, index) => <Panel key={String(item.id ?? index)}><span className="eyebrow">研究项目</span><h2>{String(item.title ?? '项目')}</h2><p>{String(item.summary ?? '')}</p></Panel>)}</div>}</section><footer className="api-public-footer">{data?.isPublished ? `公开快照 v${data.version} · ${data.publishedAt ? dateText(data.publishedAt) : ''}` : '尚未发布公开内容 · 内部资料不会自动公开'}</footer></main>
}

function DashboardPage() {
  const overview = useLoad<Overview>('/overview')
  const tasks = useLoad<Page<Task>>('/tasks/mine?page=1&pageSize=8')
  const meetings = useLoad<Page<Meeting>>('/meetings?page=1&pageSize=5')
  return <><Heading title="总览" description="你的项目、待办和近期安排。" /><LoadingOrError loading={overview.loading} error={overview.error} retry={overview.reload} />{overview.data && <div className="api-stat-grid">{[['参与项目', overview.data.activeProjects], ['待办任务', overview.data.openTasks], ['近期会议', overview.data.upcomingMeetings], ['请假待处理', overview.data.pendingLeaves]].map(([label, value]) => <Panel key={String(label)}><span>{label}</span><strong>{value}</strong></Panel>)}</div>}<div className="api-two-col"><Panel><div className="section-heading"><h2>我的待办</h2><Link to="/app/projects">项目空间</Link></div><LoadingOrError loading={tasks.loading} error={tasks.error} retry={tasks.reload} />{tasks.data?.items.map(task => <div className="api-row" key={task.id}><span><strong>{task.title}</strong><small>{task.dueDate ?? '未设截止日期'}</small></span><Status tone={task.status === 'DONE' ? 'teal' : 'orange'}>{task.status}</Status></div>)}{tasks.data?.items.length === 0 && <Empty text="目前没有待办任务。" />}</Panel><Panel><div className="section-heading"><h2>近期会议</h2><Link to="/app/meetings">会议记录</Link></div><LoadingOrError loading={meetings.loading} error={meetings.error} retry={meetings.reload} />{meetings.data?.items.map(meeting => <div className="api-row" key={meeting.id}><span><strong>{meeting.title}</strong><small>{dateText(meeting.startsAt)}</small></span><CalendarDays size={17} /></div>)}{meetings.data?.items.length === 0 && <Empty text="目前没有已安排的会议。" />}</Panel></div></>
}

function SeatsPage({ session }: { session: Session }) {
  const seats = useLoad<Page<Seat>>('/seats?page=1&pageSize=100')
  const layout = useLoad<{ version: number; layout: { canvas: { width: number; height: number }; desks: Array<Record<string, unknown>>; [key: string]: unknown } }>('/seats/layout')
  const members = useLoad<Page<{ id: string; displayName: string }>>('/members?page=1&pageSize=100')
  const [selected, setSelected] = useState<Seat | null>(null)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<{ canvas: { width: number; height: number }; desks: Array<Record<string, unknown>>; [key: string]: unknown } | null>(null)
  const isAdmin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  useEffect(() => { if (layout.data) setDraft(layout.data.layout) }, [layout.data])
  const seatsWithLayout = useMemo(() => seats.data?.items.filter(s => s.layoutItem && typeof s.layoutItem === 'object') ?? [], [seats.data])
  const canvas = draft?.canvas ?? { width: 1400, height: 1060 }
  function adjustSelected(axis: 'x' | 'y' | 'width' | 'depth', delta: number) {
    if (!selected || !draft) return
    setDraft({ ...draft, desks: draft.desks.map(item => item.id === selected.id ? { ...item, [axis]: Math.max(0, Number(item[axis] ?? 0) + delta) } : item) })
  }
  async function saveLayout() {
    if (!draft || !layout.data) return
    try { await apiRequest('/seats/layout', { method: 'PUT', headers: { 'If-Match-Version': String(layout.data.version) }, body: draft }); setNotice('工位布局已保存'); setEditing(false); layout.reload(); seats.reload() }
    catch (error) { setNotice(messageOf(error)); layout.reload() }
  }
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return
    const memberId = String(new FormData(event.currentTarget).get('memberId') ?? '')
    try { await apiRequest(`/seats/${encodeURIComponent(selected.id)}/assignment`, { method: 'PUT', body: { memberId } }); setNotice('工位分配已保存'); setSelected(null); seats.reload() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function release() {
    if (!selected) return
    try { await apiRequest(`/seats/${encodeURIComponent(selected.id)}/assignment`, { method: 'DELETE' }); setNotice('工位分配已解除'); setSelected(null); seats.reload() }
    catch (error) { setNotice(messageOf(error)) }
  }
  return <><Heading title="工位一览" description="沿用已确认的 31 个工位坐标，分配与布局由服务端保存。" actions={isAdmin && <Button variant="outline" onClick={() => setEditing(value => !value)}>{editing ? '退出标定' : '标定布局'}</Button>} /><LoadingOrError loading={seats.loading || layout.loading} error={seats.error || layout.error} retry={() => { seats.reload(); layout.reload() }} />{notice && <p className="api-feedback" role="status">{notice}</p>}<Panel className="api-seat-panel"><div className="api-seat-canvas" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>{seatsWithLayout.map(seat => {
    const item = (editing && draft?.desks.find(value => value.id === seat.id) ? draft.desks.find(value => value.id === seat.id) : seat.layoutItem) as { x?: number; y?: number; width?: number; depth?: number; label?: string; kind?: string }
    const direction = seat.direction?.includes('算法') ? 'api-seat-algorithm' : seat.direction?.includes('深度') ? 'api-seat-deep' : ''
    const grade = seat.cohort ? `api-seat-cohort-${seat.cohort}` : ''
    return <button key={seat.id} className={`api-seat ${seat.kind !== 'seat' ? 'api-seat-facility' : ''} ${seat.onLeaveNow ? 'api-seat-away' : ''} ${direction} ${grade} ${selected?.id === seat.id ? 'api-seat-selected' : ''}`} style={{ left: `${Number(item.x ?? 0) / canvas.width * 100}%`, top: `${Number(item.y ?? 0) / canvas.height * 100}%`, width: `${Number(item.width ?? 45) / canvas.width * 100}%`, height: `${Number(item.depth ?? 28) / canvas.height * 100}%` }} onClick={() => setSelected(seat)} title={seat.displayName ? `${seat.id} · ${seat.displayName}` : seat.id}><strong>{seat.id || String(item.label ?? '')}</strong>{seat.displayName && <small>{seat.displayName}</small>}</button>
  })}</div><div className="api-seat-legend"><span>人工工位 {seatsWithLayout.filter(s => s.kind === 'seat').length}</span><span>算法方向 · 蓝色</span><span>深度学习 · 紫色</span><span>请假状态淡显</span></div></Panel>{selected && <Panel className="api-detail-panel"><button className="api-close" onClick={() => setSelected(null)} aria-label="关闭"><X size={18} /></button><h2>{selected.id}</h2>{selected.kind !== 'seat' ? <p>此位置为实验室设施，不可分配成员。</p> : selected.memberId ? <><p><strong>{selected.displayName}</strong> · {selected.direction ?? '研究方向待填写'} {selected.cohort ? `· ${selected.cohort} 级` : ''}</p>{selected.onLeaveNow && <Status tone="orange">当前请假</Status>}{isAdmin && <div className="api-actions"><Button variant="outline" onClick={release}>解除分配</Button></div>}</> : <><p>该工位尚未分配。</p>{isAdmin ? <form className="api-inline-form" onSubmit={assign}><label className="field"><span>选择成员</span><select name="memberId" required defaultValue=""><option value="" disabled>选择成员</option>{members.data?.items.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><Button type="submit">分配工位</Button></form> : <p>仅实验室管理员可以修改工位分配。</p>}</>}{editing && isAdmin && selected.kind === 'seat' && <div className="api-layout-controls"><span>移动 / 调整（吸附 10）</span><div><Button variant="outline" onClick={() => adjustSelected('y', -10)}>上移</Button><Button variant="outline" onClick={() => adjustSelected('y', 10)}>下移</Button><Button variant="outline" onClick={() => adjustSelected('x', -10)}>左移</Button><Button variant="outline" onClick={() => adjustSelected('x', 10)}>右移</Button></div><div><Button variant="outline" onClick={() => adjustSelected('width', -10)}>缩窄</Button><Button variant="outline" onClick={() => adjustSelected('width', 10)}>加宽</Button><Button variant="outline" onClick={() => adjustSelected('depth', -10)}>缩短</Button><Button variant="outline" onClick={() => adjustSelected('depth', 10)}>加深</Button></div><div><Button onClick={saveLayout}>保存布局</Button><Button variant="outline" onClick={() => { if (layout.data) setDraft(layout.data.layout); setEditing(false) }}>取消</Button></div><small>当前布局版本 {layout.data?.version ?? '—'}；并发修改会返回冲突，需刷新后重试。</small></div>}</Panel>}</>
}

function ProjectsPage({ session }: { session: Session }) {
  const projects = useLoad<Page<Project>>('/projects?page=1&pageSize=50')
  const [selected, setSelected] = useState<Project | null>(null)
  const tasks = useLoad<Page<Task>>(selected ? `/projects/${selected.id}/tasks?page=1&pageSize=100` : '/tasks/mine?page=1&pageSize=1')
  const projectMembers = useLoad<Array<{ memberId: string; displayName: string; direction: string | null; cohort: number | null; role: string }>>(selected ? `/projects/${selected.id}/members` : '/projects')
  const milestones = useLoad<Array<{ id: string; title: string; dueDate: string | null; completedAt: string | null; version: number }>>(selected ? `/projects/${selected.id}/milestones` : '/projects')
  const directory = useLoad<Page<{ id: string; displayName: string }>>('/members?page=1&pageSize=100')
  const [notice, setNotice] = useState('')
  const isAdmin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  const canManage = Boolean(selected && (isAdmin || selected.leadId === session.memberId))
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    try { await apiRequest<Project>('/projects', { method: 'POST', body: { title: form.get('title'), description: form.get('description') } }); setNotice('项目已创建'); projects.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
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
  return <><Heading title="项目空间" description="项目、任务、成员和里程碑均由服务端保存，并按成员权限显示。" />{notice && <p className="api-feedback" role="status">{notice}</p>}<LoadingOrError loading={projects.loading} error={projects.error} retry={projects.reload} /><div className="api-two-col"><Panel><div className="section-heading"><h2>我的项目</h2><span>{projects.data?.total ?? 0}</span></div>{projects.data?.items.map(project => <button className={`api-select-row ${selected?.id === project.id ? 'selected' : ''}`} key={project.id} onClick={() => setSelected(project)}><span><strong>{project.title}</strong><small>{project.description || '暂无项目简介'}</small></span><ChevronRight size={16} /></button>)}{projects.data?.items.length === 0 && <Empty text="你还没有可见项目。" />}<details className="api-create"><summary>新建项目</summary><form className="form-stack" onSubmit={createProject}><TextField name="title" label="项目名称" required maxLength={160} /><TextField name="description" label="项目简介" maxLength={2000} /><Button type="submit">创建项目</Button></form></details></Panel><div className="api-project-workspace">{selected ? <><Panel><div className="section-heading"><h2>{selected.title}</h2>{canManage && <Button variant="outline" onClick={archiveProject}>归档项目</Button>}</div><LoadingOrError loading={tasks.loading} error={tasks.error} retry={tasks.reload} />{tasks.data?.items.map(task => <label className="api-task-row" key={task.id}><input type="checkbox" checked={task.status === 'DONE'} onChange={event => updateTask(task, event.target.checked ? 'DONE' : 'OPEN')} /><span><strong>{task.title}</strong><small>{task.dueDate ?? '未设截止日期'}</small></span><Status>{task.status}</Status></label>)}{tasks.data?.items.length === 0 && <Empty text="这个项目还没有任务。" />}<form className="api-inline-form" onSubmit={createTask}><input className="text-input" name="title" placeholder="下一步任务" required maxLength={200} /><input className="text-input" name="dueDate" type="date" aria-label="截止日期" /><Button type="submit">添加任务</Button></form></Panel><Panel><div className="section-heading"><h2>项目成员</h2><span>{projectMembers.data?.length ?? 0}</span></div>{projectMembers.data?.map(person => <div className="api-row" key={person.memberId}><span><strong>{person.displayName}</strong><small>{person.direction ?? '研究方向待填写'}{person.cohort ? ` · ${person.cohort} 级` : ''} · {person.role === 'LEAD' ? '负责人' : '成员'}</small></span>{canManage && person.role !== 'LEAD' && <Button variant="outline" onClick={() => removeProjectMember(person.memberId)}>移除</Button>}</div>)}{canManage && <form className="api-inline-form" onSubmit={addProjectMember}><label className="field"><span>添加成员</span><select name="memberId" required defaultValue=""><option value="" disabled>选择成员</option>{directory.data?.items.filter(person => !projectMembers.data?.some(row => row.memberId === person.id)).map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><Button type="submit">添加</Button></form>}</Panel><Panel><div className="section-heading"><h2>里程碑</h2><span>{milestones.data?.filter(item => item.completedAt).length ?? 0} / {milestones.data?.length ?? 0}</span></div>{milestones.data?.map(item => <label className="api-task-row" key={item.id}><input type="checkbox" checked={Boolean(item.completedAt)} disabled={!canManage} onChange={event => toggleMilestone(item, event.target.checked)} /><span><strong>{item.title}</strong><small>{item.dueDate ?? '未设置日期'}</small></span><Status>{item.completedAt ? '完成' : '进行中'}</Status></label>)}{canManage && <form className="api-inline-form" onSubmit={addMilestone}><input className="text-input" name="title" placeholder="新增里程碑" required maxLength={200} /><input className="text-input" name="dueDate" type="date" aria-label="里程碑日期" /><Button type="submit">添加</Button></form>}</Panel></> : <Panel>{projectPanelFallback}</Panel>}</div></div></>
}

function MeetingsPage() {
  const meetings = useLoad<Page<Meeting>>('/meetings?page=1&pageSize=50')
  const members = useLoad<Page<{ id: string; displayName: string }>>('/members?page=1&pageSize=100')
  const [selected, setSelected] = useState<Meeting | null>(null)
  const minutes = useLoad<{ meetingId: string; version: number; body: string }>(selected ? `/meetings/${selected.id}/minutes` : '/meetings/00000000-0000-0000-0000-000000000000/minutes')
  const actions = useLoad<Task[]>(selected ? `/meetings/${selected.id}/actions` : '/meetings')
  const [notice, setNotice] = useState('')
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    const participants = form.getAll('participants').map(String)
    try { await apiRequest('/meetings', { method: 'POST', body: { title: form.get('title'), startsAt: `${form.get('startsAt')}:00+08:00`, participants } }); setNotice('会议已创建'); meetings.reload(); formElement.reset() }
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
    <Heading title="会议记录" description="会议时间使用实验室业务时区 Asia/Shanghai；行动项与项目和我的待办共用任务记录。" />
    {notice && <p className="api-feedback" role="status">{notice}</p>}
    <div className="api-two-col">
      <Panel>
        <div className="section-heading"><h2>会议</h2><span>{meetings.data?.total ?? 0}</span></div>
        <LoadingOrError loading={meetings.loading} error={meetings.error} retry={meetings.reload} />
        {meetings.data?.items.map(meeting => <button className={`api-select-row ${selected?.id === meeting.id ? 'selected' : ''}`} key={meeting.id} onClick={() => setSelected(meeting)}><span><strong>{meeting.title}</strong><small>{dateText(meeting.startsAt)}</small></span><ChevronRight size={16} /></button>)}
        <details className="api-create"><summary>安排会议</summary><form className="form-stack" onSubmit={create}><TextField name="title" label="会议主题" required maxLength={160} /><TextField name="startsAt" label="开始时间（北京时间）" type="datetime-local" required /><label className="field"><span>参会成员（可多选）</span><select name="participants" multiple size={4}>{members.data?.items.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><Button type="submit">创建会议</Button></form></details>
      </Panel>
      <div className="api-project-workspace">
        <Panel>
          <h2>{selected?.title ?? '会议纪要'}</h2>
          {selected ? <><LoadingOrError loading={minutes.loading} error={minutes.error} retry={minutes.reload} />{minutes.data && <form className="form-stack" onSubmit={saveMinutes}><label className="field"><span>纪要内容</span><textarea name="body" defaultValue={minutes.data.body} key={`${minutes.data.meetingId}-${minutes.data.version}`} rows={12} maxLength={20000} /></label><span className="api-note">版本 {minutes.data.version} · 保存时使用版本校验</span><Button type="submit">保存纪要</Button></form>}</> : <Empty text="选择会议以查看或编辑纪要。" />}
        </Panel>
        {selected && <Panel>
          <div className="section-heading"><h2>行动项</h2><span>共享任务</span></div>
          <LoadingOrError loading={actions.loading} error={actions.error} retry={actions.reload} />
          {actions.data?.map(task => <label className="api-task-row" key={task.id}><input type="checkbox" checked={task.status === 'DONE'} onChange={event => updateAction(task, event.target.checked)} /><span><strong>{task.title}</strong><small>{task.assigneeId ? members.data?.items.find(person => person.id === task.assigneeId)?.displayName ?? '已分配成员' : '未分配'} · {task.dueDate ?? '未设截止日期'}</small></span><Status>{task.status}</Status></label>)}
          {actions.data?.length === 0 && <Empty text="会议还没有行动项。" />}
          <form className="form-stack" onSubmit={createAction}><TextField name="title" label="行动项" required maxLength={200} /><TextField name="description" label="说明" maxLength={5000} /><label className="field"><span>负责人</span><select name="assigneeId" defaultValue=""><option value="">未分配</option>{members.data?.items.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><TextField name="dueDate" label="截止日期" type="date" /><Button type="submit">创建行动项</Button></form>
        </Panel>}
      </div>
    </div>
  </>
}

function LeavePage() {
  const mine = useLoad<Page<Leave>>('/leaves/mine?page=1&pageSize=50')
  const inbox = useLoad<Page<Leave>>('/leaves/inbox?page=1&pageSize=50')
  const members = useLoad<Page<{ id: string; displayName: string }>>('/members?page=1&pageSize=100')
  const [notice, setNotice] = useState('')
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    try { await apiRequest('/leaves', { method: 'POST', body: { startsAt: `${form.get('startsAt')}:00+08:00`, endsAt: `${form.get('endsAt')}:00+08:00`, approverId: form.get('approverId'), reason: form.get('reason') } }); setNotice('申请已提交'); mine.reload(); inbox.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function decide(leave: Leave, decision: 'APPROVED' | 'REJECTED') {
    try { await apiRequest(`/leaves/${leave.id}/decision`, { method: 'POST', body: { decision, version: leave.version } }); inbox.reload(); mine.reload() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function withdraw(leave: Leave) {
    try { await apiRequest(`/leaves/${leave.id}/withdraw`, { method: 'POST', body: { version: leave.version } }); mine.reload(); inbox.reload() }
    catch (error) { setNotice(messageOf(error)) }
  }
  return <><Heading title="请假申请" description="申请原因仅对申请人、指定审批人和授权管理员开放。" />{notice && <p className="api-feedback" role="status">{notice}</p>}<Panel className="api-form-panel"><h2>提交申请</h2><form className="api-leave-form" onSubmit={apply}><TextField name="startsAt" label="开始时间（北京时间）" type="datetime-local" required /><TextField name="endsAt" label="结束时间（北京时间）" type="datetime-local" required /><label className="field"><span>审批人</span><select name="approverId" required defaultValue=""><option value="" disabled>选择审批人</option>{members.data?.items.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><label className="field"><span>请假原因</span><textarea name="reason" required maxLength={1000} rows={3} /></label><Button type="submit">提交申请</Button></form></Panel><div className="api-two-col"><Panel><div className="section-heading"><h2>我的申请</h2></div><LoadingOrError loading={mine.loading} error={mine.error} retry={mine.reload} />{mine.data?.items.map(leave => <div className="api-leave-card" key={leave.id}><div><strong>{dateText(leave.startsAt)} — {dateText(leave.endsAt)}</strong><Status tone={leave.status === 'APPROVED' ? 'teal' : 'orange'}>{leave.status}</Status></div><p>{leave.reason}</p><small>审批人：{leave.approverName}</small>{leave.status === 'PENDING' && <div className="api-actions"><Button variant="outline" onClick={() => withdraw(leave)}>撤回</Button></div>}</div>)}{mine.data?.items.length === 0 && <Empty text="暂无申请记录。" />}</Panel><Panel><div className="section-heading"><h2>待我审批</h2></div><LoadingOrError loading={inbox.loading} error={inbox.error} retry={inbox.reload} />{inbox.data?.items.map(leave => <div className="api-leave-card" key={leave.id}><div><strong>{leave.memberName}</strong><Status>{leave.status}</Status></div><p>{dateText(leave.startsAt)} — {dateText(leave.endsAt)}</p><p>{leave.reason}</p>{leave.status === 'PENDING' && <div className="api-actions"><Button onClick={() => decide(leave, 'APPROVED')}>批准</Button><Button variant="outline" onClick={() => decide(leave, 'REJECTED')}>驳回</Button></div>}</div>)}{inbox.data?.items.length === 0 && !inbox.error && <Empty text="没有待处理申请。" />}</Panel></div></>
}

function PrintPage({ session }: { session: Session }) {
  const isAdmin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  const printers = useLoad<PrinterDevice[]>(isAdmin ? '/admin/printers' : '/printers')
  const jobs = useLoad<Page<PrintJob>>('/print/jobs?page=1&pageSize=50')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [agentCredential, setAgentCredential] = useState<{ printerId: string; agentId: string; token: string } | null>(null)
  async function createPrinter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    try { const issued = await apiRequest<{ printerId: string; agentId: string; token: string }>('/admin/printers', { method: 'POST', body: { name: form.get('printerName'), location: form.get('printerLocation') } }); setAgentCredential(issued); setNotice('打印机已登记。Agent 凭据只显示本次，请立即保存到受限配置。'); printers.reload() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function rotatePrinterCredential(printerId: string) {
    try { const issued = await apiRequest<{ printerId: string; agentId: string; token: string }>(`/admin/printers/${printerId}/rotate-agent-token`, { method: 'POST' }); setAgentCredential(issued); setNotice('Agent 凭据已轮换，旧凭据立即失效。') }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const file = data.get('file')
    if (!(file instanceof File) || !file.size) { setNotice('请选择 PDF 文件。'); return }
    setBusy(true); setNotice('正在上传并校验 PDF…')
    try {
      const upload = await apiRequest<{ id: string }>('/files', { method: 'POST', body: (() => { const body = new FormData(); body.set('file', file); return body })() })
      await apiRequest('/print/jobs', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: { printerId: data.get('printerId'), fileId: upload.id, pages: data.get('pages') || '', copies: Number(data.get('copies') || 1), sides: data.get('sides'), color: data.get('color') } })
      setNotice('打印任务已提交到服务端队列。'); jobs.reload(); form.reset()
    } catch (error) { setNotice(messageOf(error)) } finally { setBusy(false) }
  }
  async function cancel(job: PrintJob) {
    try { await apiRequest(`/print/jobs/${job.id}/cancel`, { method: 'POST', headers: { 'If-Match-Version': String(job.version) } }); jobs.reload() }
    catch (error) { setNotice(messageOf(error)); jobs.reload() }
  }
  return <><Heading title="云打印" description="服务端校验 PDF、打印选项和设备能力；取消结果以 Agent 回报为准。" />{notice && <p className="api-feedback" role="status">{notice}</p>}{agentCredential && <Panel className="api-form-panel"><div className="section-heading"><h2>新签发的 Agent 凭据</h2><Button variant="outline" onClick={() => setAgentCredential(null)}>已安全保存</Button></div><p className="api-note">关闭后不会再次显示。请写入只允许打印服务账户读取的环境配置，不要发到聊天或提交到版本库。</p><pre className="api-credential">PRINTER_ID={agentCredential.printerId}{'\n'}AGENT_ID={agentCredential.agentId}{'\n'}AGENT_TOKEN={agentCredential.token}</pre></Panel>}{isAdmin && <Panel className="api-form-panel"><h2>打印机与 Agent</h2><form className="api-inline-form" onSubmit={createPrinter}><TextField name="printerName" label="打印机名称" required maxLength={120} /><TextField name="printerLocation" label="位置" maxLength={160} /><Button type="submit">登记打印机</Button></form>{printers.data?.map(printer => <div className="api-row" key={printer.id}><span><strong>{printer.name}</strong><small>{printer.location || '未填写位置'} · {printer.status}</small></span><Button variant="outline" onClick={() => rotatePrinterCredential(printer.id)}>轮换 Agent 凭据</Button></div>)}</Panel>}<Panel className="api-form-panel"><h2>新建打印任务</h2><LoadingOrError loading={printers.loading} error={printers.error} retry={printers.reload} />{printers.data?.length === 0 && <Empty text="暂无已接入打印机；未知设备能力不会显示为可用。" />}<form className="api-print-form" onSubmit={submit}><label className="field"><span>打印机</span><select name="printerId" required defaultValue=""><option value="" disabled>选择打印机</option>{printers.data?.filter(printer => printer.status !== 'DISABLED').map(printer => <option key={printer.id} value={printer.id}>{printer.name} · {printer.status}</option>)}</select></label><label className="field"><span>PDF 文件</span><input name="file" type="file" accept="application/pdf,.pdf" required /></label><TextField name="pages" label="页码范围（留空为全部）" /><TextField name="copies" label="份数" type="number" defaultValue="1" required /><label className="field"><span>单双面</span><select name="sides"><option value="SIMPLEX">单面</option><option value="DUPLEX_LONG_EDGE">双面（长边）</option><option value="DUPLEX_SHORT_EDGE">双面（短边）</option></select></label><label className="field"><span>颜色</span><select name="color"><option value="MONOCHROME">黑白</option><option value="COLOR">彩色</option></select></label><Button type="submit" disabled={busy || !printers.data?.some(printer => printer.status !== 'DISABLED')}>{busy ? '提交中…' : '提交打印'}</Button></form></Panel><Panel><div className="section-heading"><h2>我的任务</h2><Button variant="outline" onClick={jobs.reload}>刷新</Button></div><LoadingOrError loading={jobs.loading} error={jobs.error} retry={jobs.reload} />{jobs.data?.items.map(job => <div className="api-row api-print-job" key={job.id}><span><strong>{job.fileName}</strong><small>{job.printerName} · {job.pageCount} 页 · 预计 {job.options?.estimatedSheets ?? '—'} 张</small><small>{dateText(job.createdAt)}</small></span><Status tone={['COMPLETED', 'CANCELED'].includes(job.status) ? 'teal' : job.status === 'UNKNOWN' ? 'red' : 'orange'}>{job.status}</Status>{['QUEUED', 'LEASED', 'SUBMITTING', 'SUBMITTED'].includes(job.status) && <Button variant="outline" onClick={() => cancel(job)}>申请取消</Button>}</div>)}{jobs.data?.items.length === 0 && <Empty text="还没有打印任务。" />}</Panel></>
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
  const exams = useLoad<Exam[]>(selectedTerm ? `/assessment/terms/${selectedTerm}/exams` : '/assessment/terms')
  const contests = useLoad<Contest[]>(selectedTerm ? `/assessment/terms/${selectedTerm}/contests` : '/assessment/terms')
  const termMembers = useLoad<Page<{ memberId: string; displayName: string; number: string; veteran: boolean; version: number }>>(selectedTerm ? `/assessment/terms/${selectedTerm}/members?page=1&pageSize=100` : '/assessment/terms')
  const members = useLoad<Page<{ id: string; displayName: string }>>('/members?page=1&pageSize=100')
  const selectedExam = exams.data?.find(item => item.id === examId) ?? exams.data?.[0]
  const selectedContest = contests.data?.find(item => item.id === contestId) ?? contests.data?.find(item => item.complete) ?? contests.data?.[0]
  const rankingPath = subject === 'theory' && selectedExam
    ? `/assessment/exams/${selectedExam.id}/ranking?excludeVeterans=${excludeVeterans}`
    : subject === 'acm' && selectedContest?.complete
      ? `/assessment/terms/${selectedTerm}/contests/${selectedContest.id}/ranking?excludeVeterans=${excludeVeterans}` : ''
  const ranking = useLoad<{ items: Array<Record<string, unknown>>; total: number; algorithmVersion: string; sourceVersion: string }>(rankingPath || '/assessment/terms')
  const importStatus = useLoad<{ id: string; status: string; result: Record<string, unknown> }>(importId ? `/assessment/acm/imports/${importId}` : '/assessment/terms')
  useEffect(() => { if (importId) { const timer = window.setInterval(importStatus.reload, 2500); return () => window.clearInterval(timer) } }, [importId, importStatus.reload])

  async function createTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    try { const term = await apiRequest<Term>('/assessment/terms', { method: 'POST', body: { name: form.get('name'), startsOn: form.get('startsOn'), endsOn: form.get('endsOn'), active: form.get('active') === 'on' } }); setTermId(term.id); setNotice('培养期已创建'); terms.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function addTermMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedTerm) return
    const formElement = event.currentTarget; const memberId = String(new FormData(formElement).get('memberId') ?? '')
    try { await apiRequest(`/assessment/terms/${selectedTerm}/members`, { method: 'POST', body: { memberId, veteran: false } }); setNotice('成员已加入培养期'); termMembers.reload(); terms.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function setVeteran(member: { memberId: string; veteran: boolean; version: number }, veteran: boolean) {
    try { await apiRequest(`/assessment/terms/${selectedTerm}/members/${member.memberId}`, { method: 'PATCH', body: { veteran, version: member.version } }); termMembers.reload(); terms.reload() }
    catch (error) { setNotice(messageOf(error)); termMembers.reload() }
  }
  async function createExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedTerm) return
    const form = new FormData(event.currentTarget)
    try { const exam = await apiRequest<Exam>(`/assessment/terms/${selectedTerm}/exams`, { method: 'POST', body: { title: form.get('title'), kind: form.get('kind'), startsAt: `${form.get('startsAt')}:00+08:00`, rubric: [] } }); setExamId(exam.id); setSubject('theory'); setNotice('理论考试已创建'); exams.reload(); terms.reload() }
    catch (error) { setNotice(messageOf(error)) }
  }
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
  return <><Heading title="成长与考核" description="ACM 算法与深度学习理论基础分开展示；服务端按已确认规则重算本次与历史排行。" />
    <LoadingOrError loading={terms.loading} error={terms.error} retry={terms.reload} />
    {terms.data && terms.data.length > 0 && <div className="api-assessment-toolbar"><label className="field"><span>培养期</span><select value={selectedTerm} onChange={event => setTermId(event.target.value)}>{terms.data.map(term => <option key={term.id} value={term.id}>{term.name}{term.active ? ' · 当前' : ''}</option>)}</select></label><label className="api-check"><input type="checkbox" checked={excludeVeterans} onChange={event => setExcludeVeterans(event.target.checked)} />排除已标记老成员并重算各场</label></div>}
    {notice && <p className="api-feedback" role="status">{notice}</p>}
    {canManage && <Panel className="api-form-panel"><h2>培养期、成员与场次管理</h2>{(!terms.data || terms.data.length === 0) && <form className="api-inline-form" onSubmit={createTerm}><TextField label="培养期名称" name="name" required maxLength={120} /><TextField label="开始日期" name="startsOn" type="date" required /><TextField label="结束日期" name="endsOn" type="date" required /><label className="api-check"><input type="checkbox" name="active" />设为当前培养期</label><Button type="submit">创建培养期</Button></form>}{selectedTerm && <><form className="api-inline-form" onSubmit={addTermMember}><label className="field"><span>加入成员</span><select name="memberId" required defaultValue=""><option value="" disabled>选择成员</option>{members.data?.items.filter(person => !termMembers.data?.items.some(row => row.memberId === person.id)).map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><Button type="submit">加入培养期</Button></form><div className="api-row-wrap">{termMembers.data?.items.map(person => <label key={person.memberId} className="api-check"><input type="checkbox" checked={person.veteran} onChange={event => setVeteran(person, event.target.checked)} />{person.displayName} · 老成员</label>)}</div><form className="api-inline-form" onSubmit={createExam}><TextField label="考试名称" name="title" required maxLength={160} /><label className="field"><span>形式</span><select name="kind"><option value="WRITTEN">笔试</option><option value="PRACTICAL">机试</option></select></label><TextField label="考试时间（北京时间）" name="startsAt" type="datetime-local" required /><Button type="submit">创建理论考试</Button></form><p className="api-note">每场形式固定为笔试或机试；留空量规时按百分制录入。</p></>}</Panel>}
    <div className="filter-tabs api-subject-tabs" role="tablist" aria-label="考核方向"><button role="tab" aria-selected={subject === 'acm'} className={subject === 'acm' ? 'selected' : ''} onClick={() => setSubject('acm')}>ACM 算法</button><button role="tab" aria-selected={subject === 'theory'} className={subject === 'theory' ? 'selected' : ''} onClick={() => setSubject('theory')}>深度学习理论基础</button></div>
    {subject === 'acm' && canManage && <Panel className="api-form-panel"><h2>导入整场 ACM 比赛</h2><form className="api-inline-form" onSubmit={importContest}><label className="field api-grow"><span>OJ 比赛链接</span><input value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} type="url" placeholder="https://oj.icthub.top/contest/123" required /></label><Button type="submit">提交导入</Button></form>{activeImport && <p className="api-feedback">导入状态：{activeImport.status}{activeImport.result?.code ? ` · ${String(activeImport.result.code)}` : ''}</p>}</Panel>}
    <div className="api-assessment-toolbar">{subject === 'theory' ? <label className="field"><span>理论场次</span><select value={selectedExam?.id ?? ''} onChange={event => setExamId(event.target.value)}><option value="" disabled>选择考试</option>{exams.data?.map(exam => <option key={exam.id} value={exam.id}>{exam.title} · {exam.kind === 'WRITTEN' ? '笔试' : '机试'}</option>)}</select></label> : <label className="field"><span>ACM 比赛</span><select value={selectedContest?.id ?? ''} onChange={event => setContestId(event.target.value)}><option value="" disabled>选择比赛</option>{contests.data?.map(contest => <option key={contest.id} value={contest.id}>{contest.title}{contest.complete ? '' : ' · 尚未完成'}</option>)}</select></label>}<div className="filter-tabs"><button className={rankingView === 'current' ? 'selected' : ''} onClick={() => setRankingView('current')}>本次排名</button><button className={rankingView === 'history' ? 'selected' : ''} onClick={() => setRankingView('history')}>历史排名</button></div><div className="api-actions"><Button variant="outline" onClick={downloadCsv}>导出 CSV</Button>{canManage && <Button onClick={publishRanking}>发布排行</Button>}</div></div>
    <LoadingOrError loading={exams.loading || contests.loading || ranking.loading} error={exams.error || contests.error || ranking.error} retry={() => { exams.reload(); contests.reload(); ranking.reload() }} />
    {rankingPath && ranking.data?.items && <Panel className="api-table-panel"><div className="section-heading"><h2>{subject === 'acm' ? 'ACM 算法' : '深度学习理论基础'}</h2><Status>{ranking.data.algorithmVersion ?? '服务端计分'}</Status></div><div className="api-table-wrap"><table><thead><tr><th>名次</th><th>成员</th><th>{rankingView === 'current' ? subject === 'theory' ? '本次成绩' : '本场 AC' : '综合分'}</th><th>历史均分</th><th>有效场次</th></tr></thead><tbody>{ranking.data.items.map((row, index) => { const student = row.student as { id?: string; name?: string; number?: string } | undefined; const grade = row.grade as { status?: string; score?: number | null; comment?: string | null } | undefined; return <tr key={student?.id ?? index}><td>{rankingView === 'current' ? String(row.currentRank ?? '—') : String(row.overallRank ?? '—')}</td><td><strong>{student?.name ?? '成员'}</strong><small>{student?.number ?? ''}</small>{canGrade && subject === 'theory' && selectedExam && student?.id && <details className="api-grade-editor"><summary>录入 / 修订</summary><form className="form-stack" onSubmit={event => saveGrade(event, row)}><label className="field"><span>状态</span><select name="status" defaultValue={grade?.status ?? 'GRADED'}><option value="GRADED">已评分</option><option value="PENDING">待评分</option><option value="ABSENT">缺考</option><option value="EXEMPT">免考</option></select></label><TextField label="百分制成绩" name="score" type="number" defaultValue={grade?.score == null ? '' : String(grade.score)} /><TextField label="评语" name="comment" defaultValue={grade?.comment ?? ''} maxLength={2000} /><TextField label="修订原因" name="reason" required maxLength={1000} /><Button type="submit">保存修订</Button></form></details>}</td><td>{rankingView === 'current' ? String(subject === 'theory' ? row.currentScore ?? '—' : row.currentCount ?? '—') : String(row.composite ?? '—')}</td><td>{String(row.historyAverage ?? '—')}</td><td>{String(row.historyCount ?? 0)} / {String(row.historyTotal ?? 0)}</td></tr> })}</tbody></table></div>{ranking.data.items.length === 0 && <Empty text="当前没有可展示的成绩。" />}</Panel>}
  </>
}

function ServersPage({ session }: { session: Session }) {
  const isAdmin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  const assets = useLoad<ApiAsset[]>('/monitor/assets')
  const [metrics, setMetrics] = useState<Record<string, Metric[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [series, setSeries] = useState<{ assetId: string; points: Array<{ timestamp: string; value: number }> } | null>(null)
  async function addAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement)
    try { await apiRequest('/monitor/admin/assets', { method: 'POST', body: { name: form.get('name'), prometheusJob: form.get('prometheusJob') || null, targetLabel: form.get('targetLabel') || null, gpuSupported: form.get('gpuSupported') === 'on' } }); setNotice('服务器资产已登记'); assets.reload(); formElement.reset() }
    catch (error) { setNotice(messageOf(error)) }
  }
  async function setAssetEnabled(asset: ApiAsset) {
    try { await apiRequest(`/monitor/admin/assets/${asset.id}`, { method: 'PATCH', headers: { 'If-Match-Version': String(asset.version) }, body: { name: asset.name, prometheusJob: asset.prometheusJob, targetLabel: asset.targetLabel, gpuSupported: Boolean(asset.gpuSupported), enabled: !asset.enabled } }); setNotice('服务器资产状态已更新'); assets.reload() }
    catch (error) { setNotice(messageOf(error)); assets.reload() }
  }
  async function loadCpuSeries(assetId: string) {
    try { const result = await apiRequest<{ points: Array<{ timestamp: string; value: number }> }>(`/monitor/assets/${assetId}/series?metric=CPU&range=1h`); setSeries({ assetId, points: result.points }) }
    catch (error) { setNotice(messageOf(error)) }
  }
  useEffect(() => {
    let alive = true
    Promise.all((assets.data ?? []).filter(asset => asset.enabled).map(async asset => {
      try { const response = await apiRequest<{ metrics: Metric[] }>(`/monitor/assets/${asset.id}/metrics`); if (alive) setMetrics(current => ({ ...current, [asset.id]: response.metrics })) }
      catch (error) { if (alive) setErrors(current => ({ ...current, [asset.id]: messageOf(error) })) }
    }))
    return () => { alive = false }
  }, [assets.data])
  return <><Heading title="计算资源" description="缺失指标显示待接入或无数据，不以演示值代替实测。" />{notice && <p className="api-feedback" role="status">{notice}</p>}<LoadingOrError loading={assets.loading} error={assets.error} retry={assets.reload} />{isAdmin && <Panel className="api-form-panel"><h2>登记服务器资产</h2><form className="api-inline-form" onSubmit={addAsset}><TextField label="名称" name="name" required maxLength={120} /><TextField label="Prometheus Job" name="prometheusJob" maxLength={80} /><TextField label="Instance 标签" name="targetLabel" maxLength={160} /><label className="api-check"><input type="checkbox" name="gpuSupported" />该资产有 GPU</label><Button type="submit">登记</Button></form></Panel>}<div className="api-card-grid">{assets.data?.map(asset => <Panel key={asset.id}><div className="section-heading"><h2>{asset.name}</h2><Status tone={asset.enabled ? 'teal' : 'gray'}>{asset.enabled ? '已登记' : '已停用'}</Status></div><p className="api-note">Prometheus 标签 {asset.prometheusJob ?? '待配置'} · {asset.targetLabel ?? '待配置'}</p>{errors[asset.id] && <p className="api-error-text">{errors[asset.id]}</p>}{(metrics[asset.id] ?? []).map(metric => <div className="api-metric" key={metric.metric}><span>{metric.metric}<small>{metric.sampledAt ? dateText(metric.sampledAt) : metric.status}</small></span><strong>{metric.value === null ? '—' : `${metric.value.toFixed(1)} ${metric.unit}`}<Status tone={metric.status === 'AVAILABLE' ? 'teal' : 'orange'}>{metric.status}</Status></strong></div>)}{asset.enabled && <Button variant="outline" onClick={() => loadCpuSeries(asset.id)}>读取 1 小时 CPU 曲线</Button>}{series?.assetId === asset.id && (series.points.length ? <svg className="api-series" viewBox="0 0 300 90" role="img" aria-label="过去一小时 CPU 使用率"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={series.points.map((point, index) => `${series.points.length < 2 ? 150 : index * 300 / (series.points.length - 1)},${82 - Math.max(0, Math.min(100, point.value)) * 0.72}`).join(' ')} /></svg> : <p className="api-note">所选时段没有采样点。</p>)}{isAdmin && <Button variant="outline" onClick={() => setAssetEnabled(asset)}>{asset.enabled ? '停用资产' : '重新启用'}</Button>}</Panel>)}{assets.data?.length === 0 && <Panel><Empty text="服务器资产尚未登记。" /></Panel>}</div></>
}

function ProfilePage({ session }: { session: Session }) {
  const profile = useLoad<Profile>('/members/me')
  const [notice, setNotice] = useState('')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!profile.data) return
    const form = new FormData(event.currentTarget)
    try { await apiRequest('/members/me', { method: 'PATCH', headers: { 'If-Match-Version': String(profile.data.version) }, body: { displayName: form.get('displayName'), direction: form.get('direction'), introduction: form.get('introduction') } }); setNotice('个人资料已保存'); profile.reload() }
    catch (error) { setNotice(messageOf(error)); profile.reload() }
  }
  return <><Heading title="个人资料" description="姓名和研究方向来自服务端账户资料。" /><Panel className="api-form-panel"><LoadingOrError loading={profile.loading} error={profile.error} retry={profile.reload} />{notice && <p className="api-feedback">{notice}</p>}{profile.data && <><p className="api-note">登录身份：{session.issuer}</p><form className="form-stack" onSubmit={save}><TextField label="姓名" name="displayName" required defaultValue={profile.data.displayName} maxLength={80} /><TextField label="研究方向" name="direction" defaultValue={profile.data.direction ?? ''} maxLength={160} /><label className="field"><span>一句话介绍</span><textarea name="introduction" defaultValue={profile.data.introduction ?? ''} rows={4} maxLength={1000} /></label><Button type="submit">保存资料</Button></form></>}</Panel></>
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
  return <><Heading title="管理与设置" description="实验室信息保存在服务端；仅管理员可以修改。" /><Panel className="api-form-panel"><LoadingOrError loading={settings.loading} error={settings.error} retry={settings.reload} />{notice && <p className="api-feedback">{notice}</p>}{settings.data && <form className="form-stack" onSubmit={save}><TextField name="name" label="实验室名称" required defaultValue={settings.data.name} maxLength={120} /><TextField name="location" label="所在位置" required defaultValue={settings.data.location} maxLength={160} /><label className="field"><span>业务时区</span><select name="timezone" defaultValue={settings.data.timezone}><option value="Asia/Shanghai">北京时间（Asia/Shanghai）</option><option value="Asia/Urumqi">新疆时间（Asia/Urumqi）</option><option value="UTC">UTC</option></select></label><label className="field"><span>对外简介</span><textarea name="description" defaultValue={settings.data.description} rows={4} maxLength={2000} /></label><label className="api-check"><input type="checkbox" name="mailEnabled" defaultChecked={settings.data.mailEnabled} />允许发送邮件通知</label><label className="api-check"><input type="checkbox" name="tonerAlertEnabled" defaultChecked={settings.data.tonerAlertEnabled} />启用耗材告警</label><Button type="submit">保存设置</Button></form>}</Panel></>
}

function MembersAdminPage({ session }: { session: Session }) {
  const members = useLoad<AdminMember[]>('/admin/members')
  const [notice, setNotice] = useState('')
  const isSuperAdmin = session.roles.includes('SUPER_ADMIN')
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
  return <><Heading title="成员管理" description="账户由统一身份首次登录建立；角色与停用状态由服务端控制。" />{notice && <p className="api-feedback" role="status">{notice}</p>}<LoadingOrError loading={members.loading} error={members.error} retry={members.reload} /><div className="api-card-grid">{members.data?.map(member => <Panel key={member.id}><div className="section-heading"><h2>{member.displayName}</h2><Status tone={member.active ? 'teal' : 'gray'}>{member.active ? '有效' : '已停用'}</Status></div><p className="api-note">学号 {member.studentNumber || '未录入'} · OJ 账号 {member.accountId || '未映射'}{member.cohort ? ` · ${member.cohort} 级` : ''}</p>{member.contact && <p className="api-note">联系方式：{member.contact}</p>}<div className="api-actions">{['LAB_ADMIN', 'SUPER_ADMIN', 'TEACHER'].map(role => <Status key={role} tone={member.roles.includes(role) ? 'teal' : 'gray'}>{role}</Status>)}</div><div className="api-actions"><Button variant="outline" onClick={() => setRole(member, 'LAB_ADMIN', !member.roles.includes('LAB_ADMIN'))}>{member.roles.includes('LAB_ADMIN') ? '撤销实验室管理员' : '设为实验室管理员'}</Button>{isSuperAdmin && <Button variant="outline" onClick={() => setRole(member, 'SUPER_ADMIN', !member.roles.includes('SUPER_ADMIN'))}>{member.roles.includes('SUPER_ADMIN') ? '撤销超级管理员' : '设为超级管理员'}</Button>}<Button variant={member.active ? 'danger' : 'primary'} onClick={() => setActive(member)}>{member.active ? '停用账户' : '重新启用'}</Button></div>{member.roles.includes('SUPER_ADMIN') || member.ojSyncStatus ? <div className="api-sync-status"><strong>OJ Admin：{member.ojAdminDesired === null ? '尚未请求' : member.ojAdminDesired ? '期望启用' : '期望撤销'}</strong><span>同步状态：{member.ojSyncStatus ?? 'NOT_REQUESTED'} · 已确认版本 {member.ojConfirmedVersion ?? 0} / {member.ojSyncVersion ?? 0}</span>{member.ojLastError && <span className="api-error-text">{member.ojLastError}</span>}{isSuperAdmin && <Button variant="outline" onClick={() => retryOj(member)}>重试 OJ 同步</Button>}</div> : null}</Panel>)}{members.data?.length === 0 && <Panel><Empty text="尚无账户完成统一身份登录。" /></Panel>}</div></>
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
  { path: 'leave', label: '请假申请', icon: Coffee }, { path: 'print', label: '云打印', icon: Printer },
  { path: 'assessment', label: '成长与考核', icon: GraduationCap }, { path: 'servers', label: '计算资源', icon: Server },
]

function SignedInApp({ session }: { session: Session }) {
  const location = useLocation()
  const [mobileNav, setMobileNav] = useState(false)
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  const title = navigation.find(item => location.pathname.includes(item.path))?.label ?? (location.pathname.includes('profile') ? '个人资料' : location.pathname.includes('publish') ? '公开发布' : '管理与设置')
  useEffect(() => { let active = true; apiRequest<Profile>('/members/me').then(value => { if (active) setCurrentProfile(value) }).catch(() => {}); return () => { active = false } }, [])
  useEffect(() => setMobileNav(false), [location.pathname])
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileNav(false) }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape) }, [])
  async function logout() { try { await apiRequest('/logout', { method: 'POST' }); window.location.assign('/') } catch { window.location.assign('/') } }
  const isAdmin = session.roles.some(role => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role))
  return <div className="app-shell api-app-shell">{mobileNav && <button className="nav-backdrop" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}<aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`} id="primary-navigation"><Link className="brand" to="/app/dashboard"><img className="brand-logo" src="/brand/lab-seal.png" alt="" /><span>LabOS<span className="brand-dot">.</span></span></Link><div className="workspace-picker"><span className="workspace-icon">算</span><span><strong>算法与科研实验室</strong><small>信息楼A411</small></span></div><div className="nav-caption">工作空间</div><nav aria-label="主导航">{navigation.map(({ path, label, icon: Icon }) => <NavLink key={path} to={`/app/${path}`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={17} strokeWidth={1.65} /><span>{label}</span></NavLink>)}</nav><div className="nav-caption nav-caption-second">实验室</div><NavLink to="/" className="nav-item"><BookOpen size={17} /><span>公开主页</span></NavLink>{isAdmin && <><NavLink to="/app/members" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Users size={17} /><span>成员管理</span></NavLink><NavLink to="/app/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Settings2 size={17} /><span>管理与设置</span></NavLink><NavLink to="/app/publish" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><ShieldCheck size={17} /><span>公开发布</span></NavLink></>}<div className="sidebar-bottom"><NavLink className="profile-button" to="/app/profile"><span className="avatar">{(currentProfile?.displayName ?? session.displayName ?? '成').slice(0, 1)}</span><span><strong>{currentProfile?.displayName ?? session.displayName}</strong></span><ShieldCheck size={15} /></NavLink></div></aside><div className="main-shell"><header className="topbar"><button className="icon-button mobile-menu" aria-label="打开导航" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>工作空间</span><ChevronRight size={13} /><strong>{title}</strong></div><div className="topbar-actions"><Status tone="teal"><span className="status-dot" />API 实时数据</Status><Link className="icon-button" to="/app/notifications" aria-label="查看通知"><Bell size={18} /></Link><button className="icon-button" aria-label="退出登录" onClick={logout}><X size={17} /></button><div className="topbar-divider" /><span className="avatar avatar-sm">{(currentProfile?.displayName ?? session.displayName ?? '成').slice(0, 1)}</span></div></header><main id="main-content" className="page-content" key={location.pathname}><Routes><Route path="/" element={<Navigate to="/app/dashboard" replace />} /><Route path="/app/dashboard" element={<DashboardPage />} /><Route path="/app/seats" element={<SeatsPage session={session} />} /><Route path="/app/projects" element={<ProjectsPage session={session} />} /><Route path="/app/meetings" element={<MeetingsPage />} /><Route path="/app/leave" element={<LeavePage />} /><Route path="/app/print" element={<PrintPage session={session} />} /><Route path="/app/assessment" element={<AssessmentPage session={session} />} /><Route path="/app/servers" element={<ServersPage session={session} />} /><Route path="/app/profile" element={<ProfilePage session={session} />} /><Route path="/app/members" element={isAdmin ? <MembersAdminPage session={session} /> : <div className="api-error" role="alert">当前账户无权访问成员管理。</div>} /><Route path="/app/settings" element={isAdmin ? <SettingsPage /> : <div className="api-error" role="alert">当前账户无权访问实验室设置。</div>} /><Route path="/app/publish" element={isAdmin ? <PublicationPage /> : <div className="api-error" role="alert">当前账户无权发布公开内容。</div>} /><Route path="/app/notifications" element={<NotificationsPage />} /></Routes></main></div></div>
}

export function ApiModeApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const location = useLocation()
  useEffect(() => { let active = true; if (location.pathname === '/') { setChecking(false); return () => { active = false } }; getSession().then(value => { if (active) { setSession(value); setError('') } }).catch(reason => { if (active) { setSession(null); setError(messageOf(reason)) } }).finally(() => { if (active) setChecking(false) }); return () => { active = false } }, [location.pathname])
  if (location.pathname === '/') return <PublicPage />
  if (checking) return <main className="api-auth-screen"><section className="api-auth-card"><div className="eyebrow">XJU Lab · LabOS</div><h1>算法与科研实验室</h1><p>正在验证实验室登录状态…</p></section></main>
  if (!session) return <main className="api-auth-screen"><section className="api-auth-card"><div className="eyebrow">XJU Lab · LabOS</div><h1>算法与科研实验室</h1><p>{error.includes('401') || error.includes('HTTP_ERROR') ? '请使用实验室统一身份登录。' : error || '登录状态已过期，请重新登录。'}</p><a className="button button-primary" href={loginUrl()}>统一身份登录<ArrowRight size={16} /></a><Link className="api-auth-public" to="/">浏览公开主页</Link></section></main>
  return <SignedInApp session={session} />
}
