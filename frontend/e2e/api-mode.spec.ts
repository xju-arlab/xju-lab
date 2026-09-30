import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const admin = { username: 'local-admin', password: 'local-admin-change-me' }
const memberA = { username: 'local-member-a', password: 'local-member-a-change-me' }
const memberB = { username: 'local-member-b', password: 'local-member-b-change-me' }

function percentile(samples: number[], percentileValue: number) {
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * percentileValue) - 1]
}

async function signIn(page: Page, user: { username: string; password: string }) {
  await page.goto('/app/dashboard')
  const loginLink = page.getByRole('link', { name: /统一身份登录/ })
  await expect(loginLink).toBeVisible()
  await loginLink.click()
  const username = page.locator('#username')
  const location = new URL(page.url())
  const locationLabel = `${location.origin}${location.pathname}`
  const pageText = await page.locator('body').innerText().catch(() => '')
  await expect(username, `Expected the local IdP login form at ${locationLabel}; page text: ${pageText}`).toBeVisible({ timeout: 30_000 })
  await username.fill(user.username)
  await page.locator('#password').fill(user.password)
  await page.locator('#kc-login').click()
  const platformLink = page.getByRole('link', { name: '进入实验室平台' })
  const resultUrl = new URL(page.url())
  const resultLocation = `${resultUrl.origin}${resultUrl.pathname}`
  const resultText = await page.locator('body').innerText().catch(() => '')
  await expect(platformLink, `OIDC login did not return to the app at ${resultLocation}; page text: ${resultText}`).toBeVisible({ timeout: 30_000 })
  await platformLink.click()
  const registrationHeading = page.getByRole('heading', { name: '完成成员实名登记' })
  const registrationNetwork: string[] = []
  if (await registrationHeading.isVisible().catch(() => false)) {
    const realName = page.getByLabel('真实姓名')
    const studentNumberField = page.getByLabel('学号')
    const className = page.getByLabel('班级')
    await realName.fill(`${user.username} 实名测试`)
    await expect(realName).toHaveValue(`${user.username} 实名测试`)
    const studentNumber = user.username === 'local-admin' ? '20260001' : user.username === 'local-member-a' ? '20260002' : '20260003'
    await studentNumberField.fill(studentNumber)
    await expect(studentNumberField).toHaveValue(studentNumber)
    await expect(realName).toHaveValue(`${user.username} 实名测试`)
    await className.fill('计算机24-3')
    await expect(className).toHaveValue('计算机24-3')
    await expect(realName).toHaveValue(`${user.username} 实名测试`)
    await expect(studentNumberField).toHaveValue(studentNumber)
    await page.getByRole('button', { name: '深度学习', exact: true }).click()
    await expect(className).toHaveValue('计算机24-3')
    await expect(studentNumberField).toHaveValue(studentNumber)
    await page.getByLabel('自定义方向').fill('图神经网络')
    await expect(className).toHaveValue('计算机24-3')
    await page.getByRole('button', { name: '添加', exact: true }).click()
    await expect(realName).toHaveValue(`${user.username} 实名测试`)
    await expect(studentNumberField).toHaveValue(studentNumber)
    await expect(className).toHaveValue('计算机24-3')
    page.on('request', request => {
      const path = new URL(request.url()).pathname
      if (path.endsWith('/api/v1/csrf') || path.endsWith('/api/v1/members/me/registration')) registrationNetwork.push(`${request.method()} ${path}`)
    })
    page.on('response', response => {
      const path = new URL(response.url()).pathname
      if (path.endsWith('/api/v1/csrf') || path.endsWith('/api/v1/members/me/registration')) registrationNetwork.push(`${response.status()} ${path}`)
    })
    page.on('requestfailed', request => {
      const path = new URL(request.url()).pathname
      if (path.endsWith('/api/v1/csrf') || path.endsWith('/api/v1/members/me/registration')) registrationNetwork.push(`FAILED ${path}: ${request.failure()?.errorText ?? 'unknown'}`)
    })
    await expect(page.getByRole('button', { name: '保存并进入实验室' })).toBeEnabled()
    await page.getByRole('button', { name: '保存并进入实验室' }).click()
  }
  try {
    await expect(page.getByRole('heading', { name: '总览' })).toBeVisible()
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      url: location.href,
      text: document.body.innerText.slice(0, 1200),
      inputs: Array.from(document.querySelectorAll('input')).map(input => ({
        name: input.name, valid: input.checkValidity(), valueLength: input.value.length,
        readOnly: input.readOnly, disabled: input.disabled, validationMessage: input.validationMessage,
      })),
      formValidity: Array.from(document.forms).map(form => form.checkValidity()),
    }))
    throw new Error(`${String(error)}\nRegistration diagnostics: ${JSON.stringify({ ...diagnostics, network: registrationNetwork })}`)
  }
  await expect(page.getByText('API 实时数据')).toBeVisible()
}

test('OIDC API mode keeps project data scoped across users and viewports', async ({ browser }) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  const failedResponses: string[] = []
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const adminPage = await adminContext.newPage()
  adminPage.on('response', response => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`)
  })
  adminPage.on('pageerror', error => pageErrors.push(error.message))
  const meetingResponses: string[] = []
  adminPage.on('response', response => {
    if (response.url().includes('/api/v1/meetings')) {
      void response.text().then(body => meetingResponses.push(`${response.status()} ${response.url()} ${body.slice(0, 300)}`)).catch(() => {})
    }
  })

  await signIn(adminPage, admin)
  adminPage.on('console', message => {
    if (message.type() !== 'error') return
    const location = message.location()
    const expectedInjectedFailure = location.url.endsWith('/api/v1/overview') && message.text().includes('503')
    if (!expectedInjectedFailure) pageErrors.push(`${message.text()} @ ${JSON.stringify(location)}`)
  })
  const adminSession = await adminPage.evaluate(async () => (await fetch('/api/v1/session')).json())
  expect(adminSession.roles.some((role: string) => ['LAB_ADMIN', 'SUPER_ADMIN'].includes(role)), JSON.stringify(adminSession)).toBe(true)
  const responsiveRoutes = [
    ['/app/dashboard', '总览'],
    ['/app/seats', '工位一览'],
    ['/app/projects', '项目空间'],
    ['/app/meetings', '会议记录'],
    ['/app/leave', '请假申请'],
    ['/app/assessment', '成长与考核'],
    ['/app/servers', '计算资源'],
    ['/app/profile', '个人资料'],
    ['/app/members', '成员管理'],
    ['/app/settings', '管理与设置'],
    ['/app/publish', '公开发布'],
    ['/app/notifications', '通知中心'],
  ] as const
  for (const width of [375, 768, 1440]) {
    await adminPage.setViewportSize({ width, height: 900 })
    if (width === 375) {
      await adminPage.goto('/app/dashboard')
      const menu = adminPage.getByRole('button', { name: '打开导航' })
      await menu.focus()
      await adminPage.keyboard.press('Enter')
      await expect(menu).toHaveAttribute('aria-expanded', 'true')
      await expect(menu).toBeFocused()
      await adminPage.keyboard.press('Escape')
      await expect(menu).toHaveAttribute('aria-expanded', 'false')
      await expect(menu).toBeFocused()
      await adminPage.keyboard.press('Enter')
      await expect(menu).toHaveAttribute('aria-expanded', 'true')
      await adminPage.getByRole('button', { name: '关闭导航' }).click()
      await expect(menu).toHaveAttribute('aria-expanded', 'false')
    }

    for (const [path, heading] of responsiveRoutes) {
      await adminPage.goto(path)
      await expect(adminPage.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await adminPage.waitForLoadState('networkidle')
      const dimensions = await adminPage.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }))
      expect(dimensions.document, `${path} overflows at ${width}px`).toBeLessThanOrEqual(dimensions.viewport)
    }
  }
  await expect.poll(() => adminPage.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active))).toBe(true)
  const serviceWorkerCache = await adminPage.evaluate(async () => {
    const names = await caches.keys()
    const cachedUrls = await Promise.all(names.filter(name => name.startsWith('xju-lab-static-')).map(async name => {
      const cache = await caches.open(name)
      return (await cache.keys()).map(request => new URL(request.url).pathname)
    }))
    return { cacheNames: names, cachedUrls: cachedUrls.flat() }
  })
  expect(serviceWorkerCache.cacheNames).toContain('xju-lab-static-v1')
  expect(serviceWorkerCache.cachedUrls).toContain('/offline.html')
  expect(serviceWorkerCache.cachedUrls.every(path => path === '/offline.html' || /^\/assets\/[A-Za-z0-9._-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2|svg|png|jpg|webp)$/i.test(path))).toBe(true)

  await adminPage.goto('/app/dashboard')
  await adminPage.route('**/api/v1/overview', async route => {
    await new Promise(resolve => setTimeout(resolve, 600))
    await route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ code: 'E2E_UNAVAILABLE', message: '隔离错误状态校验', requestId: 'e2e-error-state' }) })
  })
  await adminPage.reload()
  await expect(adminPage.getByText('正在读取服务端数据…').first()).toBeVisible()
  await expect(adminPage.getByRole('alert')).toContainText('隔离错误状态校验')
  await expect(adminPage.locator('.api-stat-grid')).toHaveCount(0)
  await adminPage.unroute('**/api/v1/overview')
  await adminPage.getByRole('alert').getByRole('button', { name: '重试' }).click()
  await expect(adminPage.locator('.api-stat-grid strong')).toHaveCount(4)

  const projectTitle = `浏览器验收项目-${Date.now()}`
  const taskTitle = `浏览器验收任务-${Date.now()}`
  await adminPage.goto('/app/projects')
  await expect(adminPage.getByRole('heading', { name: '项目空间' })).toBeVisible()
  await adminPage.locator('details.api-create summary').click()
  await adminPage.getByLabel('项目名称').fill(projectTitle)
  await adminPage.getByLabel('项目简介').fill('用于真实 API 会话和对象权限验收')
  await adminPage.getByRole('button', { name: '创建项目' }).click()

  const projectRow = adminPage.getByRole('button', { name: new RegExp(projectTitle) })
  await expect(projectRow).toBeVisible()
  await projectRow.click()
  const projectDetails = await adminPage.evaluate(async title => {
    const response = await fetch('/api/v1/projects?page=1&pageSize=100')
    const page = await response.json()
    return page.items.find((item: { title: string }) => item.title === title)
  }, projectTitle)
  const membershipSelect = adminPage.locator('select[name="memberId"]')
  const projectPageText = await adminPage.locator('main#main-content').innerText().catch(() => '')
  await expect(membershipSelect, `Project management controls missing; session=${JSON.stringify(adminSession)} project=${JSON.stringify(projectDetails)} page=${projectPageText}`).toBeVisible({ timeout: 5_000 })
  await membershipSelect.selectOption('00000000-0000-4000-8000-000000000102')
  const membershipForm = adminPage.locator('form').filter({ has: adminPage.locator('select[name="memberId"]') })
  await membershipForm.getByRole('button', { name: '添加' }).click()
  await expect(adminPage.getByText('项目成员已添加')).toBeVisible()

  const taskForm = adminPage.locator('form').filter({ has: adminPage.getByPlaceholder('下一步任务') })
  await taskForm.getByPlaceholder('下一步任务').fill(taskTitle)
  await taskForm.getByRole('button', { name: '添加任务' }).click()
  await expect(adminPage.getByText(taskTitle)).toBeVisible()

  const memberDataset = await adminPage.evaluate(async () => {
    const response = await fetch('/api/v1/members?page=1&pageSize=100')
    const page = await response.json()
    return { status: response.status, total: page.total, loaded: page.items.length }
  })
  expect(memberDataset).toEqual({ status: 200, total: 100, loaded: 100 })
  const concurrentMemberReads = await adminPage.evaluate(async () => Promise.all(
    Array.from({ length: 50 }, async () => {
      const startedAt = performance.now()
      const response = await fetch('/api/v1/members?page=1&pageSize=100')
      await response.arrayBuffer()
      return { durationMs: performance.now() - startedAt, status: response.status }
    }),
  ))
  expect(concurrentMemberReads.map(result => result.status)).toEqual(Array(50).fill(200))
  const memberReadP95 = percentile(concurrentMemberReads.map(result => result.durationMs), 0.95)

  const dashboardLoads: number[] = []
  for (let sample = 0; sample < 10; sample += 1) {
    const startedAt = performance.now()
    await adminPage.goto('/app/dashboard')
    await expect(adminPage.getByRole('heading', { name: '总览' })).toBeVisible()
    await expect(adminPage.locator('.api-stat-grid strong')).toHaveCount(4)
    dashboardLoads.push(performance.now() - startedAt)
  }
  const dashboardP95 = percentile(dashboardLoads, 0.95)
  console.log(`PERFORMANCE_BASELINE ${JSON.stringify({
    environment: 'GitHub-hosted Ubuntu 24.04, local Compose stack, Chromium',
    dataset: '100 synthetic member rows, 1 project, 1 task; 1 authenticated session',
    api: { route: 'GET /api/v1/members?page=1&pageSize=100', concurrentRequests: 50, authenticatedSessions: 1, p95Ms: Math.round(memberReadP95) },
    dashboard: { samples: dashboardLoads.length, p95Ms: Math.round(dashboardP95) },
  })}`)
  // CI smoke guardrail only; no production latency SLO or hardware baseline is specified.
  expect(memberReadP95).toBeLessThan(1_000)
  expect(dashboardP95).toBeLessThan(1000)

  await adminPage.goto('/app/seats')
  await expect(adminPage.getByRole('heading', { name: '工位一览' })).toBeVisible()
  const [svgDownload] = await Promise.all([
    adminPage.waitForEvent('download', { timeout: 15_000 }),
    adminPage.getByRole('button', { name: 'SVG' }).click(),
  ])
  expect(svgDownload.suggestedFilename()).toBe('实验室工位平面图.svg')
  const svgContents = await readFile((await svgDownload.path())!)
  expect(svgContents.toString('utf8')).toContain('<svg')
  expect(svgContents.toString('utf8')).toContain('data-seat-id')

  const pngDownloadPromise = adminPage.waitForEvent('download', { timeout: 15_000 }).catch(async error => {
    const status = await adminPage.getByRole('status').allTextContents().catch(() => [])
    throw new Error(`${error.message}; status=${status.join(' | ')}; browser errors=${pageErrors.join(' | ')}`)
  })
  const [pngDownload] = await Promise.all([
    pngDownloadPromise,
    adminPage.getByRole('button', { name: 'PNG' }).click(),
  ])
  expect(pngDownload.suggestedFilename()).toBe('实验室工位平面图.png')
  await expect(adminPage.getByText('PNG 平面图已生成')).toBeVisible()
  const pngContents = await readFile((await pngDownload.path())!)
  expect([...pngContents.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

  const meetingTitle = `浏览器验收会议-${Date.now()}`
  const meetingAction = `浏览器验收会议行动项-${Date.now()}`
  await adminPage.goto('/app/meetings')
  await adminPage.getByText('安排会议', { exact: true }).click()
  await adminPage.getByLabel('会议主题').fill(meetingTitle)
  await adminPage.getByLabel('开始时间（北京时间）').fill('2030-05-20T09:00')
  await adminPage.locator('select[name="participants"]').selectOption('00000000-0000-4000-8000-000000000102')
  await adminPage.getByRole('button', { name: '创建会议' }).click()
  await expect(adminPage.getByText('会议已创建', { exact: true })).toBeVisible()
  await adminPage.getByRole('button', { name: new RegExp(meetingTitle) }).click()
  await expect(adminPage.getByRole('heading', { name: meetingTitle })).toBeVisible()
  const meetingMain = adminPage.locator('main#main-content')
  const meetingPageText = await meetingMain.innerText().catch(() => '')
  await expect(meetingMain.locator('textarea[name="body"]'), `Meeting detail did not load; page=${meetingPageText}; requests=${meetingResponses.join(' | ')}`).toBeVisible()
  await meetingMain.locator('textarea[name="body"]').fill('浏览器验收会议纪要，行动项写入共享任务。')
  await adminPage.getByRole('button', { name: '保存纪要' }).click()
  await expect(adminPage.getByText('会议纪要已保存', { exact: true })).toBeVisible()
  const meetingActionForm = adminPage.locator('form').filter({ has: adminPage.getByRole('button', { name: '创建行动项' }) })
  await meetingActionForm.locator('input[name="title"]').fill(meetingAction)
  await meetingActionForm.locator('select[name="assigneeId"]').selectOption('00000000-0000-4000-8000-000000000102')
  await meetingActionForm.getByRole('button', { name: '创建行动项' }).click()
  await expect(adminPage.getByText('会议行动项已加入统一任务')).toBeVisible()

  await adminPage.goto('/app/settings')
  const printerName = `浏览器验收虚拟打印机-${Date.now()}`
  const printerForm = adminPage.locator('form').filter({ has: adminPage.locator('input[name="printerName"]') })
  await printerForm.locator('input[name="printerName"]').fill(printerName)
  await printerForm.locator('input[name="printerLocation"]').fill('CI 隔离环境')
  await printerForm.getByRole('button', { name: '登记打印机' }).click()
  const issuedCredentials = await adminPage.locator('pre.api-credential').innerText()
  const printerId = issuedCredentials.match(/PRINTER_ID=([\w-]+)/)?.[1]
  const agentToken = issuedCredentials.match(/AGENT_TOKEN=([\w-]+)/)?.[1]
  expect(printerId).toBeTruthy()
  expect(agentToken).toBeTruthy()
  await adminPage.getByRole('button', { name: '已安全保存' }).click()
  const printerStatus = await adminPage.evaluate(async ({ token }) => {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const heartbeat = await fetch('/api/v1/printer-agent/heartbeat', { method: 'POST', headers, body: JSON.stringify({ agentVersion: 'browser-e2e', deviceState: 'READY', tonerSupported: false, tonerPercent: null }) })
    const list = await fetch('/api/v1/printers')
    const printers = await list.json()
    const retiredPoll = await fetch('/api/v1/printer-agent/poll', { method: 'POST', headers, body: '{}' })
    const retiredQueue = await fetch('/api/v1/print/jobs')
    return { heartbeatStatus: heartbeat.status, listStatus: list.status, status: printers[0]?.status, deviceState: printers[0]?.lastReport?.deviceState, retiredPollStatus: retiredPoll.status, retiredQueueStatus: retiredQueue.status }
  }, { token: agentToken! })
  expect(printerStatus).toEqual({ heartbeatStatus: 200, listStatus: 200, status: 'ONLINE', deviceState: 'READY', retiredPollStatus: 404, retiredQueueStatus: 404 })
  await adminPage.reload()
  await expect(adminPage.locator('.api-row').filter({ hasText: printerName }).getByText('在线')).toBeVisible()
  await adminPage.goto('/app/dashboard')
  await expect(adminPage.locator('.printer-status-panel').getByText('在线')).toBeVisible()
  await expect(adminPage.getByRole('link', { name: '云打印' })).toHaveCount(0)
  await adminPage.goto('/app/assessment')
  await expect(adminPage.getByLabel('培养期名称')).toBeVisible()
  const termTitle = `浏览器验收培养期-${Date.now()}`
  const termForm = adminPage.locator('form').filter({ has: adminPage.getByRole('button', { name: '创建培养期' }) })
  await termForm.locator('input[name="name"]').fill(termTitle)
  await termForm.locator('input[name="startsOn"]').fill('2030-01-01')
  await termForm.locator('input[name="endsOn"]').fill('2030-12-31')
  await termForm.locator('input[name="active"]').check()
  await termForm.getByRole('button', { name: '创建培养期' }).click()
  await expect(adminPage.getByText('培养期已创建', { exact: true })).toBeVisible()
  const termMemberForm = adminPage.locator('form').filter({ has: adminPage.getByRole('button', { name: '加入培养期' }) })
  await termMemberForm.locator('select[name="memberId"]').selectOption('00000000-0000-4000-8000-000000000102')
  await termMemberForm.getByRole('button', { name: '加入培养期' }).click()
  await expect(adminPage.getByText('成员已加入培养期', { exact: true })).toBeVisible()
  const examTitle = `浏览器验收理论考试-${Date.now()}`
  const examForm = adminPage.locator('form').filter({ has: adminPage.getByRole('button', { name: '创建理论考试' }) })
  await examForm.locator('input[name="title"]').fill(examTitle)
  await examForm.locator('select[name="kind"]').selectOption('WRITTEN')
  await examForm.locator('input[name="startsAt"]').fill('2030-06-01T09:00')
  await examForm.getByRole('button', { name: '创建理论考试' }).click()
  await expect(adminPage.getByText('理论考试已创建', { exact: true })).toBeVisible()
  const assessedMemberRow = adminPage.getByRole('row').filter({ hasText: '本地测试成员甲' })
  await expect(assessedMemberRow).toBeVisible()
  await assessedMemberRow.locator('details').getByText('录入 / 修订').click()
  const gradeForm = assessedMemberRow.locator('form')
  await gradeForm.locator('select[name="status"]').selectOption('GRADED')
  await gradeForm.locator('input[name="score"]').fill('86')
  await gradeForm.locator('input[name="reason"]').fill('浏览器验收修订')
  await gradeForm.getByRole('button', { name: '保存修订' }).click()
  await expect(adminPage.getByText('成绩修订已保存并记录', { exact: true })).toBeVisible()
  await expect(assessedMemberRow).toContainText('86')
  await adminPage.getByRole('button', { name: '历史排名' }).click()
  await expect(adminPage.getByRole('row').filter({ hasText: '本地测试成员甲' })).toBeVisible()
  await adminPage.reload()
  await adminPage.getByRole('tab', { name: '深度学习理论基础' }).click()
  await expect(adminPage.getByRole('row').filter({ hasText: '本地测试成员甲' })).toContainText('86')
  await adminPage.getByRole('button', { name: '发布排行' }).click()
  await expect(adminPage.getByText('排行快照已发布', { exact: true })).toBeVisible()
  const [assessmentCsv] = await Promise.all([
    adminPage.waitForEvent('download'),
    adminPage.getByRole('button', { name: '导出 CSV' }).click(),
  ])
  expect(assessmentCsv.suggestedFilename()).toBe('assessment-theory.csv')
  const csvContents = (await readFile((await assessmentCsv.path())!)).toString('utf8')
  expect(csvContents).toContain('本地测试成员甲')
  expect(csvContents).toContain('86')

  const publicName = `浏览器验收公开页-${Date.now()}`
  const publicDescription = `公开说明-${Date.now()}`
  const publicProject = `公开项目-${Date.now()}`
  await adminPage.goto('/app/publish')
  await adminPage.getByLabel('公开名称').fill(publicName)
  await adminPage.getByLabel('公开简介').fill(publicDescription)
  await adminPage.getByLabel('公开项目（每行一个：标题｜简介）').fill(`${publicProject}｜仅展示显式发布项目`)
  await adminPage.getByRole('button', { name: '发布公开快照' }).click()
  await expect(adminPage.getByText('脱敏公开快照已发布', { exact: true })).toBeVisible()
  const anonymousContext = await browser.newContext()
  const anonymousPage = await anonymousContext.newPage()
  await anonymousPage.goto('/')
  await expect(anonymousPage.getByRole('heading', { name: new RegExp(publicName) })).toBeVisible()
  await expect(anonymousPage.getByText(publicProject)).toBeVisible()
  await expect(anonymousPage.getByText(taskTitle)).toHaveCount(0)
  await adminPage.getByRole('button', { name: '撤回公开内容' }).click()
  await expect(adminPage.getByText('公开内容已撤回', { exact: true })).toBeVisible()
  await anonymousPage.reload()
  await expect(anonymousPage.getByText('尚未发布公开内容 · 内部资料不会自动公开')).toBeVisible()
  await expect(anonymousPage.getByText(publicProject)).toHaveCount(0)
  await anonymousContext.close()

  const projectId = await adminPage.evaluate(async title => {
    const response = await fetch('/api/v1/projects?page=1&pageSize=100')
    const page = await response.json()
    return page.items.find((item: { title: string }) => item.title === title)?.id as string | undefined
  }, projectTitle)
  expect(projectId).toBeTruthy()

  const memberAContext = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const memberAPage = await memberAContext.newPage()
  memberAPage.on('response', response => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`)
  })
  memberAPage.on('pageerror', error => pageErrors.push(error.message))
  await signIn(memberAPage, memberA)
  await memberAPage.getByRole('button', { name: '打开导航' }).click()
  await memberAPage.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '项目空间' }).click()
  const sharedProject = memberAPage.getByRole('button', { name: new RegExp(projectTitle) })
  await expect(sharedProject).toBeVisible()
  await sharedProject.click()
  await expect(memberAPage.getByText(taskTitle)).toBeVisible()
  expect(await memberAPage.getByRole('link', { name: '成员管理' }).count()).toBe(0)
  const memberAAdminStatus = await memberAPage.evaluate(async () => (await fetch('/api/v1/admin/members')).status)
  expect(memberAAdminStatus).toBe(403)
  await memberAPage.reload()
  await expect(memberAPage.getByRole('button', { name: new RegExp(projectTitle) })).toBeVisible()
  await memberAPage.goto('/app/meetings')
  await memberAPage.getByRole('button', { name: new RegExp(meetingTitle) }).click()
  await expect(memberAPage.getByText(meetingAction)).toBeVisible()

  const leaveReason = `PRIVATE_LEAVE_REASON_DO_NOT_PUBLISH-${Date.now()}`
  await memberAPage.goto('/app/leave')
  await memberAPage.getByLabel('开始时间（北京时间）').fill('2030-05-21T09:00')
  await memberAPage.getByLabel('结束时间（北京时间）').fill('2030-05-21T10:00')
  await memberAPage.locator('select[name="approverId"]').selectOption('00000000-0000-4000-8000-000000000101')
  await memberAPage.getByLabel('请假原因').fill(leaveReason)
  await memberAPage.getByRole('button', { name: '提交申请' }).click()
  await expect(memberAPage.getByText('申请已提交', { exact: true })).toBeVisible()
  await adminPage.goto('/app/leave')
  const pendingLeave = adminPage.locator('.api-leave-card').filter({ hasText: leaveReason })
  await expect(pendingLeave).toBeVisible()
  await pendingLeave.getByRole('button', { name: '批准' }).click()
  await expect(adminPage.locator('.api-leave-card').filter({ hasText: leaveReason }).getByText('APPROVED')).toBeVisible()
  await memberAPage.goto('/app/leave')
  await expect(memberAPage.locator('.api-leave-card').filter({ hasText: leaveReason }).getByText('APPROVED')).toBeVisible()
  await memberAPage.goto('/app/notifications')
  const leaveNotification = memberAPage.locator('.api-row').filter({ hasText: 'LEAVE_APPROVED' })
  await expect(leaveNotification).toBeVisible()
  await leaveNotification.getByRole('button', { name: '标为已读' }).click()
  await expect(leaveNotification.getByText('已读')).toBeVisible()

  const memberBContext = await browser.newContext()
  const memberBPage = await memberBContext.newPage()
  memberBPage.on('response', response => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`)
  })
  memberBPage.on('pageerror', error => pageErrors.push(error.message))
  await signIn(memberBPage, memberB)
  await memberBPage.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '项目空间' }).click()
  await expect(memberBPage.getByText('你还没有可见项目。')).toBeVisible()
  const memberBAccess = await memberBPage.evaluate(async id => {
    const projectsResponse = await fetch('/api/v1/projects?page=1&pageSize=100')
    const projects = await projectsResponse.json()
    const taskResponse = await fetch(`/api/v1/projects/${id}/tasks?page=1&pageSize=20`)
    return {
      projectVisible: projects.items.some((item: { id: string }) => item.id === id),
      taskStatus: taskResponse.status,
    }
  }, projectId)
  expect(memberBAccess).toEqual({ projectVisible: false, taskStatus: 404 })

  expect(pageErrors, `Browser console/page errors; HTTP errors=${failedResponses.join(' | ')}`).toEqual([])
  await memberBContext.close()
  await memberAContext.close()
  await adminContext.close()
})
