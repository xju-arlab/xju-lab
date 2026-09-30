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
  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)
  await page.locator('#kc-login').click()
  await page.getByRole('link', { name: '进入实验室平台' }).waitFor()
  await page.getByRole('link', { name: '进入实验室平台' }).click()
  await expect(page.getByRole('heading', { name: '总览' })).toBeVisible()
  await expect(page.getByText('API 实时数据')).toBeVisible()
}

test('OIDC API mode keeps project data scoped across users and viewports', async ({ browser }) => {
  const pageErrors: string[] = []
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const adminPage = await adminContext.newPage()
  adminPage.on('pageerror', error => pageErrors.push(error.message))

  await signIn(adminPage, admin)
  for (const width of [375, 768, 1440]) {
    await adminPage.setViewportSize({ width, height: 900 })
    await adminPage.goto('/app/dashboard')
    await expect(adminPage.getByRole('heading', { name: '总览' })).toBeVisible()
    const dimensions = await adminPage.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport)

    if (width === 375) {
      const menu = adminPage.getByRole('button', { name: '打开导航' })
      await menu.focus()
      await adminPage.keyboard.press('Enter')
      await expect(menu).toHaveAttribute('aria-expanded', 'true')
      await adminPage.getByRole('button', { name: '关闭导航' }).click()
      await expect(menu).toHaveAttribute('aria-expanded', 'false')
    }
  }

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
  await adminPage.locator('select[name="memberId"]').selectOption('00000000-0000-4000-8000-000000000102')
  const membershipForm = adminPage.locator('form').filter({ has: adminPage.locator('select[name="memberId"]') })
  await membershipForm.getByRole('button', { name: '添加' }).click()
  await expect(adminPage.getByText('项目成员已添加')).toBeVisible()

  const taskForm = adminPage.locator('form').filter({ has: adminPage.getByPlaceholder('下一步任务') })
  await taskForm.getByPlaceholder('下一步任务').fill(taskTitle)
  await taskForm.getByRole('button', { name: '添加任务' }).click()
  await expect(adminPage.getByText(taskTitle)).toBeVisible()

  const concurrentProjectReads = await adminPage.evaluate(async () => Promise.all(
    Array.from({ length: 50 }, async () => {
      const startedAt = performance.now()
      const response = await fetch('/api/v1/projects?page=1&pageSize=100')
      await response.arrayBuffer()
      return { durationMs: performance.now() - startedAt, status: response.status }
    }),
  ))
  expect(concurrentProjectReads.map(result => result.status)).toEqual(Array(50).fill(200))
  const projectReadP95 = percentile(concurrentProjectReads.map(result => result.durationMs), 0.95)

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
    dataset: '3 local identities, 1 project, 1 task',
    api: { route: 'GET /api/v1/projects?page=1&pageSize=100', concurrentRequests: 50, authenticatedSessions: 1, p95Ms: Math.round(projectReadP95) },
    dashboard: { samples: dashboardLoads.length, p95Ms: Math.round(dashboardP95) },
  })}`)
  expect(projectReadP95).toBeLessThan(500)
  expect(dashboardP95).toBeLessThan(1000)

  await adminPage.goto('/app/seats')
  await expect(adminPage.getByRole('heading', { name: '工位一览' })).toBeVisible()
  const [svgDownload] = await Promise.all([
    adminPage.waitForEvent('download'),
    adminPage.getByRole('button', { name: 'SVG' }).click(),
  ])
  expect(svgDownload.suggestedFilename()).toBe('实验室工位平面图.svg')
  const svgContents = await readFile((await svgDownload.path())!)
  expect(svgContents.toString('utf8')).toContain('<svg')
  expect(svgContents.toString('utf8')).toContain('data-seat-id')

  const [pngDownload] = await Promise.all([
    adminPage.waitForEvent('download'),
    adminPage.getByRole('button', { name: 'PNG' }).click(),
  ])
  expect(pngDownload.suggestedFilename()).toBe('实验室工位平面图.png')
  const pngContents = await readFile((await pngDownload.path())!)
  expect([...pngContents.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

  const projectId = await adminPage.evaluate(async title => {
    const response = await fetch('/api/v1/projects?page=1&pageSize=100')
    const page = await response.json()
    return page.items.find((item: { title: string }) => item.title === title)?.id as string | undefined
  }, projectTitle)
  expect(projectId).toBeTruthy()

  const memberAContext = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const memberAPage = await memberAContext.newPage()
  memberAPage.on('pageerror', error => pageErrors.push(error.message))
  await signIn(memberAPage, memberA)
  await memberAPage.getByRole('button', { name: '打开导航' }).click()
  await memberAPage.getByRole('link', { name: '项目空间' }).click()
  const sharedProject = memberAPage.getByRole('button', { name: new RegExp(projectTitle) })
  await expect(sharedProject).toBeVisible()
  await sharedProject.click()
  await expect(memberAPage.getByText(taskTitle)).toBeVisible()
  expect(await memberAPage.getByRole('link', { name: '成员管理' }).count()).toBe(0)
  const memberAAdminStatus = await memberAPage.evaluate(async () => (await fetch('/api/v1/admin/members')).status)
  expect(memberAAdminStatus).toBe(403)
  await memberAPage.reload()
  await expect(memberAPage.getByRole('button', { name: new RegExp(projectTitle) })).toBeVisible()

  const memberBContext = await browser.newContext()
  const memberBPage = await memberBContext.newPage()
  memberBPage.on('pageerror', error => pageErrors.push(error.message))
  await signIn(memberBPage, memberB)
  await memberBPage.getByRole('link', { name: '项目空间' }).click()
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

  expect(pageErrors).toEqual([])
  await memberBContext.close()
  await memberAContext.close()
  await adminContext.close()
})
