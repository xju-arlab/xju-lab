export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ApiEndpoint = Readonly<{
  method: ApiMethod
  path: string
}>

/** Suggested integration paths only. The demo UI does not call these endpoints. */
export const apiPlaceholders = {
  overview: { summary: { method: 'GET', path: '/api/v1/overview' } },
  projects: {
    list: { method: 'GET', path: '/api/v1/projects' },
    create: { method: 'POST', path: '/api/v1/projects' },
    update: { method: 'PATCH', path: '/api/v1/projects/{projectId}' },
    tasks: { method: 'GET', path: '/api/v1/projects/{projectId}/tasks' },
    createTask: { method: 'POST', path: '/api/v1/projects/{projectId}/tasks' },
    updateTask: { method: 'PATCH', path: '/api/v1/tasks/{taskId}' },
  },
  seats: {
    list: { method: 'GET', path: '/api/v1/seats' },
    assign: { method: 'PUT', path: '/api/v1/seats/{seatId}/assignment' },
    members: { method: 'GET', path: '/api/v1/members' },
    layout: { method: 'GET', path: '/api/v1/seats/layout' },
    saveLayout: { method: 'PUT', path: '/api/v1/seats/layout' },
  },
  leave: {
    list: { method: 'GET', path: '/api/v1/leave-applications' },
    create: { method: 'POST', path: '/api/v1/leave-applications' },
    decide: { method: 'POST', path: '/api/v1/leave-applications/{applicationId}/decision' },
    withdraw: { method: 'POST', path: '/api/v1/leave-applications/{applicationId}/withdraw' },
  },
  printing: {
    listJobs: { method: 'GET', path: '/api/v1/print-jobs' },
    submit: { method: 'POST', path: '/api/v1/print-jobs' },
    cancel: { method: 'POST', path: '/api/v1/print-jobs/{jobId}/cancel' },
  },
  meetings: {
    list: { method: 'GET', path: '/api/v1/meetings' },
    saveMinutes: { method: 'PUT', path: '/api/v1/meetings/{meetingId}/minutes' },
  },
  compute: {
    servers: { method: 'GET', path: '/api/v1/compute/servers' },
    metrics: { method: 'GET', path: '/api/v1/compute/metrics' },
  },
  assessment: {
    contests: { method: 'GET', path: '/api/v1/assessment/acm/contests' },
    acmRanking: { method: 'GET', path: '/api/v1/assessment/acm/contests/{contestId}/ranking' },
    exams: { method: 'GET', path: '/api/v1/assessment/theory/exams' },
    theoryRanking: { method: 'GET', path: '/api/v1/assessment/theory/exams/{examId}/ranking' },
    saveGrade: { method: 'PUT', path: '/api/v1/assessment/theory/exams/{examId}/grades/{memberId}' },
    updateMemberGroup: { method: 'PATCH', path: '/api/v1/assessment/member-groups/{memberId}' },
    importContest: { method: 'POST', path: '/api/v1/assessment/acm/imports' },
    importStatus: { method: 'GET', path: '/api/v1/assessment/acm/imports/{importId}' },
  },
  memberAdministration: {
    updateRoles: { method: 'PUT', path: '/api/v1/admin/members/{memberId}/roles' },
    ojRoleSync: { method: 'GET', path: '/api/v1/admin/members/{memberId}/oj-role-sync' },
    retryOjRoleSync: { method: 'POST', path: '/api/v1/admin/members/{memberId}/oj-role-sync/retry' },
  },
  settings: {
    read: { method: 'GET', path: '/api/v1/lab/settings' },
    update: { method: 'PUT', path: '/api/v1/lab/settings' },
  },
  profile: {
    read: { method: 'GET', path: '/api/v1/members/me' },
    update: { method: 'PATCH', path: '/api/v1/members/me' },
  },
  publicPage: {
    read: { method: 'GET', path: '/api/v1/public/lab-profile' },
    apply: { method: 'POST', path: '/api/v1/public/applications' },
  },
} as const satisfies Record<string, Record<string, ApiEndpoint>>
