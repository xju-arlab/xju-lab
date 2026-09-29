import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Bell, BookOpen, CalendarDays, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, Coffee, FileText, FolderKanban, GraduationCap, LayoutDashboard, LayoutGrid, List, MapPin, Menu, MoreHorizontal, Plus, Printer, Search, Send, Server, Settings2, ShieldCheck, SlidersHorizontal, Users, X, type LucideIcon } from 'lucide-react'
import { Button } from './components/ui/button'
import { ComboBox } from './components/common/ComboBox'
import { SeatsPage as SeatOverview } from './features/seats/SeatsPage'
import { readAssignments } from './features/seats/members'
import { AssessmentPage } from './features/assessment/AssessmentPage'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { initialJobs, initialLeaves, initialSeats, initialTasks, meetings, projects as seedProjects, servers, type Leave, type PrintJob, type Project, type Seat, type Task } from './demo'

type DemoState = {
  tasks: Task[]; setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  seats: Seat[]; setSeats: React.Dispatch<React.SetStateAction<Seat[]>>;
  leaves: Leave[]; setLeaves: React.Dispatch<React.SetStateAction<Leave[]>>;
  jobs: PrintJob[]; setJobs: React.Dispatch<React.SetStateAction<PrintJob[]>>;
  projects: Project[]; setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  meetingNotes: Record<string, string>; setMeetingNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  settings: LabSettings; setSettings: React.Dispatch<React.SetStateAction<LabSettings>>;
  profile: MemberProfile; setProfile: React.Dispatch<React.SetStateAction<MemberProfile>>;
  toast: (message: string) => void;
}
type LabSettings = { name: string; location: string; timezone: string; description: string; mail: boolean; toner: boolean }
type MemberProfile = { name: string; direction: string; introduction: string }
const DemoContext = createContext<DemoState>(null!)
const useDemo = () => useContext(DemoContext)
const defaultSettings: LabSettings = { name: '算法与科研实验室', location: '信息楼A411', timezone: 'Asia/Shanghai', description: '多模态学习、具身智能与高效计算。', mail: true, toner: true }
const defaultProfile: MemberProfile = { name: '赵文彪', direction: '多模态学习、视觉语言理解', introduction: '在实验中寻找答案，在记录中积累进步。' }
function readLocalState<T extends object>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Record<string, unknown> | null
    if (!saved || typeof saved !== 'object') return fallback
    const restored = Object.fromEntries(Object.entries(fallback).map(([field, defaultValue]) => [field, typeof saved[field] === typeof defaultValue ? saved[field] : defaultValue])) as T
    // Migrate the former display-only spacing in the default room label while preserving user edits.
    if (key === 'xju-lab.settings' && (restored as LabSettings).location === '信息楼 A411') (restored as LabSettings).location = defaultSettings.location
    return restored
  } catch { return fallback }
}
const navigation: { path: string; label: string; icon: LucideIcon; badge?: string }[] = [
  { path: 'dashboard', label: '总览', icon: LayoutDashboard },
  { path: 'seats', label: '工位一览', icon: LayoutGrid },
  { path: 'projects', label: '项目空间', icon: FolderKanban },
  { path: 'meetings', label: '会议记录', icon: CalendarDays },
  { path: 'leave', label: '请假申请', icon: Coffee },
  { path: 'print', label: '云打印', icon: Printer },
  { path: 'assessment', label: '成长与考核', icon: GraduationCap },
  { path: 'servers', label: '计算资源', icon: Server },
]

function Tag({ children, tone = 'gray' }: { children: ReactNode; tone?: string }) { return <span className={`tag tag-${tone}`}>{children}</span> }
function Avatar({ name, tone = 'teal', small = false }: { name: string; tone?: string; small?: boolean }) { return <span className={`avatar avatar-${tone} ${small ? 'avatar-sm' : ''}`}>{name.slice(0, 1)}</span> }
function AvatarStack({ names }: { names: string[] }) { return <div className="avatar-stack">{names.map((n, i) => <Avatar key={i} name={n} tone={['teal', 'purple', 'orange', 'blue'][i % 4]} small />)}</div> }
function Progress({ value, tone = 'teal' }: { value: number; tone?: string }) { return <div className={`progress-track progress-${tone}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${value}%` }} /></div> }
function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) { return <div className="page-heading"><div>{eyebrow && eyebrow !== title && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div><div className="heading-actions">{children}</div></div> }
function SectionHeading({ title, count, children }: { title: string; count?: number; children?: ReactNode }) { return <div className="section-heading"><h2>{title}{count !== undefined && <span className="count">{count}</span>}</h2>{children}</div> }
function Modal({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode }) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="lab-dialog"><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}{children}</DialogContent></Dialog> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><Search size={24} /><h3>{title}</h3><p>{text}</p></div> }

export default function App() {
  const [tasks, setTasks] = useState(initialTasks)
  const [seats, setSeats] = useState(() => readAssignments(initialSeats))
  const [leaves, setLeaves] = useState(initialLeaves)
  const [jobs, setJobs] = useState(initialJobs)
  const [projects, setProjects] = useState(seedProjects)
  const [meetingNotes, setMeetingNotes] = useState<Record<string, string>>({ m2: '讨论了不同数据分布下模型表现的差异，决定补充两个公开数据集上的对照实验。下次组会共享复现记录。', m3: '确定本学期项目负责人和第一轮里程碑。新成员先完成环境搭建与基线复现。' })
  const [settings, setSettings] = useState<LabSettings>(() => readLocalState('xju-lab.settings', defaultSettings))
  const [profile, setProfile] = useState<MemberProfile>(() => readLocalState('xju-lab.profile', defaultProfile))
  const [message, setMessage] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const mobileMenuButton = useRef<HTMLButtonElement>(null)
  const firstMobileLink = useRef<HTMLAnchorElement>(null)
  const mobileNavWasOpen = useRef(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifications, setNotifications] = useState(false)
  const [notificationsRead, setNotificationsRead] = useState(false)
  const [help, setHelp] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => { try { window.localStorage.setItem('xju-lab.settings', JSON.stringify(settings)) } catch {} }, [settings])
  useEffect(() => { try { window.localStorage.setItem('xju-lab.profile', JSON.stringify(profile)) } catch {} }, [profile])
  useEffect(() => {
    document.title = `${settings.name} · LabOS`
    const description = document.querySelector('meta[name="description"]')
    description?.setAttribute('content', settings.description)
  }, [settings.name, settings.description])
  useEffect(() => { setMobileNav(false); window.scrollTo(0, 0) }, [location.pathname])
  useEffect(() => {
    const wasOpen = mobileNavWasOpen.current
    mobileNavWasOpen.current = mobileNav
    if (mobileNav) firstMobileLink.current?.focus()
    else if (wasOpen) mobileMenuButton.current?.focus()
  }, [mobileNav])
  useEffect(() => {
    if (!mobileNav) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileNav(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileNav])
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(''), 3500); return () => window.clearTimeout(timer) }, [message])
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); setSearchOpen(v => !v) } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [])
  const title = navigation.find(n => location.pathname.includes(n.path))?.label ?? (location.pathname.includes('showcase') ? '实验室主页' : location.pathname.includes('profile') ? '个人资料' : '实验室设置')
  const searchResults = [...navigation.map(n => ({ title: n.label, path: `/app/${n.path}`, type: '页面' })), ...projects.map(p => ({ title: p.title, path: `/app/projects?q=${encodeURIComponent(p.title)}`, type: '项目' }))].filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()))

  return <DemoContext.Provider value={{ tasks, setTasks, seats, setSeats, leaves, setLeaves, jobs, setJobs, projects, setProjects, meetingNotes, setMeetingNotes, settings, setSettings, profile, setProfile, toast: setMessage }}>
    <div className="app-shell">
      {mobileNav && <button className="nav-backdrop" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}
      <aside id="primary-navigation" className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <Link className="brand" to="/app/dashboard"><img className="brand-logo" src="/brand/lab-seal.png" alt="" /><span>LabOS<span className="brand-dot">.</span></span></Link>
        <div className="workspace-picker"><span className="workspace-icon">算</span><span><strong>{settings.name}</strong><small>{settings.location}</small></span></div>
        <button className="sidebar-search" onClick={() => { setSearchQuery(''); setSearchOpen(true) }}><Search size={15} /><span>搜索工作空间</span><kbd>⌘ K</kbd></button>
        <div className="nav-caption">工作空间</div>
        <nav aria-label="主导航">{navigation.map(({ path, label, icon: Icon }) => <NavLink ref={path === 'dashboard' ? firstMobileLink : undefined} key={path} to={`/app/${path}`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={17} strokeWidth={1.65} /><span>{label}</span>{path === 'leave' && leaves.some(l => l.status === '待审批') && <span className="nav-count">{leaves.filter(l => l.status === '待审批').length}</span>}</NavLink>)}</nav>
        <div className="nav-caption nav-caption-second">实验室</div>
        <NavLink to="/app/showcase" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><BookOpen size={17} strokeWidth={1.65} /><span>实验室主页</span><ArrowUpRight size={13} className="muted" /></NavLink>
        <NavLink to="/app/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Settings2 size={17} strokeWidth={1.65} /><span>管理与设置</span></NavLink>
        <div className="sidebar-bottom"><button className="profile-button" onClick={() => navigate('/app/profile')}><Avatar name={profile.name} /><span><strong>{profile.name}</strong></span><MoreHorizontal size={17} /></button></div>
      </aside>
      <div className="main-shell">
        <header className="topbar"><button ref={mobileMenuButton} className="icon-button mobile-menu" aria-label="打开导航" aria-expanded={mobileNav} aria-controls="primary-navigation" onClick={() => setMobileNav(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>工作空间</span><ChevronRight size={13} /><strong>{title}</strong></div><div className="topbar-actions"><span className="demo-badge"><span />交互原型 · 演示数据</span><button className="icon-button" aria-label="查看通知" onClick={() => setNotifications(true)}><Bell size={18} />{!notificationsRead && <i className="notification-dot" />}</button><button className="icon-button help-button" aria-label="原型说明" onClick={() => setHelp(true)}><CircleHelp size={18} /></button><div className="topbar-divider" /><Avatar name={profile.name} small /></div></header>
        <main id="main-content" className="page-content" key={location.pathname}>
          <Routes>
            <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="/app/dashboard" element={<Dashboard />} />
            <Route path="/app/seats" element={<SeatsPage />} />
            <Route path="/app/projects" element={<ProjectsPage />} />
            <Route path="/app/meetings" element={<MeetingsPage />} />
            <Route path="/app/leave" element={<LeavePage />} />
            <Route path="/app/print" element={<PrintPage />} />
            <Route path="/app/servers" element={<ServersPage />} />
            <Route path="/app/assessment" element={<AssessmentPage onNotice={setMessage} />} />
            <Route path="/app/showcase" element={<ShowcasePage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
            <Route path="/app/profile" element={<ProfilePage />} />
            <Route path="*" element={<div className="empty-state"><h1>页面不存在</h1><Link to="/app/dashboard">返回总览</Link></div>} />
          </Routes>
        </main>
      </div>
    </div>
    <Modal open={searchOpen} onOpenChange={setSearchOpen} title="搜索工作空间"><div className="search-input"><Search size={17} /><input autoFocus placeholder="输入页面或项目名称…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div><div className="search-results">{searchResults.map(r => <button key={r.path} onClick={() => { navigate(r.path); setSearchOpen(false) }}><span>{r.title}</span><Tag>{r.type}</Tag><ArrowRight size={14} /></button>)}{!searchResults.length && <Empty title="没有找到相关内容" text="未找到匹配内容。" />}</div></Modal>
    <Modal open={notifications} onOpenChange={setNotifications} title="通知中心"><div className="notice-list"><div><span className="notice-icon"><CalendarDays size={18} /></span><div><strong>今天 14:30，实验室每周例会</strong><p>研讨室 302</p><small>30 分钟前</small></div></div><div><span className="notice-icon orange"><Printer size={18} /></span><div><strong>打印机黑色耗材余量</strong><p>13%</p><small>1 小时前</small></div></div></div><Button variant="outline" onClick={() => { setNotificationsRead(true); setNotifications(false); setMessage('通知已标为已读') }}><CheckCheck />全部标为已读</Button></Modal>
    <Modal open={help} onOpenChange={setHelp} title="版本信息"><div className="integration-list"><span>待接入</span><p>统一登录 · 邮件通知 · 打印服务 · 服务器监控</p></div><Button onClick={() => setHelp(false)}>关闭</Button></Modal>
    {message && <div className="toast" role="status"><Check size={16} /><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage('')}><X size={14} /></button></div>}
  </DemoContext.Provider>
}

function Dashboard() {
  const { tasks, setTasks, seats, projects, leaves, profile } = useDemo()
  const [project, setProject] = useState<Project | null>(null)
  const [onlyPending, setOnlyPending] = useState(true)
  const featuredServers = [...servers.filter(server => server.kind === 'gpu').slice(0, 2), ...servers.filter(server => server.kind === 'cpu')]
  const stats = [
    { label: '已分配工位', value: String(seats.filter(s => s.name).length).padStart(2, '0'), suffix: `/ ${seats.length}`, icon: Users, tone: 'teal' },
    { label: '进行中项目', value: String(projects.length).padStart(2, '0'), suffix: '个', icon: FolderKanban, tone: 'purple' },
    { label: '我的待办', value: String(tasks.filter(t => !t.done).length).padStart(2, '0'), suffix: '项', icon: CheckCheck, tone: 'orange' },
    { label: '待审批申请', value: String(leaves.filter(l => l.status === '待审批').length).padStart(2, '0'), suffix: '条', icon: Coffee, tone: 'blue' },
  ]
  return <>
    <div className="dashboard-heading"><div><div className="eyebrow"><span className="tiny-sun">✳</span> 2026 年 9 月 29 日 · 星期二</div><h1>早上好，{profile.name}<span className="greeting-period">。</span></h1></div><Link to="/app/projects" className="quiet-button"><FolderKanban size={15} />进入项目空间<ArrowUpRight size={14} /></Link></div>
    <div className="stats-grid">{stats.map(s => <div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><s.icon size={17} strokeWidth={1.7} className={`text-${s.tone}`} /></div><div className="stat-value">{s.value}<span>{s.suffix}</span></div></div>)}</div>
    <div className="meeting-banner"><div className="calendar-block"><span>9 月</span><strong>29</strong></div><div className="meeting-banner-copy"><div className="inline-row"><Tag tone="orange">今日安排</Tag><span className="small muted">14:30 – 16:00</span></div><h3>实验室每周例会</h3><p><MapPin size={12} />研讨室 302</p></div><div className="meeting-attendees"><AvatarStack names={['李', '陈', '林', '周']} /><span>共 12 位成员</span></div><Button variant="outline" asChild><Link to="/app/meetings">查看议程<ArrowRight /></Link></Button><div className="banner-orbit" aria-hidden="true"><span /><span /><span /></div></div>
    <div className="dashboard-columns"><section className="projects-section"><SectionHeading title="我的项目" count={projects.length}><Link className="text-link" to="/app/projects">全部项目<ArrowRight size={13} /></Link></SectionHeading><div className="dashboard-project-grid">{projects.slice(0, 4).map(p => <ProjectCard key={p.id} project={p} onClick={() => setProject(p)} compact />)}</div></section><section className="todo-section"><SectionHeading title="待办清单" count={tasks.filter(t => !t.done).length}><button className="icon-button" aria-label={onlyPending ? '显示全部任务' : '仅显示未完成任务'} onClick={() => setOnlyPending(!onlyPending)}><SlidersHorizontal size={16} /></button></SectionHeading><div className="todo-panel"><div className="todo-tabs"><button className={onlyPending ? 'selected' : ''} onClick={() => setOnlyPending(true)}>待完成</button><button className={!onlyPending ? 'selected' : ''} onClick={() => setOnlyPending(false)}>全部任务</button></div>{tasks.filter(t => !onlyPending || !t.done).map(t => <label key={t.id} className={`task-row ${t.done ? 'task-done' : ''}`}><input type="checkbox" checked={t.done} onChange={() => setTasks(prev => prev.map(item => item.id === t.id ? { ...item, done: !item.done } : item))} /><div><strong>{t.title}</strong></div><span className={`task-date ${t.priority ? 'urgent' : ''}`}>{t.date}</span></label>)}{!tasks.some(t => !t.done) && onlyPending && <div className="all-done"><CheckCheck size={26} /><p>今天的任务都完成了，做得不错。</p></div>}<Link className="todo-footer" to="/app/projects"><Plus size={14} />在项目中管理任务</Link></div></section></div>
    <section className="resource-section"><SectionHeading title="实验室资源"><Link className="text-link" to="/app/servers">查看资源<ArrowRight size={13} /></Link></SectionHeading><div className="resource-grid">{featuredServers.map(server => <Link to="/app/servers" className="resource-card" key={server.id}><div className="resource-icon"><Server size={21} strokeWidth={1.5} /></div><div><strong>{server.name}</strong><p>{server.kind === 'gpu' ? `${server.gpu.filter(value => value > 0).length} / ${server.gpu.length} 块 GPU 使用中` : '部署节点 · 配置待录入'}</p></div><span className={`resource-status ${server.status === '待接入' ? 'resource-status-pending' : ''}`}><i />{server.status === '待接入' ? '待接入' : '正常'}</span><ChevronRight size={15} className="muted" /></Link>)}<Link className="resource-card" to="/app/print"><div className="resource-icon"><Printer size={21} strokeWidth={1.5} /></div><div><strong>实验室打印机</strong></div><Tag tone="orange">耗材 13%</Tag><ChevronRight size={15} className="muted" /></Link></div></section>
    <ProjectDetail project={project} onClose={() => setProject(null)} />
  </>
}

function ProjectCard({ project: p, onClick, compact = false }: { project: Project; onClick: () => void; compact?: boolean }) { return <button className={`project-card ${compact ? 'project-compact' : ''}`} onClick={onClick}><div className="project-top"><span className={`project-icon icon-${p.tone}`}><FolderKanban size={19} strokeWidth={1.6} /></span><Tag tone={p.tone}>{p.area}</Tag><ArrowUpRight size={15} className="project-arrow" /></div><h3>{p.title}</h3><div className="project-progress-label"><span>{p.stage}</span><strong>{p.progress}<small>%</small></strong></div><Progress value={p.progress} tone={p.tone} /><div className="project-bottom"><AvatarStack names={p.members} /><span><Clock3 size={12} />{p.deadline}</span></div></button> }
function ProjectDetail({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { tasks, setTasks, toast } = useDemo()
  const [newTask, setNewTask] = useState('')
  if (!project) return null
  const related = tasks.filter(t => t.project === project.title)
  return <Modal open={!!project} onOpenChange={v => { if (!v) onClose() }} title={project.title}><div className="inline-row"><Tag tone={project.tone}>{project.area}</Tag><Tag>{project.stage}</Tag><span className="ml-auto small muted">截止 {project.deadline}</span></div><Progress value={project.progress} tone={project.tone} /><SectionHeading title="项目任务" count={related.length} /><div>{related.map(t => <label className={`task-row ${t.done ? 'task-done' : ''}`} key={t.id}><input type="checkbox" checked={t.done} onChange={() => setTasks(prev => prev.map(i => i.id === t.id ? { ...i, done: !i.done } : i))} /><strong>{t.title}</strong><span className="ml-auto small muted">{t.date}</span></label>)}{related.length === 0 && <p className="small muted">还没有任务，可以添加第一项。</p>}</div><form className="inline-row" onSubmit={e => { e.preventDefault(); if (!newTask.trim()) return; setTasks(prev => [...prev, { id: crypto.randomUUID(), title: newTask.trim(), project: project.title, date: '待安排', done: false }]); setNewTask(''); toast('任务已添加') }}><input className="text-input flex-1" aria-label="新任务名称" placeholder="添加一个下一步行动…" value={newTask} onChange={e => setNewTask(e.target.value)} required maxLength={120} /><Button type="submit" size="sm"><Plus />添加</Button></form><div className="detail-footer"><AvatarStack names={project.members} /><span className="small muted">最近更新：{project.updated}</span></div></Modal>
}
function ProjectsPage() {
  const { projects, setProjects, toast, profile } = useDemo()
  const location = useLocation()
  const [query, setQuery] = useState(new URLSearchParams(location.search).get('q') ?? '')
  const [filter, setFilter] = useState('全部项目')
  const [project, setProject] = useState<Project | null>(null)
  const [create, setCreate] = useState(false)
  useEffect(() => { setQuery(new URLSearchParams(location.search).get('q') ?? '') }, [location.search])
  const filtered = projects.filter(p => `${p.title}${p.subtitle}`.toLowerCase().includes(query.toLowerCase()) && (filter === '全部项目' || p.stage === filter))
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const title = String(form.get('name')).trim()
    const due = String(form.get('deadline'))
    if (!title) { toast('请填写项目名称'); return }
    const deadline = due ? due.replaceAll('-', '/') : '待安排'
    setProjects(prev => [...prev, { id: crypto.randomUUID(), title, subtitle: String(form.get('description')).trim(), area: String(form.get('area')), tone: 'teal', progress: 0, stage: '调研中', deadline, members: [profile.name], updated: '刚刚' }])
    setCreate(false)
    toast('项目已创建')
  }
  return <><PageHeading eyebrow="项目协作" title="项目空间"><Button onClick={() => setCreate(true)}><Plus />新建项目</Button></PageHeading><div className="toolbar"><div className="filter-tabs">{['全部项目', '调研中', '实验中', '论文撰写'].map(f => <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f}{f === '全部项目' && <span>{projects.length}</span>}</button>)}</div><div className="search-input"><Search size={15} /><input aria-label="搜索项目" placeholder="搜索项目…" value={query} onChange={e => setQuery(e.target.value)} /></div></div><div className="project-grid">{filtered.map(p => <ProjectCard key={p.id} project={p} onClick={() => setProject(p)} />)}</div>{!filtered.length && <Empty title="没有找到相关项目" text="调整关键词或筛选条件，试试看。" />}<ProjectDetail project={project} onClose={() => setProject(null)} /><Modal open={create} onOpenChange={setCreate} title="新建项目"><form className="form-stack" onSubmit={submit}><Field label="项目名称"><input name="name" required maxLength={80} placeholder="填写项目名称" /></Field><Field label="一句话介绍"><input name="description" maxLength={140} placeholder="研究目标（可选）" /></Field><div className="form-grid"><Field label="研究方向"><ComboBox name="area" options={['多模态学习', '具身智能', '高效计算', '计算机视觉'].map(label => ({ value: label, label }))} /></Field><Field label="目标日期"><input type="date" name="deadline" required /></Field></div><Button type="submit">创建项目<ArrowRight /></Button></form></Modal></>
}

function SeatsPage() {
  const { seats, setSeats, toast, settings } = useDemo()
  return <SeatOverview seats={seats} setSeats={setSeats} toast={toast} location={settings.location} />
}

function LeavePage() {
  const { leaves, setLeaves, toast, profile } = useDemo()
  const [create, setCreate] = useState(false)
  const [tab, setTab] = useState('我的申请')
  const [selected, setSelected] = useState<Leave | null>(null)
  const [validation, setValidation] = useState('')
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const from = String(form.get('from'))
    const to = String(form.get('to'))
    const reason = String(form.get('reason')).trim()
    if (to <= from) { setValidation('结束日期需晚于开始日期。'); return }
    if (!reason) { setValidation('请填写请假原因。'); return }
    const overlaps = leaves.some(leave => leave.name === profile.name && leave.status !== '已撤回' && from < leave.to && to > leave.from)
    if (overlaps) { setValidation('申请日期与已有记录重叠。'); return }
    setLeaves(prev => [{ id: crypto.randomUUID(), name: profile.name, type: String(form.get('type')), from, to, reason, status: '待审批', approver: '李老师' }, ...prev])
    setCreate(false)
    setValidation('')
    toast('请假申请已提交')
  }
  function changeStatus(id: string, status: Leave['status']) {
    const current = leaves.find(leave => leave.id === id)
    if (!current || current.status !== '待审批') return
    setLeaves(prev => prev.map(leave => leave.id === id ? { ...leave, status } : leave))
    setSelected(null)
    toast(status === '已撤回' ? '申请已撤回' : status === '已通过' ? '申请已通过' : '申请已驳回')
  }
  const shown = tab === '我的申请' ? leaves : leaves.filter(leave => leave.status === '待审批')
  return <><PageHeading eyebrow="请假申请" title="请假申请"><Button onClick={() => { setValidation(''); setCreate(true) }}><Plus />申请请假</Button></PageHeading><div className="toolbar"><div className="filter-tabs">{['我的申请', '审批演示'].map(item => <button className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div></div><div className="panel table-wrap"><table><thead><tr><th>申请人 / 类型</th><th>请假时间</th><th>审批人</th><th>状态</th><th>操作</th></tr></thead><tbody>{shown.map(leave => <tr key={leave.id}><td><div className="table-person"><Avatar name={leave.name} small /><div><strong>{leave.name}</strong><small>{leave.type}</small></div></div></td><td>{leave.from}<span className="muted"> 至 </span>{leave.to}</td><td>{leave.approver}</td><td><Tag tone={leave.status === '待审批' ? 'orange' : leave.status === '已通过' ? 'teal' : 'gray'}>{leave.status}</Tag></td><td><button className="text-link" onClick={() => setSelected(leave)}>查看详情<ChevronRight size={13} /></button></td></tr>)}</tbody></table>{!shown.length && <Empty title="没有待审批申请" text="当前列表为空。" />}</div><Modal open={create} onOpenChange={setCreate} title="新建请假申请"><form className="form-stack" onSubmit={submit}><Field label="请假类型"><ComboBox name="type" options={["事假", "病假", "学术活动"].map(label => ({ value: label, label }))} /></Field><div className="form-grid"><Field label="开始日期"><input type="date" name="from" required /></Field><Field label="结束日期（当天不计）"><input type="date" name="to" required /></Field></div><Field label="请假原因"><textarea name="reason" required rows={3} maxLength={1000} placeholder="填写请假原因" /></Field>{validation && <p className="form-error" role="alert">{validation}</p>}<Button type="submit"><Send />提交申请</Button></form></Modal><Modal open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }} title="请假申请详情" description={(selected?.name ?? '') + ' · ' + (selected?.from ?? '') + ' 至 ' + (selected?.to ?? '')}>{selected && <><Tag tone={selected.status === '已通过' ? 'teal' : selected.status === '待审批' ? 'orange' : 'gray'}>{selected.status}</Tag><p className="body-copy">{selected.reason}</p><p className="small muted">审批人：{selected.approver}</p>{selected.status === '待审批' && <div className="dialog-actions">{tab === '审批演示' ? <><Button variant="outline" onClick={() => changeStatus(selected.id, '已驳回')}>驳回申请</Button><Button onClick={() => changeStatus(selected.id, '已通过')}><Check />通过申请</Button></> : <Button variant="outline" onClick={() => changeStatus(selected.id, '已撤回')}>撤回申请</Button>}</div>}</>}</Modal></>
}

function PrintPage() {
  const { jobs, setJobs, toast, settings } = useDemo()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  function selectFile(selected?: File) {
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.pdf')) { setError('请选择 PDF 文件。'); return }
    if (selected.size > 20 * 1024 * 1024) { setError('文件不能超过 20 MB。'); return }
    setFile(selected)
    setError('')
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!file) { setError('请先选择 PDF 文件。'); return }
    const form = new FormData(e.currentTarget)
    setJobs(prev => [{ id: 'PJ-' + crypto.randomUUID().slice(0, 8).toUpperCase(), name: file.name, options: String(form.get('copies')) + ' 份 · ' + String(form.get('color')) + ' · ' + String(form.get('sides')), status: '排队中', time: '刚刚' }, ...prev])
    setFile(null)
    setError('')
    toast('已加入打印队列')
  }
  function cancelJob(id: string) {
    setJobs(prev => prev.map(job => job.id === id ? { ...job, status: '已取消' } : job))
    toast('打印任务已取消')
  }
  return <><PageHeading eyebrow="打印任务" title="云打印"><Tag tone="orange">打印服务待接入</Tag></PageHeading><div className="print-layout"><form className="panel print-form" onSubmit={submit}><SectionHeading title="提交打印" /><label className={'upload-zone ' + (file ? 'has-file' : '')} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); selectFile(e.dataTransfer.files[0]) }}><input type="file" accept="application/pdf,.pdf" onChange={e => { selectFile(e.target.files?.[0]); e.target.value = '' }} /><div className="upload-symbol"><FileText size={28} strokeWidth={1.3} /></div><strong>{file ? file.name : '选择 PDF 文件'}</strong><span>{file ? Math.ceil(file.size / 1024) + ' KB' : 'PDF · 20 MB 以内'}</span></label><div className="form-grid"><Field label="打印机"><ComboBox name="printer" options={[{ value: "实验室打印机 01 · " + settings.location, label: "实验室打印机 01 · " + settings.location }]} /></Field><Field label="份数"><input name="copies" type="number" defaultValue={1} min={1} max={20} required /></Field><Field label="单双面"><ComboBox name="sides" options={["长边双面", "短边双面", "单面"].map(label => ({ value: label, label }))} /></Field><Field label="色彩"><ComboBox name="color" options={["黑白", "彩色"].map(label => ({ value: label, label }))} /></Field></div>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" className="w-full"><Printer />加入队列</Button></form><aside className="print-aside"><div className="printer-illustration" aria-hidden="true"><div className="paper"><span /><span /><span /><span /></div><div className="printer-body"><i /><span /></div><div className="printer-output" /></div><h3>实验室打印机 01</h3><p>{settings.location}</p><div className="supply-row"><span>黑色耗材</span><strong>13%</strong></div><Progress value={13} tone="orange" /><Tag tone="orange">耗材偏低</Tag></aside></div><section className="section-spaced"><SectionHeading title="打印记录" count={jobs.length} /><div className="panel table-wrap"><table><thead><tr><th>文档</th><th>打印设置</th><th>状态</th><th>提交时间</th><th /></tr></thead><tbody>{jobs.map(job => <tr key={job.id}><td><div className="inline-row"><FileText size={17} className="muted" /><span>{job.name}</span></div><small className="mono muted">{job.id}</small></td><td>{job.options}</td><td><Tag tone={job.status === '已完成' ? 'teal' : job.status === '排队中' ? 'orange' : 'gray'}>{job.status}</Tag></td><td className="muted">{job.time}</td><td>{job.status === '排队中' && <button className="text-link" onClick={() => cancelJob(job.id)}>取消</button>}</td></tr>)}</tbody></table>{!jobs.length && <Empty title="没有打印记录" text="选择 PDF 后提交打印。" />}</div></section></>
}

function MeetingsPage() {
  const [selected, setSelected] = useState<(typeof meetings)[number] | null>(null)
  const [draft, setDraft] = useState('')
  const { toast, meetingNotes, setMeetingNotes } = useDemo()
  return <><PageHeading eyebrow="会议记录" title="会议记录"><Tag>2026 年秋季学期</Tag></PageHeading><div className="meeting-list">{meetings.map(m => <button className="meeting-list-card" key={m.id} onClick={() => { setSelected(m); setDraft(meetingNotes[m.id] ?? '') }}><div className="meeting-date"><span>{m.month}</span><strong>{m.date}</strong></div><div className="meeting-list-main"><div className="inline-row"><h3>{m.title}</h3><Tag tone={m.tag === '即将开始' ? 'orange' : 'gray'}>{m.tag}</Tag></div><p><Clock3 size={13} />{m.time}<MapPin size={13} />{m.place}</p><span className="small muted">{m.agenda[0]} · {m.agenda[1]}</span></div><div className="meeting-list-people"><AvatarStack names={['李', '陈', '林']} /><span>{m.people} 人参加</span></div><ChevronRight size={17} className="muted" /></button>)}</div><Modal open={!!selected} onOpenChange={v => { if (!v) setSelected(null) }} title={selected?.title ?? ''} description={`${selected?.time ?? ''} · ${selected?.place ?? ''}`}><h3 className="subheading">会议议程</h3><ol className="agenda-list">{selected?.agenda.map(a => <li key={a}>{a}</li>)}</ol><Field label="会议纪要"><textarea rows={4} value={draft} onChange={e => setDraft(e.target.value)} placeholder="记录讨论结论与下一步行动…" /></Field><Button onClick={() => { if (selected) setMeetingNotes(prev => ({ ...prev, [selected.id]: draft })); setSelected(null); toast('会议纪要已保存') }}>保存纪要<Check /></Button></Modal></>
}

function ServersPage() {
  const [selected, setSelected] = useState<(typeof servers)[number] | null>(null)
  const [timeRange, setTimeRange] = useState('1 小时')
  const timeSeries: Record<string, number[]> = {
    '1 小时': [22, 31, 27, 45, 39, 55, 48, 61, 46, 52, 69, 58, 73, 64, 77, 68, 72],
    '6 小时': [18, 24, 37, 30, 48, 53, 42, 63, 58, 71, 65, 76, 59, 69, 82, 74, 78],
    '24 小时': [12, 18, 16, 29, 25, 34, 31, 27, 48, 42, 53, 47, 62, 58, 69, 64, 72],
  }
  const gpuServers = servers.filter(server => server.kind === 'gpu')
  const gpuCount = gpuServers.reduce((sum, server) => sum + server.gpu.length, 0)
  const busyGpu = gpuServers.reduce((sum, server) => sum + server.gpu.filter(value => value > 0).length, 0)
  const memoryGb = servers.reduce((sum, server) => sum + (server.memoryGb ?? 0), 0)
  const chartOffset = selected?.cpu ?? 0
  const chartValues = timeSeries[timeRange].map(value => selected ? Math.round((value + chartOffset) / 2) : value)
  const chartPath = chartValues.map((value, index) => (index ? 'L' : 'M') + (index * 500 / (chartValues.length - 1)) + ' ' + (160 - value * 1.3)).join(' ') + ' L500 160 L0 160 Z'

  return <>
    <PageHeading eyebrow="计算资源" title="计算资源"><Tag tone="orange">监控接口待接入</Tag></PageHeading>
    <div className="server-summary">
      <div><strong>{servers.length}</strong><span>台计算服务器</span></div>
      <div><strong>{gpuCount}</strong><span>块 GPU</span></div>
      <div><strong>{gpuCount - busyGpu}</strong><span>块空闲 GPU</span></div>
      <div><strong>{(memoryGb / 1024).toFixed(2)} <small>TB</small></strong><span>已登记内存</span></div>
    </div>
    <div className="server-grid">
      {servers.map(server => <section className="panel server-card" key={server.id}>
        <div className="server-card-top">
          <div className="resource-icon"><Server size={22} /></div>
          <Tag tone={server.status === '运行中' ? 'teal' : 'gray'}><span className={`status-dot ${server.status === '待接入' ? 'status-dot-pending' : ''}`} />{server.status}</Tag>
        </div>
        <h3>{server.name}</h3>
        <p className="server-spec">{server.config}</p>
        {server.status === '待接入' ? <div className="server-pending-note"><strong>资源配置待录入</strong><span>CPU 型号、核心数、内存与磁盘容量</span></div> : <div className="server-metrics">
          {([['CPU', server.cpu], ['内存', server.ram], ['磁盘', server.disk]] as const).map(([label, value]) => <div key={label}><span>{label}<strong>{value}%</strong></span><Progress value={value ?? 0} tone="gray" /></div>)}
        </div>}
        {server.gpu.length > 0 ? <>
          <div className="gpu-title"><span>GPU 利用率</span><span>{server.gpu.filter(value => value > 0).length} / {server.gpu.length} 使用中</span></div>
          <div className="gpu-blocks">{server.gpu.map((value, index) => <div key={index} className={value ? 'gpu-busy' : ''}><span>GPU {index}</span><strong>{value}%</strong></div>)}</div>
        </> : <div className="server-no-gpu">CPU 部署节点</div>}
        {server.status === '待接入' ? <span className="server-details server-details-disabled">资源详情待录入</span> : <button className="server-details" onClick={() => setSelected(server)}>查看运行详情<ArrowRight size={14} /></button>}
      </section>)}
    </div>
    <Modal open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }} title={selected?.name ?? ''}>
      <div className="filter-tabs">{['1 小时', '6 小时', '24 小时'].map(range => <button key={range} className={timeRange === range ? 'selected' : ''} onClick={() => setTimeRange(range)}>{range}</button>)}</div>
      <div className="chart-demo"><div className="chart-title">CPU 利用率</div><div className="chart-grid"><span>100%</span><span>50%</span><span>0%</span></div><svg viewBox="0 0 500 160" role="img" aria-label={timeRange + ' CPU 利用率'}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f7b6c" stopOpacity=".14" /><stop offset="100%" stopColor="#0f7b6c" stopOpacity="0" /></linearGradient></defs><path d={chartPath} fill="url(#chartFill)" stroke="#0f7b6c" strokeWidth="2" /></svg></div>
    </Modal>
  </>
}

function ShowcasePage() {
  const [tab, setTab] = useState('研究方向')
  const { toast, settings } = useDemo()
  return <><div className="showcase-hero"><div className="eyebrow">{settings.name}</div><h1>理解智能，<br />探索更多可能<span>。</span></h1><p>{settings.description}</p><div className="inline-row"><Button onClick={() => setTab('加入我们')}>加入我们的探索<ArrowUpRight /></Button><Button variant="ghost" onClick={() => setTab('研究方向')}>了解研究方向<ArrowRight /></Button></div><div className="showcase-art"><img src="/brand/lab-wordmark.png" alt="新疆大学算法与科研实验室标志" /></div></div><div className="toolbar"><div className="filter-tabs">{['研究方向', '实验室动态', '加入我们'].map(t => <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>{t}</button>)}</div></div>{tab === '研究方向' ? <div className="research-grid">{[['01', '多模态学习', '连接视觉、语言与声音，探索更完整的世界表示。'], ['02', '具身智能', '在交互中学习，让模型理解与行动相互联系。'], ['03', '高效计算', '以更轻量的方法，推动模型在真实环境中应用。']].map(([n, title, copy]) => <div className="research-card" key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></div>)}</div> : tab === '实验室动态' ? <div className="panel record-list">{['2026 秋季学期研究分享正式开始', '本学期论文阅读与复现计划发布', '欢迎新同学加入实验室'].map((t, i) => <div key={t}><span className="small muted">09.{29 - i * 5}</span><strong>{t}</strong></div>)}</div> : <div className="panel join-panel"><h2>招募信息</h2><Tag tone="orange">申请接口待接入</Tag><Button variant="outline" onClick={() => toast('申请接口待接入')}><Send />申请加入</Button></div>}</>
}

function SettingsPage() {
  const { toast, settings, setSettings } = useDemo()
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [settings])
  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = draft.name.trim()
    const location = draft.location.trim()
    if (!name || !location) { toast('实验室名称和位置不能为空。'); return }
    setSettings(prev => ({ ...prev, ...draft, name, location, description: draft.description.trim() }))
    toast('实验室信息已保存')
  }
  return <><PageHeading eyebrow="空间设置" title="管理与设置" /><div className="settings-grid"><div className="panel settings-panel"><SectionHeading title="实验室信息" /><form className="form-stack" onSubmit={saveSettings}><Field label="实验室名称"><input value={draft.name} onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} required /></Field><Field label="所在位置"><input value={draft.location} onChange={e => setDraft(prev => ({ ...prev, location: e.target.value }))} required /></Field><Field label="业务时区"><ComboBox value={draft.timezone} onValueChange={timezone => setDraft(prev => ({ ...prev, timezone }))} options={[{ value: 'Asia/Shanghai', label: '北京时间（UTC+8）' }, { value: 'Asia/Urumqi', label: '新疆时间（UTC+6）' }, { value: 'UTC', label: '协调世界时（UTC）' }]} /></Field><Field label="对外简介"><textarea value={draft.description} onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))} rows={3} /></Field><Button type="submit">保存设置</Button></form></div><div className="settings-side"><div className="panel settings-panel"><SectionHeading title="统一身份" /><div className="inline-row"><ShieldCheck size={22} className="text-teal" /><div><strong>Authentik 统一身份认证</strong></div></div><Tag tone="orange">登录接口待接入</Tag></div><div className="panel settings-panel"><SectionHeading title="通知偏好" /><label className="toggle-row"><span><strong>审批邮件通知</strong><small>有新审批时发送邮件</small></span><input type="checkbox" checked={settings.mail} onChange={e => setSettings(prev => ({ ...prev, mail: e.target.checked }))} /></label><label className="toggle-row"><span><strong>耗材余量提醒</strong><small>打印机耗材低于阈值时提醒</small></span><input type="checkbox" checked={settings.toner} onChange={e => setSettings(prev => ({ ...prev, toner: e.target.checked }))} /></label><Tag>通知接口待接入</Tag></div></div></div></>
}
function ProfilePage() {
  const { toast, profile, setProfile, seats, setSeats, leaves, setLeaves, projects, setProjects } = useDemo()
  const [draft, setDraft] = useState(profile)
  const assignedSeat = seats.find(seat => seat.name === profile.name)?.id
  useEffect(() => setDraft(profile), [profile])
  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = draft.name.trim()
    if (!name) { toast('姓名不能为空。'); return }
    const previousName = profile.name
    setSeats(prev => prev.map(seat => seat.name === previousName ? { ...seat, name } : seat))
    setLeaves(prev => prev.map(leave => leave.name === previousName ? { ...leave, name } : leave))
    setProjects(prev => prev.map(project => ({ ...project, members: project.members.map(member => member === previousName ? name : member) })))
    setProfile({ ...draft, name })
    toast('个人资料已保存')
  }
  return <><PageHeading eyebrow="个人资料" title="个人资料" /><div className="panel profile-panel"><div className="profile-cover" /><div className="profile-main"><Avatar name={draft.name || profile.name} /><h2>{draft.name}</h2><p>{draft.direction}</p><div className="inline-row"><Tag>{assignedSeat ? `工位 ${assignedSeat}` : '暂无工位'}</Tag></div><form className="form-stack" onSubmit={saveProfile}><Field label="姓名"><input value={draft.name} onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} required maxLength={40} /></Field><Field label="研究方向"><input value={draft.direction} onChange={e => setDraft(prev => ({ ...prev, direction: e.target.value }))} maxLength={80} /></Field><Field label="一句话介绍"><textarea value={draft.introduction} onChange={e => setDraft(prev => ({ ...prev, introduction: e.target.value }))} rows={3} maxLength={240} /></Field><Button type="submit">保存资料</Button></form></div></div></>
}
