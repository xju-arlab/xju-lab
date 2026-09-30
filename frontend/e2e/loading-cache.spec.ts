import { expect, test, type Page } from '@playwright/test'

async function fixtures(page: Page) {
  const counts = new Map<string, number>()
  const state = { authenticated: true, delay: 500, name: '缓存验收成员', failOverview: false }
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v1', '')
    counts.set(path, (counts.get(path) ?? 0) + 1)
    if (request.method() !== 'GET') {
      if (path === '/members/me') state.name = '已更新成员'
      await route.fulfill({ json: {} }); return
    }
    if (path === '/session' || path === '/overview') await new Promise(resolve => setTimeout(resolve, state.delay))
    if ((path === '/session' && !state.authenticated) || (path === '/overview' && state.failOverview)) {
      await route.fulfill({ status: state.failOverview ? 503 : 401, json: { code: 'FIXTURE', message: state.failOverview ? '暂时不可用' : '请登录' } }); return
    }
    const profile = { id: 'test-member', displayName: state.name, realName: state.name, studentNumber: '20260001', className: '计算机24-3', grade: 2024, directions: ['算法'], registrationComplete: true, version: 1 }
    const bodies: Record<string, unknown> = {
      '/session': { authenticated: true, memberId: 'test-member', displayName: state.name, roles: ['SUPER_ADMIN'], issuer: 'fixture', registrationComplete: true },
      '/members/me': profile,
      '/csrf': { headerName: 'X-CSRF-TOKEN', token: 'test-only' },
      '/overview': { activeProjects: 2, openTasks: 3, upcomingMeetings: 0, pendingLeaves: 0, assignedSeat: null },
      '/public/snapshot': { isPublished: false, version: 0, payload: {}, publishedAt: null },
      '/printers': [], '/monitor/assets': [], '/assessment/terms': [], '/admin/members': [],
    }
    await route.fulfill({ json: bodies[path] ?? { items: [], total: 0, page: 1, pageSize: 50 } })
  })
  return { counts, state }
}

test('home checks the session before entering and cached revisits skip duplicate reads', async ({ page }) => {
  const { counts } = await fixtures(page)
  await page.goto('/')
  await page.getByRole('link', { name: '进入实验室平台' }).click()
  await expect(page.getByText('正在确认登录状态…')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: /^统一身份登录/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible()
  await expect(page.getByText('正在读取服务端数据…').first()).toBeVisible()
  await expect(page.locator('.api-stat-grid')).toBeVisible()
  const first = counts.get('/overview')
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '项目空间' }).click()
  await expect(page.getByRole('heading', { name: '项目空间', exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '总览' }).click()
  await expect(page.locator('.api-stat-grid')).toBeVisible()
  expect(counts.get('/overview')).toBe(first)
  expect(counts.get('/session')).toBe(1)
  await page.locator('aside').getByRole('link', { name: '缓存验收成员' }).click()
  await page.getByRole('button', { name: '保存资料' }).click()
  await expect(page.getByText('个人资料已保存')).toBeVisible()
  await expect(page.locator('aside').getByRole('link', { name: '已更新成员' })).toBeVisible()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '总览' }).click()
  await expect(page.locator('.api-stat-grid')).toBeVisible()
  expect(counts.get('/overview')).toBe((first ?? 0) + 1)
})

test('direct login waits for session resolution and the OIDC button signals navigation', async ({ page }) => {
  const { state } = await fixtures(page)
  state.authenticated = false
  await page.route('**/oauth2/authorization/lab', async route => {
    await new Promise(resolve => setTimeout(resolve, 900))
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>测试身份服务</h1>' })
  })
  await page.goto('/app/assessment')
  await expect(page.getByText('正在验证实验室登录状态…')).toBeVisible()
  await expect(page.getByRole('link', { name: /^统一身份登录/ })).toBeVisible()
  await page.getByRole('link', { name: /^统一身份登录/ }).click({ noWaitAfter: true })
  await expect(page.getByText('正在前往统一身份认证…')).toBeVisible()
  await expect(page.getByRole('heading', { name: '测试身份服务' })).toBeVisible()
})

test('failed queries show retry and reduced motion removes decorative animation', async ({ page }) => {
  const { state } = await fixtures(page)
  state.failOverview = true
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/app/dashboard')
  const loader = page.getByText('正在验证实验室登录状态…')
  await expect(loader).toBeVisible()
  expect(await page.locator('.api-loading-spinner').evaluate(el => parseFloat(getComputedStyle(el).animationDuration))).toBeLessThan(0.01)
  await expect(page.getByText('暂时不可用')).toBeVisible()
  await expect(page.locator('.api-stat-grid')).toHaveCount(0)
  state.failOverview = false
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.locator('.api-stat-grid')).toBeVisible()
})
