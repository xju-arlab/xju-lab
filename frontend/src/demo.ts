import { workstations } from './features/seats/layout'
import { seatMembers } from './features/seats/members'

export type Project = {
  id: string; title: string; subtitle: string; area: string; tone: string;
  progress: number; stage: string; deadline: string; members: string[]; updated: string;
}
export const projects: Project[] = [
  { id: 'p1', title: '多模态伪造检测', subtitle: '多模态特征识别', area: '多模态学习', tone: 'teal', progress: 72, stage: '实验中', deadline: '10 月 15 日', members: ['陈', '林', '许'], updated: '2 小时前' },
  { id: 'p2', title: '面向真实环境的世界模型', subtitle: '真实环境中的世界模型', area: '具身智能', tone: 'purple', progress: 45, stage: '实验中', deadline: '11 月 02 日', members: ['周', '赵'], updated: '昨天' },
  { id: 'p3', title: '轻量化视觉语言模型', subtitle: '轻量化模型研发', area: '高效计算', tone: 'orange', progress: 88, stage: '论文撰写', deadline: '10 月 08 日', members: ['林', '苏', '王'], updated: '3 小时前' },
  { id: 'p4', title: '开放场景下的视觉定位', subtitle: '开放场景视觉定位', area: '计算机视觉', tone: 'blue', progress: 20, stage: '调研中', deadline: '11 月 20 日', members: ['许', '赵'], updated: '2 天前' },
]
export type Task = { id: string; title: string; project: string; date: string; done: boolean; priority?: boolean }
export const initialTasks: Task[] = [
  { id: 't1', title: '整理消融实验结果', project: '多模态伪造检测', date: '今天', done: false, priority: true },
  { id: 't2', title: '准备本周组会汇报', project: '实验室周会', date: '今天', done: false },
  { id: 't3', title: '补充跨数据集对比实验', project: '多模态伪造检测', date: '明天', done: false },
  { id: 't4', title: '阅读并分享视觉语言模型相关论文', project: '轻量化视觉语言模型', date: '10 月 02 日', done: false },
  { id: 't5', title: '更新项目阶段记录', project: '多模态伪造检测', date: '已完成', done: true },
]
export type Seat = { id: string; name?: string; status: 'occupied' | 'empty' | 'leave' | 'maintenance' | 'temporary'; direction?: string; directions?: string[]; memberId?: string; className?: string; grade?: number; studentId?: string; contact?: string }
const names = ['赵文彪', '林予宁', '许知远', '周亦辰', '', '苏言', '王清和', '赵一禾', '何书宁', '', '沈念', '唐可', '陆知行', '孟一然', '', '顾望', '程亦', '叶舒', '江序', '', '宋予', '温以', '', '']
export const initialSeats: Seat[] = workstations.map((position, i) => {
  const name = names[i] || undefined
  return { id: position.id, name, status: i === 22 ? 'maintenance' : i === 23 ? 'temporary' : i === 5 || i === 13 ? 'leave' : name ? 'occupied' : 'empty', direction: name ? seatMembers.find(member => member.name === name)?.directions.join('、') : undefined }
})
export type Leave = { id: string; name: string; type: string; from: string; to: string; reason: string; status: '待审批' | '已通过' | '已驳回' | '已撤回'; approver: string }
export const initialLeaves: Leave[] = [
  { id: 'l1', name: '赵文彪', type: '事假', from: '2026-10-01', to: '2026-10-04', reason: '国庆期间回家探亲。', status: '待审批', approver: '李老师' },
  { id: 'l2', name: '赵文彪', type: '学术活动', from: '2026-09-18', to: '2026-09-21', reason: '参加校外学术研讨会。', status: '已通过', approver: '李老师' },
]
export const meetings = [
  { id: 'm1', date: '29', month: '9 月', title: '实验室每周例会', time: '今天 14:30 – 16:00', place: '研讨室 302', tag: '即将开始', people: 12, agenda: ['多模态伪造检测：跨域实验结果', '轻量化模型：论文初稿讨论', '下阶段任务与实验资源安排'] },
  { id: 'm2', date: '26', month: '9 月', title: '多模态学习论文研讨', time: '09 月 26 日 15:00 – 16:30', place: '研讨室 302', tag: '已结束', people: 8, agenda: ['论文方法与关键假设', '实验设置与对照分析', '下一次阅读计划'] },
  { id: 'm3', date: '22', month: '9 月', title: '新学期项目进度交流', time: '09 月 22 日 14:30 – 16:00', place: '研讨室 302', tag: '已结束', people: 16, agenda: ['各项目阶段进度', '新成员加入与任务分配', '学期目标讨论'] },
]
export type ServerResource = {
  id: string; kind: 'gpu' | 'cpu'; name: string; config: string; memoryGb: number | null;
  cpu: number | null; ram: number | null; disk: number | null; gpu: number[];
  status: '运行中' | '空闲' | '待接入'; tone: string;
}
export const servers: ServerResource[] = [
  { id: 's1', kind: 'gpu', name: 'GPU 服务器 · H200', config: '8 × NVIDIA H200 · 1 TB 内存', memoryGb: 1024, cpu: 31, ram: 42, disk: 61, gpu: [98, 96, 87, 92, 0, 0, 46, 0], status: '运行中', tone: 'teal' },
  { id: 's2', kind: 'gpu', name: 'GPU 服务器 · L40S', config: '4 × NVIDIA L40S · 512 GB 内存', memoryGb: 512, cpu: 18, ram: 26, disk: 38, gpu: [75, 68, 0, 0], status: '运行中', tone: 'blue' },
  { id: 's3', kind: 'gpu', name: 'GPU 服务器 · RTX 4090', config: '4 × NVIDIA RTX 4090 · 256 GB 内存', memoryGb: 256, cpu: 8, ram: 14, disk: 47, gpu: [0, 0, 0, 0], status: '空闲', tone: 'gray' },
  { id: 's4', kind: 'cpu', name: 'CPU 部署服务器', config: 'CPU 部署节点 · 配置待录入', memoryGb: null, cpu: null, ram: null, disk: null, gpu: [], status: '待接入', tone: 'gray' },
]
