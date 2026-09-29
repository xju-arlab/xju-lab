import type { Contest, ContestResult, Exam, Grade, HistoryScope, Student } from './types.ts'

export const HISTORY_WEIGHT = 0.25
export const CURRENT_WEIGHT = 0.75
export const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
export const validScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
export const gradeValue = (grade?: Grade) => grade?.status === 'graded' && validScore(grade.score) ? grade.score : null
export const blend = (current: number | null, history: number | null) => current === null ? null : history === null ? current : CURRENT_WEIGHT * current + HISTORY_WEIGHT * history

// A single participant supplies no relative evidence; ties use the mean occupied rank.
export function rankPoints(midRank: number, count: number): number | null {
  if (!Number.isFinite(midRank) || !Number.isInteger(count) || count < 1 || midRank < 1 || midRank > count) return null
  return count === 1 ? 50 : 100 * (count - midRank) / (count - 1)
}

export type RankedContestResult = ContestResult & { rank: number; midRank: number; tied: boolean; count: number; points: number }
export function rankContest(contest: Contest, students: Student[], excludeVeterans: boolean): RankedContestResult[] {
  const eligible = new Set(students.filter(student => !excludeVeterans || !student.veteran).map(student => student.id))
  const sorted = contest.results.filter(result => eligible.has(result.studentId))
    .sort((a, b) => b.solved - a.solved || a.penalty - b.penalty || a.studentId.localeCompare(b.studentId))
  const rows: RankedContestResult[] = []
  for (let start = 0; start < sorted.length;) {
    let end = start + 1
    while (end < sorted.length && sorted[end].solved === sorted[start].solved && sorted[end].penalty === sorted[start].penalty) end++
    const midRank = (start + 1 + end) / 2
    for (let index = start; index < end; index++) rows.push({ ...sorted[index], rank: start + 1, midRank, tied: end - start > 1, count: sorted.length, points: rankPoints(midRank, sorted.length)! })
    start = end
  }
  return rows
}

function rankComposite<T extends { student: Student; composite: number | null }>(rows: T[]): (T & { overallRank: number | null })[] {
  const sorted = [...rows].sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1) || a.student.number.localeCompare(b.student.number))
  let rank = 0
  let previous: number | null = null
  return sorted.map((row, index) => {
    if (row.composite === null) return { ...row, overallRank: null }
    if (previous === null || Math.abs(previous - row.composite) > 1e-9) rank = index + 1
    previous = row.composite
    return { ...row, overallRank: rank }
  })
}

export function buildAcmRanking(contests: Contest[], selected: Contest, students: Student[], excludeVeterans: boolean) {
  const previous = contests.filter(contest => contest.term === selected.term && contest.date < selected.date).sort((a, b) => a.date.localeCompare(b.date))
  const current = new Map(rankContest(selected, students, excludeVeterans).map(result => [result.studentId, result]))
  const pastRanks = previous.map(contest => ({ contest, ranks: new Map(rankContest(contest, students, excludeVeterans).map(result => [result.studentId, result])) }))
  return rankComposite(students.filter(student => !excludeVeterans || !student.veteran).map(student => {
    const result = current.get(student.id) ?? null
    const history = pastRanks.map(({ contest, ranks }) => ({ id: contest.id, title: contest.title, date: contest.date, result: ranks.get(student.id) ?? null }))
    const historyAverage = mean(history.flatMap(item => item.result ? [item.result.points] : []))
    const historyCount = history.filter(item => item.result).length
    return { student, current: result, history, historyAverage, historyCount, historyTotal: previous.length, composite: blend(result?.points ?? null, historyAverage) }
  }))
}

export function buildTheoryRanking(exams: Exam[], selected: Exam, students: Student[], scope: HistoryScope) {
  const previous = exams.filter(exam => exam.term === selected.term && exam.date < selected.date && (scope === 'combined' || exam.kind === selected.kind)).sort((a, b) => a.date.localeCompare(b.date))
  const currentRanks = new Map(rankComposite(students.map(student => ({ student, composite: gradeValue(selected.grades.find(grade => grade.studentId === student.id)) }))).map(row => [row.student.id, row.overallRank]))
  return rankComposite(students.map(student => {
    const grade = selected.grades.find(item => item.studentId === student.id)
    const currentScore = gradeValue(grade)
    const history = previous.map(exam => ({ id: exam.id, title: exam.title, date: exam.date, kind: exam.kind, grade: exam.grades.find(item => item.studentId === student.id) }))
    const historyAverage = mean(history.flatMap(item => { const score = gradeValue(item.grade); return score === null ? [] : [score] }))
    const historyCount = history.filter(item => gradeValue(item.grade) !== null).length
    return { student, grade, currentScore, currentRank: currentRanks.get(student.id) ?? null, history, historyAverage, historyCount, historyTotal: previous.length, composite: blend(currentScore, historyAverage) }
  }))
}

export function rubricScore(parts: Record<string, number>, criteria: { id: string; weight: number }[]) {
  if (!criteria.length || Math.abs(criteria.reduce((sum, item) => sum + item.weight, 0) - 1) > 1e-9 || criteria.some(item => !validScore(parts[item.id]))) return null
  return criteria.reduce((total, item) => total + parts[item.id] * item.weight, 0)
}

export type AcmRow = ReturnType<typeof buildAcmRanking>[number]
export type TheoryRow = ReturnType<typeof buildTheoryRanking>[number]
