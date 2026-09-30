import { forwardRef, useId, useImperativeHandle, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { Seat } from '../../demo'
import { defaultLayout, deskBounds, facingAngles, GRID_STEP, LAYOUT_NOTE, moveLayout, PLAN_HEIGHT, PLAN_WIDTH, seatColors, type DeskPosition, type LayoutState, type LayoutTarget, type StructureKey } from './layout'
import { RoomDrawing, RoomHandles } from './RoomDrawing'
import type { LayoutEditor } from './useLayoutEditor'
import { memberColors, memberForSeat } from './members'

type FloorPlanProps = { demoRoster?: boolean; seats: Seat[]; selectedId?: string; matches?: Set<string>; showAssignments: boolean; onSelect: (id: string) => void; layout?: LayoutState; editor?: LayoutEditor }
function Desk({ position: d, seat, selected, faded, showAssignments, editing, onSelect, demoRoster }: { position: DeskPosition; seat?: Seat; demoRoster: boolean; selected: boolean; faded: boolean; showAssignments: boolean; editing: boolean; onSelect: (id: string) => void }) {
  const { id, x, y, facing, width, depth } = d
  const printer = d.kind === 'printer', recreation = d.kind === 'recreation', bounds = deskBounds(d)
  const member = showAssignments ? memberForSeat(seat, demoRoster) : undefined
  const appearance = memberColors(member)
  const gradientId = 'desk-direction-' + useId().replace(/:/g, '')
  const color = printer ? { fill: '#ece7d8', line: '#b4a27c', ink: '#8a7047' } : recreation ? { fill: '#dfecec', line: '#8bafac', ink: '#548e8b' } : showAssignments && seat ? seatColors[seat.status] : { fill: '#eeeee6', line: '#aeb9a2', ink: '#526348' }
  const label = printer ? '打印机' : recreation ? '娱乐区' : showAssignments && seat ? seat.name ?? (seat.status === 'maintenance' ? '维护中' : '未分配') : ''
  const fill = member && appearance.colors.length ? appearance.colors.length > 1 ? `url(#${gradientId})` : appearance.colors[0].fill : color.fill
  const line = member && appearance.colors.length ? appearance.colors[0].line : color.line
  const ink = member ? appearance.ink : color.ink
  return <g className={'plan-desk' + (selected ? ' is-selected' : '')} data-seat-id={id} data-export-stroke={line} transform={`translate(${x} ${y})`} opacity={faded ? .22 : 1} role="button" tabIndex={faded ? -1 : 0} aria-label={`${id}，${d.zone}${label ? '，' + label : ''}${member ? `，${member.grade ?? ''}级，${member.directions.join('、')}` : ''}${editing ? '，可拖动调整' : '，查看详情'}`} aria-pressed={selected}
    onClick={() => { if (!editing) onSelect(id) }}
    onKeyDown={event => { if (!editing && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(id) } }}>
    <title>{`${id} · ${d.zone}${label ? ' · ' + label : ''}`}</title>
    {appearance.colors.length > 1 && <defs><linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">{appearance.colors.map((c, index) => <stop key={index} offset={`${index / (appearance.colors.length - 1) * 100}%`} stopColor={c.fill} />)}</linearGradient></defs>}
    <rect className="desk-focus" x={-bounds.width / 2 - 5} y={-bounds.height / 2 - 5} width={bounds.width + 10} height={bounds.height + 10} rx="6" fill="none" stroke="#2d7661" strokeWidth="2.5" opacity={selected ? 1 : 0} />
    <g transform={`rotate(${facingAngles[facing]})`}>
      {d.kind === 'seat' && <g className="desk-chair" aria-hidden="true">
        <rect x="-18" y={depth / 2 + 11} width="36" height="27" rx="8" fill="#dcb97e" stroke="#b49157" strokeWidth="1.2" />
        <path d={`M-16 ${depth / 2 + 35}Q0 ${depth / 2 + 41} 16 ${depth / 2 + 35}`} fill="none" stroke="#b49157" strokeWidth="5" strokeLinecap="round" />
        <path d={`M-22 ${depth / 2 + 16}v15M22 ${depth / 2 + 16}v15`} stroke="#a5ac9c" strokeWidth="2" />
      </g>}
      <rect x={-width / 2 + 2} y={-depth / 2 + 3} width={width} height={depth} rx="4" fill="#45533c" opacity=".07" />
      <rect className="desk-surface" x={-width / 2} y={-depth / 2} width={width} height={depth} rx="4" fill={fill} stroke={selected ? '#2d7661' : line} strokeWidth={selected ? 2 : 1.3} />
      <rect x={-width / 2 + 5} y={-depth / 2 + 4} width={width - 10} height="9" rx="1.5" fill="#cdd2c1" stroke="#b8c0aa" strokeWidth=".6" />
    </g>
    <text x="0" y={label ? -2 : 6} textAnchor="middle" fontFamily="Consolas, monospace" fontSize="16" fontWeight="700" fill={ink} pointerEvents="none">{id}</text>
    {label && <text x="0" y="18" textAnchor="middle" fontSize={bounds.width < 90 ? 10 : 12} fontWeight="700" fill={ink} pointerEvents="none">{label}</text>}
  </g>
}
export const FloorPlan = forwardRef<SVGSVGElement, FloorPlanProps>(function FloorPlan({ seats, selectedId, matches, showAssignments, onSelect, layout = defaultLayout, editor, demoRoster = true }, ref) {
  const svg = useRef<SVGSVGElement>(null)
  useImperativeHandle(ref, () => svg.current!, [])
  const patternId = 'floor-tiles-' + useId().replace(/:/g, '')
  const editing = !!editor?.editing
  const drag = useRef<{ pointerId: number; x: number; y: number; before: LayoutState; target: LayoutTarget }>()
  const selection = editing && editor?.target?.kind === 'desk' ? editor.target.ids : selectedId ? [selectedId] : []
  const selectedStructure = editing && editor?.target?.kind === 'structure' ? editor.target.key : undefined
  function point(event: PointerEvent<SVGSVGElement>) {
    const p = svg.current!.createSVGPoint(); p.x = event.clientX; p.y = event.clientY
    return p.matrixTransform(svg.current!.getScreenCTM()!.inverse())
  }
  function targetFor(element: Element): LayoutTarget | undefined {
    const structure = element.closest<SVGElement>('[data-structure]')?.dataset.structure as StructureKey | undefined
    if (structure) return { kind: 'structure', key: structure }
    const id = element.closest<SVGElement>('[data-seat-id]')?.dataset.seatId
    return id ? { kind: 'desk', ids: [id] } : undefined
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!editing || !editor || event.button !== 0 || !event.isPrimary) return
    let target = targetFor(event.target as Element)
    if (!target) { editor.setTarget(undefined); return }
    event.preventDefault()
    if (target.kind === 'desk') {
      const id = target.ids[0], existing = editor.target?.kind === 'desk' ? editor.target.ids : []
      if (event.shiftKey) { editor.setTarget({ kind: 'desk', ids: existing.includes(id) ? existing.filter(item => item !== id) : [...existing, id] }); return }
      if (existing.includes(id)) target = { kind: 'desk', ids: existing }
      onSelect(id)
    }
    editor.setTarget(target)
    const p = point(event)
    drag.current = { pointerId: event.pointerId, x: p.x, y: p.y, before: editor.current.current, target }
    event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true })
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current || !editor || drag.current.pointerId !== event.pointerId) return
    const p = point(event), d = drag.current
    editor.preview(moveLayout(d.before, d.target, p.x - d.x, p.y - d.y))
  }
  function finish(event: PointerEvent<SVGSVGElement>, cancel = false) {
    const d = drag.current
    if (!d || !editor || d.pointerId !== event.pointerId) return
    drag.current = undefined
    if (cancel) editor.preview(d.before); else editor.commit(editor.current.current, d.before)
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId)
  }
  function keyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!editing || !editor) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? editor.redo() : editor.undo(); return }
    if (event.key === 'Escape') {
      if (drag.current) { editor.preview(drag.current.before); const pointerId = drag.current.pointerId; drag.current = undefined; if (svg.current?.hasPointerCapture(pointerId)) svg.current.releasePointerCapture(pointerId) }
      editor.setTarget(undefined); return
    }
    const focused = targetFor(event.target as Element)
    const target = focused ?? editor.target
    if (!target) return
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); editor.setTarget(target); if (target.kind === 'desk') onSelect(target.ids[0]); return }
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (moves[event.key]) {
      event.preventDefault(); editor.setTarget(target)
      const [dx, dy] = moves[event.key], step = event.shiftKey ? GRID_STEP * 5 : GRID_STEP
      editor.commit(moveLayout(editor.current.current, target, dx * step, dy * step))
    } else if (event.key.toLowerCase() === 'r' && target.kind === 'desk' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      const directions: DeskPosition['facing'][] = ['up', 'right', 'down', 'left']
      editor.commit({ ...layout, desks: layout.desks.map(d => target.ids.includes(d.id) ? { ...d, facing: directions[(directions.indexOf(d.facing) + 1) % 4] } : d) })
    }
  }
  const bounds = layout.desks.map(deskBounds)
  const overviewLeft = Math.min(40, layout.room.left - 25, ...bounds.map(b => b.left - 40))
  const overviewTop = Math.min(35, layout.room.top - 45, ...bounds.map(b => b.top - 50))
  const overviewRight = Math.max(1200, layout.room.right + 110, ...bounds.map(b => b.right + 50))
  const overviewBottom = Math.max(1050, layout.room.bottom + 65, ...bounds.map(b => b.bottom + 50))
  const viewBox = editing ? `0 0 ${PLAN_WIDTH} ${PLAN_HEIGHT}` : `${overviewLeft} ${overviewTop} ${overviewRight - overviewLeft} ${overviewBottom - overviewTop}`
  return <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox={viewBox} width={PLAN_WIDTH} height={PLAN_HEIGHT} role="group" tabIndex={editing ? 0 : undefined} aria-label="实验室工位平面图" className={editing ? 'floor-plan is-editing' : 'floor-plan'} style={{ display: 'block', width: '100%', height: 'auto', fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif", touchAction: editing ? 'none' : 'auto' }}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)} onKeyDown={keyDown}>
    <title>实验室工位平面图 · 31 工位、打印机、娱乐区与工具区</title>
    <desc>{LAYOUT_NOTE}。门在左上角，窗在右侧。{editing ? '拖动自动网格吸附，Shift 点击多选，方向键移动，R 旋转。' : '点击桌位查看详情。'}</desc>
    <style>{'.plan-desk { cursor: pointer; outline: none; } .plan-desk text { user-select: none; } .plan-desk:hover .desk-surface { stroke: #2d7661; stroke-width: 2; } .plan-desk:focus-visible .desk-focus { opacity: 1; }'}</style>
    <rect data-plan-background="" width={PLAN_WIDTH} height={PLAN_HEIGHT} fill="#fafbf8" />
    <g data-plan-content="">
      <RoomDrawing room={layout.room} patternId={patternId} editing={editing} selected={selectedStructure} />
      {layout.desks.map(position => <Desk demoRoster={demoRoster} key={position.id} position={position} seat={seats.find(s => s.id === position.id)} selected={selection.includes(position.id)} faded={!editing && !!matches && !matches.has(position.id)} showAssignments={showAssignments && !editing} editing={editing} onSelect={onSelect} />)}
      {editing && <RoomHandles room={layout.room} selected={selectedStructure} />}
    </g>
  </svg>
})
