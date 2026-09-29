import type { Contest, Criterion, Exam, Grade, Student } from './types.ts'
import { rubricScore } from './scoring.ts'

// Synthetic people, submissions and marks for the interactive prototype; no live student records.
export const students: Student[] = ['林予宁', '许知远', '周亦辰', '苏言', '王清和', '赵一禾', '何书宁', '沈念', '唐可', '陆知行', '孟一然', '顾望'].map((name, index) => ({
  id: `demo-${index + 1}`, number: `DEMO-${index < 9 ? '26' : '25'}${String(index + 1).padStart(3, '0')}`, name, handle: `learner_${String(index + 1).padStart(2, '0')}`, veteran: index >= 9,
}))
const term = '2026-autumn'
const problemNames = ['A', 'B', 'C', 'D', 'E', 'F']
function contest(id: string, title: string, date: string, solved: number[], offset: number): Contest {
  return { id, title, date, term, problems: problemNames, results: students.flatMap((student, index) => {
    if (solved[index] < 0) return []
    const count = solved[index]
    const problems = Object.fromEntries(problemNames.flatMap((name, problem) => problem < count
      ? [[name, { accepted: true, minutes: 15 + problem * 24 + ((index + offset) % 6) * 7, wrong: (index + problem + offset) % 3 === 0 ? 1 : 0 }]]
      : problem === count && count < problemNames.length ? [[name, { accepted: false, minutes: 0, wrong: 1 + index % 3 }]] : []))
    const penalty = Object.values(problems).reduce((total, item) => total + (item.accepted ? (item.minutes + item.wrong * 20) * 60 : 0), 0)
    const submissions = Object.values(problems).reduce((total, item) => total + item.wrong + Number(item.accepted), 0)
    return [{ studentId: student.id, solved: count, submissions, penalty, problems }]
  }) }
}
export const contests = [
  contest('demo-acm-11', '基础算法训练 · 第 1 场', '2026-09-12', [3, 4, 2, 3, 2, 1, 2, -1, -1, 5, 5, 4], 2),
  contest('demo-acm-12', '搜索与排序 · 第 2 场', '2026-09-19', [4, 3, 4, 2, 3, 3, 1, 2, -1, 6, 5, 4], 1),
  contest('demo-acm-13', 'ACM 算法周赛 · 第 3 场', '2026-09-26', [5, 4, 4, 3, 3, 2, 2, 1, 0, 6, 5, 4], 0),
]
for (const event of contests) for (const problem of event.problems) {
  const fastest = event.results.filter(row => row.problems[problem]?.accepted).sort((a, b) => a.problems[problem].minutes - b.problems[problem].minutes)[0]
  if (fastest) fastest.problems[problem].first = true
}

const written: Criterion[] = [{ id: 'concept', label: '概念理解', weight: .4 }, { id: 'calculation', label: '推导计算', weight: .35 }, { id: 'analysis', label: '分析应用', weight: .25 }]
const practical: Criterion[] = [{ id: 'q2code', label: '代码质量 · 2', weight: .1 }, { id: 'q2visual', label: '呈现效果 · 2', weight: .1 }, { id: 'q3code', label: '代码质量 · 3', weight: .1 }, { id: 'q3visual', label: '呈现效果 · 3', weight: .1 }, { id: 'speed', label: '提交速度', weight: .4 }, { id: 'standard', label: '提交规范', weight: .2 }]
function exam(id: string, title: string, date: string, kind: Exam['kind'], base: number[], offset: number): Exam {
  const criteria = kind === 'written' ? written : practical
  return { id, title, date, kind, term, criteria, grades: students.slice(0, 9).map((student, index): Grade => {
    if (base[index] === -1) return { studentId: student.id, score: null, status: 'pending' }
    if (base[index] === -2) return { studentId: student.id, score: null, status: 'absent', note: '缺考原因待登记。' }
    const parts = Object.fromEntries(criteria.map((item, part) => [item.id, Math.max(0, Math.min(100, base[index] + (index + part + offset) % 7 - 3))]))
    return { studentId: student.id, status: 'graded', parts, score: rubricScore(parts, criteria), note: kind === 'written' ? '能够说明主要概念，继续加强推导过程与结论解释。' : '已完成演示任务；建议补充复现步骤与边界情况说明。' }
  }) }
}
export const exams = [
  exam('demo-dl-1', '环境与工具 · 机试', '2026-09-19', 'practical', [82, 88, 75, 79, 72, 81, 68, 70, -1], 1),
  exam('demo-dl-2', '张量与数据操作 · 笔试', '2026-09-23', 'written', [87, 83, 79, 76, 78, 74, 72, -2, -1], 2),
  exam('demo-dl-3', '张量与数据操作 · 机试', '2026-09-26', 'practical', [91, 85, 82, 83, 76, 79, 74, 77, -1], 0),
  exam('demo-dl-4', '数学基础 · 笔试', '2026-09-29', 'written', [92, 89, 86, 81, 84, 78, -1, -2, 73], 0),
]

export const theoryStudents = students.slice(0, 9)
