import { useState, type RefObject } from 'react'
import { SeatBubble } from './SeatBubble'
import { X } from 'lucide-react'
import { ComboBox } from '../../components/common/ComboBox'
import type { Seat } from '../../demo'
import type { DeskPosition } from './layout'
import { directionPalette, memberColors, memberForSeat, seatMembers } from './members'

type Props = { desk: DeskPosition; seat?: Seat; seats: Seat[]; svg: RefObject<SVGSVGElement>; onClose: () => void; onAssign: (memberId: string) => void; onRelease: () => void }
export function SeatPopover({ desk, seat, seats, svg, onClose, onAssign, onRelease }: Props) {
  const [chosen, setChosen] = useState('')
  const member = memberForSeat(seat), { ink } = memberColors(member)
  const available = seatMembers.filter(m => !seats.some(s => s.memberId === m.id || s.name === m.name))
  return <SeatBubble seatId={desk.id} svg={svg} onClose={onClose}>
    <header><span className="bubble-seat-code" style={{ color: ink }}>{desk.id}</span><span className={'bubble-status ' + (member ? 'assigned' : '')}>{desk.kind !== 'seat' ? '公共桌位' : member ? '已分配' : '未分配'}</span><button aria-label="关闭工位信息" onClick={onClose}><X size={16} /></button></header>
    {desk.kind !== 'seat' ? <div className="bubble-common"><h3>{desk.kind === 'printer' ? '公共打印机' : '娱乐区'}</h3><p>{desk.kind === 'printer' ? '打印机专用位置' : 'D/E 桌组右侧的公共娱乐桌'}，不设座椅，不参与成员分配。</p></div> : member ? <>
      <div className="bubble-member"><span className="bubble-avatar" style={{ color: ink }}>{member.name.slice(0,1)}</span><h3 style={{ color: ink }}>{member.name}</h3></div>
      <dl><div><dt>班级</dt><dd>{member.className || '未填写'}</dd></div><div><dt>学号</dt><dd>{member.studentId || '未填写'}</dd></div><div><dt>联系方式</dt><dd>{member.contact || '未填写'}</dd></div></dl>
      <div className="bubble-directions"><span>研究方向</span><div>{member.directions.length ? member.directions.map(direction => { const c = directionPalette[direction]; return <span key={direction} style={{ color: c?.ink, background: c?.fill }}>{direction}</span> }) : <span>未填写</span>}</div></div>
      <button className="bubble-release" onClick={onRelease}>解除分配</button>
    </> : <div className="bubble-unassigned"><h3>这个位置尚未分配</h3><label>选择成员<ComboBox value={chosen} placeholder={available.length ? '请选择成员' : '暂无可分配成员'} options={available.map(m => ({ value: m.id, label: m.name + ' · ' + m.className }))} onValueChange={setChosen} disabled={!available.length || seat?.status === 'maintenance'} /></label><button className="bubble-assign" disabled={!chosen || seat?.status === 'maintenance'} onClick={() => onAssign(chosen)}>分配工位</button>{seat?.status === 'maintenance' && <p>此工位维护中，暂不可分配。</p>}</div>}
  </SeatBubble>
}
