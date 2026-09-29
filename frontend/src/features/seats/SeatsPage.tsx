import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowDownToLine, MapPin, Maximize, Minus, MousePointer2, Plus, Search, X } from 'lucide-react'
import type { Seat } from '../../demo'
import { FloorPlan } from './FloorPlan'
import { workstations } from './layout'
import { useLayoutEditor } from './useLayoutEditor'
import { LayoutInspector, LayoutToolbar } from './LayoutEditor'
import { SeatPopover } from './SeatPopover'
import { ASSIGNMENT_STORAGE_KEY, assignMember, directionPalette, gradeColors, memberForSeat, releaseMember, seatMembers } from './members'
import { exportFloorPlan } from './export'
import './seats.css'

type Props = { seats: Seat[]; setSeats: Dispatch<SetStateAction<Seat[]>>; toast: (message: string) => void; location: string }
export function SeatsPage({ seats, setSeats, toast, location }: Props) {
  const editor = useLayoutEditor(toast)
  const [selectedId, setSelectedId] = useState<string>(), [query, setQuery] = useState(''), [zoom, setZoom] = useState(1), [exporting, setExporting] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null), mapScroller = useRef<HTMLDivElement>(null)
  const desks = editor.layout.desks
  const filtered = desks.filter(d => {
    const member = memberForSeat(seats.find(s => s.id === d.id))
    return [d.id,d.zone,d.kind === 'printer' ? '打印机' : d.kind === 'recreation' ? '娱乐区' : '',member?.name,member?.className,member?.studentId,...(member?.directions ?? [])].join(' ').toLowerCase().includes(query.trim().toLowerCase())
  })
  const selectedDesk = desks.find(d => d.id === selectedId), selectedSeat = seats.find(s => s.id === selectedId)
  const assignedCount = seats.filter(s => !!s.name).length
  function closePopover() {
    const id = selectedId; setSelectedId(undefined)
    if (id) requestAnimationFrame(() => svgRef.current?.querySelector<SVGElement>(`[data-seat-id="${id}"]`)?.focus({ preventScroll: true }))
  }
  function persistAssignments(next: Seat[], message: string) {
    try { localStorage.setItem(ASSIGNMENT_STORAGE_KEY, JSON.stringify(next)); setSeats(next); toast(message + '，已保存在当前浏览器') }
    catch { toast('保存失败，本次分配未生效，请重试') }
  }
  function assign(memberId: string) {
    const member = seatMembers.find(m => m.id === memberId)
    if (!member || !selectedDesk || selectedDesk.kind !== 'seat') return
    try { persistAssignments(assignMember(seats, selectedDesk.id, member), `已将 ${selectedDesk.id} 分配给${member.name}`) }
    catch (error) { toast(error instanceof Error ? error.message : '分配失败') }
  }
  async function exportImage(format: 'svg' | 'png') {
    if (!svgRef.current || exporting) return
    setExporting(true)
    try { await exportFloorPlan(svgRef.current, format); toast(format.toUpperCase() + ' 平面图已生成') }
    catch { toast('图片导出失败，请重试') }
    finally { setExporting(false) }
  }
  return <div className={'workspace-seats single-layout-page' + (editor.editing ? ' is-adjusting' : '')}>
    <div className="seats-heading-line"><h1>工位一览<span className="seats-title-dot">.</span></h1><span className="plan-version"><span />{location}</span><button className="layout-edit-toggle" role="switch" aria-label="工位标定" aria-checked={editor.editing} onClick={() => { if (editor.editing) editor.save(); else { setSelectedId(undefined); setQuery(''); editor.start() } }}><span className="layout-toggle-track"><i /></span>工位标定</button></div>
    <div className="seat-overview-line"><span><b>{workstations.length}</b> 工位</span><span><i className="assigned-dot" /><b>{assignedCount}</b> 已分配</span><span><b>{workstations.length - assignedCount}</b> 未分配</span></div>
    {editor.editing && <LayoutToolbar editor={editor} toast={toast} />}
    <div className="seat-map-tools">
      <div className="space-search"><Search size={15} /><input aria-label="搜索工位或成员" disabled={editor.editing} placeholder="搜索工位、成员、班级…" value={query} onChange={event => { setQuery(event.target.value); setSelectedId(undefined) }} />{query && <button aria-label="清空搜索" onClick={() => setQuery('')}><X size={13} /></button>}</div>
      <div className="seat-grade-key" aria-label="年级颜色">{Object.entries(gradeColors).map(([year, color]) => <span key={year} style={{ color }}>{year.slice(2)} 级</span>)}</div>
      <button className="seat-export-button" disabled={exporting} onClick={() => void exportImage('svg')}><ArrowDownToLine size={14} />SVG</button><button className="seat-export-button" disabled={exporting} onClick={() => void exportImage('png')}><ArrowDownToLine size={14} />PNG</button>
    </div>
    <div className={'space-layout' + (editor.editing ? '' : ' single-plan')}>
      <section className="space-map-panel" aria-label="工位平面图区域">
        <header className="space-panel-heading"><div><span className="plan-room-mark"><MapPin size={16} /></span><h2>实验室工作区</h2></div>{editor.editing && <span className="drawing-scale">调整中 · 网格自动吸附</span>}</header>
        {query.trim() && <div className="space-search-result" role="status">{filtered.length ? `找到 ${filtered.length} 个桌位` : '没有找到匹配的工位或成员'}<button onClick={() => setQuery('')}>清除搜索</button></div>}
        <div className="plan-viewport" ref={mapScroller} tabIndex={0} aria-label="平面图画布，放大后可滚动查看">
          <div className="plan-canvas" style={{ width: `max(${zoom * 100}%, ${zoom * 660}px)` }}><FloorPlan ref={svgRef} seats={seats} selectedId={selectedId} matches={query.trim() ? new Set(filtered.map(d => d.id)) : undefined} showAssignments onSelect={id => setSelectedId(id)} layout={editor.layout} editor={editor} /></div>
        </div>
        <footer className="space-map-footer"><span><MousePointer2 size={14} />{editor.editing ? '拖动自动吸附 · 方向键微调' : '点击桌位查看成员信息'}</span><div className="map-zoom-controls"><button aria-label="缩小平面图" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - .25))}><Minus size={15} /></button><output aria-live="polite">{Math.round(zoom * 100)}%</output><button aria-label="放大平面图" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .25))}><Plus size={15} /></button><button aria-label="适应画布" onClick={() => { setZoom(1); mapScroller.current?.scrollTo({ left: 0, top: 0 }) }}><Maximize size={15} /></button></div></footer>
      </section>
      {editor.editing && <aside className="space-inspector" aria-label="工位标定属性"><LayoutInspector editor={editor} toast={toast} /></aside>}
    </div>
    <div className="seat-direction-key"><span>桌面 / 研究方向</span>{Object.entries(directionPalette).map(([direction, color]) => <span key={direction}><i style={{ background: color.fill, borderColor: color.line }} />{direction}</span>)}<span><i className="dual-direction-swatch" />双方向渐变</span></div>
    <div className="seat-data-note"><span>当前成员为示例资料，学号与联系方式待录入。</span></div>
    {!editor.editing && selectedDesk && <SeatPopover key={selectedDesk.id} desk={selectedDesk} seat={selectedSeat} seats={seats} svg={svgRef} onClose={closePopover} onAssign={assign} onRelease={() => persistAssignments(releaseMember(seats, selectedDesk.id), '已解除工位分配')} />}
  </div>
}
