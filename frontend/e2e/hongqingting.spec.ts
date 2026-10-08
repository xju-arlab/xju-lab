import { expect, test, type Page } from '@playwright/test'

// UI contract fixture. Authorization and durable outbox behavior are tested with real PostgreSQL separately.
async function fixture(page: Page, role = 'LAB_ADMIN', configured = true) {
  const state = { batches: [] as Record<string, unknown>[], calls: [] as { path: string; body: Record<string, unknown>; key?: string }[] }
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v1', '')
    const body = request.postData() ? request.postDataJSON() : {}
    const respond = (json: unknown, status = 200) => route.fulfill({ status, json })
    if (path === '/session') return respond({ authenticated: true, memberId: 'runner-test-admin', issuer: 'https://idp.example.test', displayName: '测试管理员', roles: [role], registrationComplete: true })
    if (path === '/members/me') return respond({ displayName: '测试管理员', realName: '测试管理员', registrationComplete: true, directions: ['算法'], studentNumber: '20269999999' })
    if (path === '/csrf') return respond({ headerName: 'X-XSRF-TOKEN', token: 'test-csrf' })
    if (path === '/lab/settings') return respond({ name: '算法与科研实验室', location: '信息楼A411', timezone: 'Asia/Shanghai', description: '', mailEnabled: false, tonerAlertEnabled: false, version: 1 })
    if (path === '/admin/printers') return respond([])
    if (!path.startsWith('/admin/hongqingting/')) return respond({ message: 'Unexpected fixture path' }, 503)
    if (path.endsWith('/configuration')) return respond({ configured, schoolNo: configured ? '10755' : null, maxDays: 90, tracks: [{ id: 'location_1_6km', label: '1.6 公里', available: true }] })
    if (request.method() === 'GET') return respond({ items: state.batches, total: state.batches.length, page: 1, pageSize: 5 })
    expect(request.headers()['x-xsrf-token']).toBe('test-csrf')
    expect(body).not.toHaveProperty('token')
    state.calls.push({ path, body, key: request.headers()['idempotency-key'] })
    if (path.endsWith('/summary')) return respond({ distanceKm: 12.3, lastRunAt: '2026-10-01T02:00:00Z', message: '累计 12.3 公里' })
    if (path.endsWith('/cancel')) {
      state.batches[0] = { ...state.batches[0], status: 'CANCELLED', cancelRequested: true, version: 2,
        runs: [{ id: 'run-test', ordinal: 0, status: 'CANCELLED', message: null }] }
      return respond(state.batches[0])
    }
    const batch = { id: 'b865c943-5513-49fd-b69c-7a9f59c1c1d6', ...body, status: 'QUEUED', version: 0, cancelRequested: false, createdAt: '2026-10-07T12:00:00Z', runs: [{ id: 'run-test', ordinal: 0, status: 'PENDING', message: null }] }
    state.batches.unshift(batch)
    return respond(batch)
  })
  return state
}

for (const width of [375, 768, 1440]) {
  test(`Hongqingting administrator page queries, persists and cancels at ${width}px`, async ({ page }) => {
    const state = await fixture(page)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/app/settings')
    if (await page.getByRole('button', { name: '打开导航' }).isVisible()) await page.getByRole('button', { name: '打开导航' }).click()
    const runnerLink = page.getByRole('link', { name: '红蜻蜓', exact: true })
    await expect(runnerLink).toBeVisible()
    const links = await page.locator('.sidebar a').allTextContents()
    expect(links.indexOf('红蜻蜓')).toBeLessThan(links.indexOf('公开主页'))
    expect(links.indexOf('公开主页')).toBeLessThan(links.indexOf('成员管理'))
    await runnerLink.focus()
    await runnerLink.press('Enter')
    await expect(page.getByRole('heading', { name: '查询跑步里程' })).toBeVisible()
    await expect(page.getByText('API Key', { exact: true })).toHaveCount(0)
    await page.getByLabel('查询学号').fill('20269999999')
    await page.getByRole('button', { name: '查询里程' }).click()
    await expect(page.getByText('12.3 公里', { exact: true })).toBeVisible()
    await page.getByLabel('上传学号').fill('20269999999')
    await page.getByLabel('上传天数').fill('1')
    await page.getByRole('button', { name: '开始上传' }).click()
    await expect(page.getByText('20269999999 · 1.6 公里 × 1 天')).toBeVisible()
    expect(state.calls.find(call => call.path.endsWith('/batches'))?.key).toMatch(/^[a-f0-9-]{36}$/)
    await page.reload()
    await expect(page.getByRole('heading', { name: '红蜻蜓', exact: true })).toBeVisible()
    await expect(page.getByText('20269999999 · 1.6 公里 × 1 天')).toBeVisible()
    await page.getByRole('button', { name: '停止任务' }).click()
    await expect(page.getByText('任务已停止。', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '停止任务' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /hongqingting|sk-key/i.test(key)))).toEqual([])
    await page.screenshot({ path: `test-results/hongqingting-${width}.png`, fullPage: true })
    expect(errors).toEqual([])
  })
}

test('Hongqingting unavailable configuration disables submits and member cannot enter administrator page', async ({ page }) => {
  await fixture(page, 'LAB_ADMIN', false)
  await page.goto('/app/hongqingting')
  await expect(page.getByText('红蜻蜓尚未接入，请由运维完成服务端配置。')).toBeVisible()
  await expect(page.getByRole('button', { name: '开始上传' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '查询里程' })).toBeDisabled()
  await page.unroute('**/api/v1/**')
  await fixture(page, 'MEMBER')
  await page.reload()
  await expect(page.getByText('当前账户无权访问红蜻蜓。')).toBeVisible()
  await expect(page.getByRole('link', { name: '红蜻蜓' })).toHaveCount(0)
})

test('Hongqingting failed queries show an error without keeping previous mileage', async ({ page }) => {
  await fixture(page)
  await page.goto('/app/hongqingting')
  await page.getByLabel('查询学号').fill('20269999999')
  await page.getByRole('button', { name: '查询里程' }).click()
  await expect(page.getByText('12.3 公里', { exact: true })).toBeVisible()
  await page.route('**/api/v1/admin/hongqingting/summary', route => route.fulfill({ status: 503, json: { message: '里程查询失败，请稍后重试' } }))
  await page.getByLabel('查询学号').fill('20268888888')
  await page.getByRole('button', { name: '查询里程' }).click()
  await expect(page.getByRole('alert')).toContainText('里程查询失败')
  await expect(page.getByText('12.3 公里', { exact: true })).toHaveCount(0)
})
