import { expect, test, type Page } from '@playwright/test'

const admin = { username: 'local-admin', password: 'local-admin-change-me' }
const memberA = { username: 'local-member-a', password: 'local-member-a-change-me' }
const memberB = { username: 'local-member-b', password: 'local-member-b-change-me' }

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
