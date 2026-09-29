import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ComboBox } from '../../components/common/ComboBox'
import type { Seat } from '../../demo'
import type { DeskPosition } from './layout'
import { directionPalette, memberColors, memberForSeat, seatMembers } from './members'

type Props = { desk: DeskPosition; seat?: Seat; seats: Seat[]; svg: RefObject<SVGSVGElement>; onClose: () => void; onAssign: (memberId: string) => void; onRelease: () => void }
export function SeatPopover({ desk, seat, seats, svg, onClose, onAssign, onRelease }: Props) {
  const card = useRef<HTMLDivElement>(null), [chosen, setChosen] = useState('')
  const [position, setPosition] = useState({ left: 0, top: 0, side: 'left', pointer: 30, ready: false })
  const member = memberForSeat(seat), { ink } = memberColors(member)
  const available = seatMembers.filter(m => !seats.some(s => s.memberId === m.id || s.name === m.name))
  const closeRef = useRef(onClose); closeRef.current = onClose
  useLayoutEffect(() => {
    const anchor = svg.current?.querySelector<SVGGraphicsElement>(`[data-seat-id="${desk.id}"] .desk-surface`)
    if (!anchor || !card.current) return
    const fit = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
    function update() {
      if (!anchor || !card.current) return
      const a = anchor.getBoundingClientRect(), box = card.current.getBoundingClientRect(), w = box.width, h = box.height
      const cx = a.left + a.width / 2, cy = a.top + a.height / 2, gap = 13
      const viewportWidth = document.documentElement.clientWidth, viewportHeight = document.documentElement.clientHeight
      let left: number, top: number, side: string, pointer: number
      if (viewportWidth - a.right >= w + gap + 12) { left = a.right + gap; top = fit(cy - h / 2, 12, viewportHeight - h - 12); side = 'left'; pointer = fit(cy - top, 22, h - 22) }
      else if (a.left >= w + gap + 12) { left = a.left - w - gap; top = fit(cy - h / 2, 12, viewportHeight - h - 12); side = 'right'; pointer = fit(cy - top, 22, h - 22) }
      else {
        left = fit(cx - w / 2, 12, viewportWidth - w - 12)
        if (viewportHeight - a.bottom > h + gap || a.top < h + gap) { top = fit(a.bottom + gap, 12, viewportHeight - h - 12); side = 'top' }
        else { top = fit(a.top - h - gap, 12, viewportHeight - h - 12); side = 'bottom' }
        pointer = fit(cx - left, 22, w - 22)
      }
      setPosition({ left, top, side, pointer, ready: true })
    }
    update()
    const observer = new ResizeObserver(update); observer.observe(card.current); if (svg.current) observer.observe(svg.current)
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [desk.id, svg])
  useEffect(() => {
    card.current?.focus({ preventScroll: true })
    function outside(event: PointerEvent) {
      const target = event.target as Element
      if (card.current?.contains(target) || target.closest('.combobox-menu') || target.closest('[data-seat-id]')) return
      closeRef.current()
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('.combobox-menu')) { event.preventDefault(); closeRef.current() }
    }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [])
  return createPortal(<div ref={card} className={'seat-info-bubble pointer-' + position.side} role="dialog" aria-label={desk.id + ' 工位信息'} tabIndex={-1} style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden', '--pointer-offset': position.pointer + 'px' } as CSSProperties}>
    <header><span className="bubble-seat-code" style={{ color: ink }}>{desk.id}</span><span className={'bubble-status ' + (member ? 'assigned' : '')}>{desk.kind !== 'seat' ? '公共桌位' : member ? '已分配' : '未分配'}</span><button aria-label="关闭工位信息" onClick={onClose}><X size={16} /></button></header>
    {desk.kind !== 'seat' ? <div className="bubble-common"><h3>{desk.kind === 'printer' ? '公共打印机' : '娱乐区'}</h3><p>{desk.kind === 'printer' ? '打印机专用位置' : 'D/E 桌组右侧的公共娱乐桌'}，不设座椅，不参与成员分配。</p></div> : member ? <>
      <div className="bubble-member"><span className="bubble-avatar" style={{ color: ink }}>{member.name.slice(0,1)}</span><h3 style={{ color: ink }}>{member.name}</h3></div>
      <dl><div><dt>班级</dt><dd>{member.className || '未填写'}</dd></div><div><dt>学号</dt><dd>{member.studentId || '未填写'}</dd></div><div><dt>联系方式</dt><dd>{member.contact || '未填写'}</dd></div></dl>
      <div className="bubble-directions"><span>研究方向</span><div>{member.directions.length ? member.directions.map(direction => { const c = directionPalette[direction]; return <span key={direction} style={{ color: c?.ink, background: c?.fill }}>{direction}</span> }) : <span>未填写</span>}</div></div>
      <button className="bubble-release" onClick={onRelease}>解除分配</button>
    </> : <div className="bubble-unassigned"><h3>这个位置尚未分配</h3><label>选择成员<ComboBox value={chosen} placeholder={available.length ? '请选择成员' : '暂无可分配成员'} options={available.map(m => ({ value: m.id, label: m.name + ' · ' + m.className }))} onValueChange={setChosen} disabled={!available.length || seat?.status === 'maintenance'} /></label><button className="bubble-assign" disabled={!chosen || seat?.status === 'maintenance'} onClick={() => onAssign(chosen)}>分配工位</button>{seat?.status === 'maintenance' && <p>此工位维护中，暂不可分配。</p>}</div>}
  </div>, document.body)
}
