import type { Seat } from '../../demo'

export type SeatMember = { id: string; name: string; className: string; grade?: number; studentId: string; contact: string; directions: string[] }
// Prototype roster only. Student numbers and contact details remain empty until supplied.
const names = ['赵文彪','林予宁','许知远','周亦辰','苏言','王清和','赵一禾','何书宁','沈念','唐可','陆知行','孟一然','顾望','程亦','叶舒','江序','宋予','温以','何新雨','陈知遥']
export const seatMembers: SeatMember[] = names.map((name, index) => {
  const grade = [2024, 2025, 2026][index % 3]
  const directions = index % 5 === 0 ? ['算法','深度学习'] : [index % 2 === 0 ? '算法' : '深度学习']
  return { id: 'member-' + (index + 1), name, className: index === 0 ? '计算机24-3' : `计算机${String(grade).slice(2)}-${index % 3 + 1}`, grade, studentId: '', contact: '', directions }
})
export const directionPalette: Record<string, { fill: string; line: string; ink: string }> = {
  '算法': { fill: '#dfeafb', line: '#92afd4', ink: '#386caa' },
  '深度学习': { fill: '#eee1f6', line: '#bea0d1', ink: '#8754a3' },
}
export const gradeColors: Record<number, string> = { 2024: '#2f7756', 2025: '#ad641f', 2026: '#ae4267' }
export function memberForSeat(seat?: Seat, demoRoster = true): SeatMember | undefined {
  if (!seat?.name) return
  if (!demoRoster) return { id: seat.memberId ?? seat.id, name: seat.name, className: seat.className ?? '', grade: seat.grade, studentId: seat.studentId ?? '', contact: seat.contact ?? '', directions: seat.directions ?? [] }
  const member = seatMembers.find(m => m.id === seat.memberId || m.name === seat.name)
  const explicitDirections = seat.directions?.filter(direction => typeof direction === 'string' && direction.trim()).map(direction => direction.trim())
  const savedDirections = explicitDirections?.length ? explicitDirections : seat.direction?.split(/[、,，/]+/).map(d => d.trim()).filter(Boolean) ?? []
  // Earlier prototype categories/grades fall back to the corrected roster without losing assignments.
  const directions = explicitDirections?.length ? [...new Set(savedDirections)] : savedDirections.length && savedDirections.every(d => d in directionPalette) ? [...new Set(savedDirections)] : member?.directions ?? []
  const grade = seat.grade && seat.grade in gradeColors ? seat.grade : member?.grade
  const className = seat.grade && !(seat.grade in gradeColors) ? member?.className ?? '' : seat.className ?? member?.className ?? ''
  return { id: seat.memberId ?? member?.id ?? seat.id, name: seat.name, className, grade, studentId: seat.studentId ?? member?.studentId ?? '', contact: seat.contact ?? member?.contact ?? '', directions }
}
export function memberColors(member?: SeatMember) {
  const colors = (member?.directions ?? []).map(direction => directionPalette[direction] ?? { fill: '#e7ebe0', line: '#a8b69a', ink: '#687c54' })
  return { colors, ink: member?.grade ? gradeColors[member.grade] ?? '#58664f' : '#58664f' }
}
export const ASSIGNMENT_STORAGE_KEY = 'xju-lab.seat-assignments.v1'
export function assignMember(seats: Seat[], id: string, member: SeatMember): Seat[] {
  const target = seats.find(s => s.id === id)
  if (!target || target.name || target.status === 'maintenance') throw new Error('此工位当前不可分配')
  if (seats.some(s => s.name === member.name || s.memberId === member.id)) throw new Error('该成员已有工位')
  return seats.map(s => s.id === id ? { ...s, memberId: member.id, name: member.name, className: member.className, grade: member.grade, studentId: member.studentId, contact: member.contact, direction: member.directions.join('、'), status: 'occupied' } : s)
}
export function releaseMember(seats: Seat[], id: string): Seat[] {
  return seats.map(s => s.id === id ? { id: s.id, status: 'empty' } : s)
}
export function readAssignments(fallback: Seat[]): Seat[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ASSIGNMENT_STORAGE_KEY) ?? 'null')
    if (!Array.isArray(raw) || raw.length !== fallback.length) return fallback
    const ids = new Set<string>(), names = new Set<string>()
    const result: Seat[] = raw.map(s => {
      if (!s || !fallback.some(d => d.id === s.id) || ids.has(s.id) || !['occupied','empty','leave','maintenance','temporary'].includes(s.status)) throw new Error('Invalid seat')
      ids.add(s.id)
      const clean: Seat = { id: s.id, status: s.status }
      for (const key of ['name','memberId','className','studentId','contact','direction'] as const) if (s[key] !== undefined) { if (typeof s[key] !== 'string' || s[key].length > 200) throw new Error('Invalid member'); clean[key] = s[key] }
      if (s.grade !== undefined) { if (!Number.isInteger(s.grade) || s.grade < 2000 || s.grade > 2100) throw new Error('Invalid grade'); clean.grade = s.grade }
      if (clean.name) { if (names.has(clean.name)) throw new Error('Duplicate member'); names.add(clean.name) }
      const member = memberForSeat(clean)
      return member ? { ...clean, memberId: member.id, className: member.className, grade: member.grade, direction: member.directions.join('、') } : clean
    })
    return result
  } catch { return fallback }
}
