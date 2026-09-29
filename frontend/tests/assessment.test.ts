import assert from 'node:assert/strict'
import test from 'node:test'
import { blend, buildAcmRanking, buildTheoryRanking, gradeValue, rankContest, rankPoints, rubricScore, validScore } from '../src/features/assessment/scoring.ts'
import type { Contest, Exam, Grade, Student } from '../src/features/assessment/types.ts'
import { parseOjContestLink } from '../src/features/assessment/ojImport.ts'

const members: Student[] = ['a', 'b', 'v'].map(id => ({ id, name: id, number: id, handle: id, veteran: id === 'v' }))
function contest(id: string, date: string, results: [string, number, number][], term = 'term'): Contest {
  return { id, title: id, date, term, problems: ['A'], results: results.map(([studentId, solved, penalty]) => ({ studentId, solved, penalty, submissions: solved, problems: {} })) }
}
function exam(id: string, date: string, kind: Exam['kind'], score: number | null, status: Grade['status'] = 'graded', term = 'term'): Exam {
  return { id, title: id, date, term, kind, criteria: [], grades: [{ studentId: 'a', status, score }] }
}

test('rank normalization compares different field sizes and uses a neutral singleton', () => {
  assert.equal(rankPoints(1, 20), 100)
  assert.equal(rankPoints(20, 20), 0)
  assert.equal(rankPoints(3, 5), rankPoints(11, 21))
  assert.equal(rankPoints(1, 1), 50)
  assert.equal(rankPoints(1, 0), null)
  assert.equal(rankPoints(4, 3), null)
  assert.ok(Math.abs(blend(rankPoints(4, 20), 80)! - 83.15789473684211) < 1e-10)
})
test('ACM ranks by solved then penalty; ties share displayed rank and average occupied rank for points', () => {
  const event = contest('tie', '2026-09-12', [['a', 4, 100], ['b', 4, 100], ['v', 3, 1]])
  const rows = rankContest(event, members, false)
  assert.deepEqual(rows.map(row => [row.rank, row.midRank, row.points]), [[1, 1.5, 75], [1, 1.5, 75], [3, 3, 0]])
  assert.deepEqual(event.results.map(row => row.studentId), ['a', 'b', 'v'])
})
test('all tied zero-solve participants receive the same neutral rank points', () => {
  const event = contest('tie', '2026-09-12', [['a', 0, 0], ['b', 0, 0], ['v', 0, 0]])
  assert.deepEqual(rankContest(event, members, false).map(row => row.points), [50, 50, 50])
})
test('veteran exclusion recomputes BOTH historical and current fields before weighting', () => {
  const before = contest('old', '2026-09-12', [['v', 9, 10], ['a', 8, 20], ['b', 7, 30]])
  const now = contest('now', '2026-09-19', [['b', 10, 10], ['v', 9, 20], ['a', 8, 30]])
  const all = buildAcmRanking([before, now], now, members, false)
  const rookies = buildAcmRanking([before, now], now, members, true)
  assert.equal(all.find(row => row.student.id === 'a')!.composite, 12.5)
  assert.equal(rookies.find(row => row.student.id === 'a')!.composite, 25)
  assert.equal(rookies.find(row => row.student.id === 'a')!.current!.count, 2)
  assert.equal(rookies.length, 2)
})
test('ACM history excludes future contests and other terms; a missing current result never receives a rank', () => {
  const before = contest('old', '2026-09-12', [['a', 2, 0], ['b', 1, 0]])
  const now = contest('now', '2026-09-19', [['b', 1, 0]])
  const future = contest('future', '2026-09-26', [['a', 1, 0]])
  const other = contest('other', '2026-09-10', [['a', 1, 0]], 'other-term')
  const rows = buildAcmRanking([before, now, future, other], now, members, false)
  const missing = rows.find(row => row.student.id === 'a')!
  assert.equal(missing.historyTotal, 1)
  assert.equal(missing.historyAverage, 100)
  assert.equal(missing.composite, null)
  assert.equal(missing.overallRank, null)
})
test('first appearance falls back to current points and explicitly has zero history', () => {
  const now = contest('now', '2026-09-19', [['a', 3, 0], ['b', 1, 0]])
  const row = buildAcmRanking([now], now, members, true)[0]
  assert.equal(row.historyCount, 0)
  assert.equal(row.historyAverage, null)
  assert.equal(row.composite, row.current!.points)
})
test('theory history combines written and practical marks, with exactly 25/75 weighting', () => {
  const practical = exam('practical', '2026-09-10', 'practical', 80)
  const written = exam('written', '2026-09-12', 'written', 60)
  const now = exam('now', '2026-09-19', 'written', 100)
  const row = buildTheoryRanking([practical, written, now], now, members, 'combined').find(row => row.student.id === 'a')!
  assert.equal(row.historyCount, 2)
  assert.equal(row.historyAverage, 70)
  assert.equal(row.composite, 92.5)
})
test('graded zero counts, while missing, pending, absent and exempt marks do not', () => {
  const past = [exam('zero', '2026-09-10', 'practical', 0), exam('full', '2026-09-11', 'written', 100), exam('pending', '2026-09-12', 'written', null, 'pending'), exam('absent', '2026-09-13', 'written', null, 'absent'), exam('exempt', '2026-09-14', 'written', null, 'exempt')]
  const now = exam('now', '2026-09-19', 'written', 0)
  const row = buildTheoryRanking([...past, now], now, members, 'combined').find(row => row.student.id === 'a')!
  assert.equal(row.historyCount, 2)
  assert.equal(row.historyTotal, 5)
  assert.equal(row.historyAverage, 50)
  assert.equal(row.currentScore, 0)
  assert.equal(row.composite, 12.5)
  assert.equal(gradeValue({ studentId: 'a', status: 'pending', score: 100 }), null)
})
test('an ungraded current exam stays unranked even with perfect history', () => {
  const past = exam('past', '2026-09-10', 'practical', 100)
  const now = exam('now', '2026-09-19', 'written', null, 'pending')
  const row = buildTheoryRanking([past, now], now, members, 'combined')[0]
  assert.equal(row.composite, null)
  assert.equal(row.overallRank, null)
})
test('theory excludes future and other-term grades and does not round before ranking', () => {
  const now = exam('now', '2026-09-19', 'written', 84.001)
  now.grades.push({ studentId: 'b', score: 84.004, status: 'graded' })
  const rows = buildTheoryRanking([now, exam('future', '2026-09-20', 'written', 0), exam('other', '2026-09-10', 'written', 0, 'graded', 'other')], now, members, 'combined')
  assert.equal(rows[0].student.id, 'b')
  assert.equal(rows[0].historyTotal, 0)
  assert.equal(rows[1].overallRank, 2)
})
test('equal composite scores share ranks', () => {
  const now = exam('now', '2026-09-19', 'written', 88)
  now.grades.push({ studentId: 'b', score: 88, status: 'graded' }, { studentId: 'v', score: 80, status: 'graded' })
  assert.deepEqual(buildTheoryRanking([now], now, members, 'combined').map(row => row.overallRank), [1, 1, 3])
})
test('rubrics reject incomplete/out-of-range inputs and preserve zero marks', () => {
  const criteria = [{ id: 'quality', weight: .4 }, { id: 'speed', weight: .4 }, { id: 'standard', weight: .2 }]
  assert.equal(rubricScore({ quality: 80, speed: 90, standard: 100 }, criteria), 88)
  assert.equal(rubricScore({ quality: 0, speed: 0, standard: 0 }, criteria), 0)
  assert.equal(rubricScore({ quality: 80 }, criteria), null)
  assert.equal(rubricScore({ quality: 101, speed: 90, standard: 100 }, criteria), null)
  assert.equal(rubricScore({ quality: 80 }, [{ id: 'quality', weight: .5 }]), null)
  for (const value of [NaN, Infinity, -1, 101, null, '80']) assert.equal(validScore(value), false)
})

test('theory current ranks ignore history while historical composite ranks retain 25/75 weighting', () => {
  const past = exam('past', '2026-09-12', 'practical', 100)
  past.grades.push({ studentId: 'b', score: 0, status: 'graded' })
  const now = exam('now', '2026-09-19', 'written', 80)
  now.grades.push({ studentId: 'b', score: 90, status: 'graded' })
  const rows = buildTheoryRanking([past, now], now, members, 'combined')
  assert.deepEqual(rows.map(row => [row.student.id, row.currentRank, row.overallRank]), [['a', 2, 1], ['b', 1, 2], ['v', null, null]])
  assert.equal(rows[0].composite, 85)
  assert.equal(rows[1].composite, 67.5)
})

test('theory current ranking shares ties and includes zero but excludes pending grades', () => {
  const now = exam('now', '2026-09-19', 'written', 0)
  now.grades.push({ studentId: 'b', score: 0, status: 'graded' }, { studentId: 'v', score: 100, status: 'pending' })
  assert.deepEqual(buildTheoryRanking([now], now, members, 'combined').map(row => row.currentRank), [1, 1, null])
})

test('OJ links identify the full contest independently of a pasted pagination query', () => {
  for (const input of ['https://oj.icthub.top/contest/13', ' https://oj.icthub.top/contest/13/rank?page=2#rank ', 'https://oj.icthub.top/contest/13/rank/']) {
    assert.deepEqual(parseOjContestLink(input), { contestId: '13', canonicalUrl: 'https://oj.icthub.top/contest/13/rank' })
  }
})

test('OJ import rejects foreign origins, credentials, invalid IDs and unsupported paths', () => {
  for (const input of ['', 'http://oj.icthub.top/contest/13', 'https://oj.icthub.top.evil.example/contest/13/rank', 'https://evil.example/contest/13', 'https://user:pass@oj.icthub.top/contest/13', 'https://oj.icthub.top:8443/contest/13', 'https://oj.icthub.top/contest/0', 'https://oj.icthub.top/contest/-1', 'https://oj.icthub.top/contest/1.5', 'https://oj.icthub.top/contest/9007199254740993', 'https://oj.icthub.top/admin/users', 'javascript:alert(1)']) assert.equal(parseOjContestLink(input), null, input)
})
