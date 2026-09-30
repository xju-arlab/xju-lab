import { useState, type RefObject } from 'react'
import { X } from 'lucide-react'
import { ComboBox, type ComboOption } from '../../components/common/ComboBox'
import { SeatBubble } from './SeatBubble'
import { directionPalette, gradeColors } from './members'

export type ApiSeat = { id: string; kind: string; layoutItem: Record<string, unknown>; memberId: string | null; displayName: string | null; direction: string | null; className: string | null; directions: string[]; cohort: number | null; onLeaveNow: boolean }

type Props = {
  seat: ApiSeat; svg: RefObject<SVGSVGElement>; canManage: boolean; members: ComboOption[]
  membersLoading: boolean; membersError: string; busy: boolean; error: string
  onClose: () => void; onAssign: (memberId: string) => void; onRelease: () => void
}

export function ApiSeatPopover({ seat, svg, canManage, members, membersLoading, membersError, busy, error, onClose, onAssign, onRelease }: Props) {
  const [chosen, setChosen] = useState('')
  const grade = seat.cohort == null ? undefined : seat.cohort < 100 ? 2000 + seat.cohort : seat.cohort
  const ink = grade == null ? '#58664f' : gradeColors[grade] ?? '#58664f'
  return <SeatBubble seatId={seat.id} svg={svg} onClose={onClose} className="api-seat-bubble">
    <header><span className="bubble-seat-code" style={{ color: ink }}>{seat.id}</span><span className={'bubble-status' + (seat.memberId ? ' assigned' : '')}>{seat.kind !== 'seat' ? '公共设施' : seat.memberId ? '已分配' : '未分配'}</span><button type="button" aria-label="关闭工位信息" onClick={onClose}><X size={16} /></button></header>
    <div className="api-seat-bubble-body">
      {seat.kind !== 'seat' ? <div className="bubble-common"><h3>{seat.kind === 'printer' ? '公共打印机' : '公共娱乐桌'}</h3><p>此位置为实验室设施，不参与成员分配。</p></div> : seat.memberId ? <>
        <div className="bubble-member"><span className="bubble-avatar" style={{ color: ink }} aria-hidden="true">{seat.displayName?.slice(0, 1) ?? '—'}</span><h3 style={{ color: ink }}>{seat.displayName ?? '姓名待填写'}</h3></div>
        <dl><div><dt>班级</dt><dd>{seat.className || '未填写'}</dd></div>{seat.onLeaveNow && <div><dt>请假情况</dt><dd><span className="bubble-leave-status">当前请假</span></dd></div>}</dl>
        <div className="bubble-directions"><span>研究方向</span><div>{seat.directions.length ? seat.directions.map(direction => { const color = directionPalette[direction]; return <span key={direction} style={{ color: color?.ink, background: color?.fill ?? '#eef0e9' }}>{direction}</span> }) : <span>未填写</span>}</div></div>
        {canManage && <button type="button" className="bubble-release" disabled={busy} onClick={onRelease}>{busy ? '正在保存…' : '解除分配'}</button>}
      </> : <div className="bubble-unassigned"><h3>这个位置尚未分配</h3>{canManage ? <form onSubmit={event => { event.preventDefault(); if (chosen && !busy) onAssign(chosen) }}><label>选择成员<ComboBox value={chosen} onValueChange={setChosen} options={members} placeholder={membersLoading ? '正在读取成员…' : members.length ? '请选择成员' : '暂无可分配成员'} disabled={busy || membersLoading || !!membersError || !members.length} /></label><button className="bubble-assign" type="submit" disabled={!chosen || busy || membersLoading || !!membersError}>{busy ? '正在保存…' : '分配工位'}</button>{membersError && <p role="alert">{membersError}</p>}</form> : <p>由实验室管理员分配工位。</p>}</div>}
      {error && <p className="api-error" role="alert">{error}</p>}
    </div>
  </SeatBubble>
}
