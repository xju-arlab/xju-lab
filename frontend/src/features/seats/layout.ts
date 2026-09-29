import confirmed from './layout.confirmed.json'

export type Facing = 'up' | 'down' | 'left' | 'right'
export type DeskPosition = { id: string; x: number; y: number; facing: Facing; zone: string; kind: 'seat' | 'printer' | 'recreation'; width: number; depth: number }
export type Room = {
  left: number; top: number; right: number; bottom: number; notchWidth: number; notchHeight: number
  doorOffset: number; doorWidth: number; windowOffset: number; windowLength: number
  doorWall: 'notch' | 'left' | 'top'; doorSide: 'left' | 'right'; doorUpperClosed: boolean
  toolX: number; toolY: number; toolWidth: number; toolHeight: number
}
export type LayoutState = { desks: DeskPosition[]; room: Room }
export type StructureKey = 'notch' | 'notch-x' | 'notch-y' | 'door' | 'door-size' | 'window' | 'window-start' | 'window-end' | 'right' | 'tools'
export type LayoutTarget = { kind: 'desk'; ids: string[] } | { kind: 'structure'; key: StructureKey }

export const PLAN_WIDTH = 1400
export const PLAN_HEIGHT = 1060
export const GRID_STEP = 10
export const LAYOUT_STORAGE_KEY = 'xju-lab.seat-layout.v1'
export const LAYOUT_NOTE = '按现场最终标定整理 · 非测量图'
export const defaultLayout: LayoutState = { desks: confirmed.desks as DeskPosition[], room: confirmed.room as Room }
export const deskPositions = defaultLayout.desks
export const workstations = deskPositions.filter(desk => desk.kind === 'seat')
export const facingAngles: Record<Facing, number> = { up: 0, right: 90, down: 180, left: 270 }
export const facingLabels: Record<Facing, string> = { up: '图上方', down: '图下方', left: '门侧', right: '窗侧' }
export const structureNames: Record<StructureKey, string> = { notch: '凸入墙角', 'notch-x': '凸入墙竖边', 'notch-y': '凸入墙横边', door: '门的位置', 'door-size': '门的宽度', window: '窗的位置', 'window-start': '窗上端', 'window-end': '窗下端', right: '右侧墙线', tools: '工具区' }
export const horizontalRows = [
  { prefix: 'A', label: '排 1', count: 5, note: '4 席 + 打印机' },
  { prefix: 'B', label: '排 2', count: 3, note: '与排 3 面对面' },
  { prefix: 'C', label: '排 3', count: 3, note: '与排 2 面对面' },
  { prefix: 'D', label: '排 4', count: 4, note: '与排 5 面对面' },
  { prefix: 'E', label: '排 5', count: 4, note: '与排 4 面对面' },
  { prefix: 'F', label: '排 6', count: 6, note: '靠墙长排' },
]
export const seatLabels = { occupied: '已分配', empty: '空闲', leave: '请假中', maintenance: '维护中', temporary: '临时工位' } as const
export const seatColors = {
  occupied: { fill: '#e1eee8', line: '#96b6a4', ink: '#386755' }, empty: { fill: '#fbfaf7', line: '#c8c4b9', ink: '#68665e' },
  leave: { fill: '#fbefda', line: '#d3b17d', ink: '#986927' }, maintenance: { fill: '#f4e3e0', line: '#c99990', ink: '#985d53' }, temporary: { fill: '#e7edf5', line: '#a7b9d1', ink: '#617997' },
}
export const snap = (value: number) => Math.round(value / GRID_STEP) * GRID_STEP
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length
export const cloneLayout = (value: LayoutState): LayoutState => structuredClone(value)
export function deskBounds(d: DeskPosition) {
  const vertical = d.facing === 'left' || d.facing === 'right'
  const width = vertical ? d.depth : d.width, height = vertical ? d.width : d.depth
  return { left: d.x - width / 2, right: d.x + width / 2, top: d.y - height / 2, bottom: d.y + height / 2, width, height }
}
export function constrainRoom(input: Room): Room {
  const r = { ...input }
  r.left = clamp(r.left, 30, 300); r.top = clamp(r.top, 70, 200)
  r.right = clamp(r.right, r.left + 700, 1330); r.bottom = clamp(r.bottom, r.top + 650, 990)
  r.notchWidth = clamp(r.notchWidth, 50, 350); r.notchHeight = clamp(r.notchHeight, 100, 350)
  const span = r.doorWall === 'notch' ? r.notchHeight : r.doorWall === 'left' ? r.bottom - r.top - r.notchHeight : r.right - r.left - r.notchWidth
  r.doorWidth = clamp(r.doorWidth, 50, Math.min(240, span - 12))
  r.doorOffset = clamp(r.doorOffset, 6, span - r.doorWidth - 6)
  r.windowLength = clamp(r.windowLength, 100, r.bottom - r.top - 40)
  r.windowOffset = clamp(r.windowOffset, 20, r.bottom - r.top - r.windowLength - 20)
  r.toolWidth = clamp(r.toolWidth, 60, 400); r.toolHeight = clamp(r.toolHeight, 40, 300)
  r.toolX = clamp(r.toolX, 0, PLAN_WIDTH - r.toolWidth); r.toolY = clamp(r.toolY, 0, PLAN_HEIGHT - r.toolHeight)
  return r
}
export function moveLayout(before: LayoutState, target: LayoutTarget, dx: number, dy: number): LayoutState {
  // Snap the shared displacement so paired rows and unequal tabletop widths retain their spacing.
  dx = snap(dx); dy = snap(dy)
  const next = cloneLayout(before)
  if (target.kind === 'desk') {
    const selected = next.desks.filter(d => target.ids.includes(d.id))
    if (!selected.length) return next
    const limits = selected.map(deskBounds)
    dx = clamp(dx, Math.ceil(-Math.min(...limits.map(b => b.left)) / GRID_STEP) * GRID_STEP, Math.floor((PLAN_WIDTH - Math.max(...limits.map(b => b.right))) / GRID_STEP) * GRID_STEP)
    dy = clamp(dy, Math.ceil(-Math.min(...limits.map(b => b.top)) / GRID_STEP) * GRID_STEP, Math.floor((PLAN_HEIGHT - Math.max(...limits.map(b => b.bottom))) / GRID_STEP) * GRID_STEP)
    selected.forEach(d => { d.x += dx; d.y += dy })
  } else {
    const r = next.room, key = target.key
    if (key === 'notch' || key === 'notch-x') r.notchWidth += dx
    if (key === 'notch' || key === 'notch-y') r.notchHeight += dy
    if (key === 'door') r.doorOffset += r.doorWall === 'top' ? dx : dy
    if (key === 'door-size') r.doorWidth += r.doorWall === 'top' ? dx : dy
    if (key === 'right') r.right += dx
    if (key === 'tools') { r.toolX += dx; r.toolY += dy }
    if (key === 'window') r.windowOffset += dy
    if (key === 'window-end') r.windowLength += dy
    if (key === 'window-start') { const delta = clamp(dy, 20 - r.windowOffset, r.windowLength - 100); r.windowOffset += delta; r.windowLength -= delta }
    next.room = constrainRoom(r)
  }
  return next
}
export function normalizeLayout(input: LayoutState): LayoutState {
  const result = cloneLayout(input), desks = result.desks
  for (const prefixes of [['A'], ['B', 'C'], ['D', 'E'], ['F']]) {
    const rows = prefixes.map(p => desks.filter(d => d.id.startsWith(p)).sort((a, b) => a.id.localeCompare(b.id)))
    const count = rows[0].length, all = rows.flat()
    const centers = Array.from({ length: count }, (_, i) => mean(rows.map(row => row[i].x)))
    const pitch = Math.max(snap((centers[count - 1] - centers[0]) / (count - 1)), Math.ceil((Math.max(...all.map(d => deskBounds(d).width)) + 6) / GRID_STEP) * GRID_STEP)
    const start = snap(mean(centers) - pitch * (count - 1) / 2)
    for (const row of rows) { const y = snap(mean(row.map(d => d.y))); row.forEach((d, i) => { d.x = start + pitch * i; d.y = y }) }
  }
  for (const prefix of ['G', 'H']) {
    const row = desks.filter(d => d.id.startsWith(prefix)).sort((a, b) => a.id.localeCompare(b.id))
    const pitch = Math.max(snap((row[row.length - 1].y - row[0].y) / (row.length - 1)), Math.ceil((Math.max(...row.map(d => deskBounds(d).height)) + 6) / GRID_STEP) * GRID_STEP)
    const x = snap(mean(row.map(d => d.x))), start = snap(mean(row.map(d => d.y)) - pitch * (row.length - 1) / 2)
    row.forEach((d, i) => { d.x = x; d.y = start + pitch * i })
  }
  const de = desks.filter(d => /^[DE]/.test(d.id)), top = Math.min(...de.map(d => deskBounds(d).top)), bottom = Math.max(...de.map(d => deskBounds(d).bottom))
  const recreation = desks.find(d => d.id === 'I01')!
  Object.assign(recreation, { x: snap(Math.max(...de.map(d => deskBounds(d).right)) + recreation.depth / 2 + 10), y: (top + bottom) / 2, width: clamp(bottom - top, 40, 300), facing: 'left' })
  const r = result.room
  for (const key of ['left', 'top', 'right', 'bottom', 'notchWidth', 'notchHeight', 'doorOffset', 'doorWidth', 'toolX', 'toolWidth'] as const) r[key] = snap(r[key])
  const g = desks.filter(d => d.id.startsWith('G'))
  r.windowOffset = Math.floor((Math.min(...g.map(d => deskBounds(d).top)) - r.top) / GRID_STEP) * GRID_STEP
  r.windowLength = Math.ceil((Math.max(...g.map(d => deskBounds(d).bottom)) - r.top) / GRID_STEP) * GRID_STEP - r.windowOffset
  const a = deskBounds(desks.find(d => d.id === 'A01')!)
  r.toolY = a.top; r.toolHeight = a.height
  result.room = constrainRoom(r)
  return result
}
export function makeLayoutDocument(layout: LayoutState) {
  return { version: 4, updatedAt: new Date().toISOString(), canvas: { width: PLAN_WIDTH, height: PLAN_HEIGHT }, orientation: { door: 'upper-left', window: 'right' }, ...cloneLayout(layout), notes: LAYOUT_NOTE }
}
export function validateLayoutDocument(input: unknown): LayoutState {
  if (!input || typeof input !== 'object') throw new Error('布局文件无效')
  const data = input as Record<string, any>
  if (data.version !== 4 || data.canvas?.width !== PLAN_WIDTH || data.canvas?.height !== PLAN_HEIGHT || !Array.isArray(data.desks) || data.desks.length !== deskPositions.length) throw new Error('需要包含 33 个桌位的布局文件')
  const seen = new Set<string>()
  const desks = data.desks.map((d: Record<string, any>): DeskPosition => {
    const original = deskPositions.find(item => item.id === d?.id)
    if (!original || seen.has(d.id) || !Object.hasOwn(facingAngles, d.facing)) throw new Error('工位编号或方向无效')
    seen.add(d.id)
    for (const key of ['x', 'y', 'width', 'depth']) if (typeof d[key] !== 'number' || !Number.isFinite(d[key])) throw new Error('工位坐标或尺寸无效')
    if (d.x < 0 || d.x > PLAN_WIDTH || d.y < 0 || d.y > PLAN_HEIGHT || d.width < 40 || d.width > 300 || d.depth < 30 || d.depth > 200) throw new Error('工位超出可调整范围')
    return { ...original, x: d.x, y: d.y, facing: d.facing, width: d.width, depth: d.depth }
  })
  if (!data.room || typeof data.room !== 'object') throw new Error('缺少墙窗数据')
  const raw = data.room, r = {} as Room
  for (const key of Object.keys(defaultLayout.room) as (keyof Room)[]) {
    if (key === 'doorWall') { if (!['notch', 'left', 'top'].includes(raw[key])) throw new Error('门的位置无效'); r[key] = raw[key] }
    else if (key === 'doorSide') { if (!['left', 'right'].includes(raw[key])) throw new Error('门的方向无效'); r[key] = raw[key] }
    else if (key === 'doorUpperClosed') { if (typeof raw[key] !== 'boolean') throw new Error('门扇状态无效'); r[key] = raw[key] }
    else { if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) throw new Error('墙窗坐标或尺寸无效'); r[key] = raw[key] }
  }
  const bounded = constrainRoom(r)
  if (Object.keys(r).some(key => r[key as keyof Room] !== bounded[key as keyof Room])) throw new Error('墙窗尺寸超出范围')
  return { desks, room: r }
}
