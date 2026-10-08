import { expect, test, type Page } from '@playwright/test'

test('server live queries are opt-in, stop when switched off, and reset on revisits', async ({ page }, testInfo) => {
  const { state } = await fixtures(page)
  state.delay = 0
  let metricReads = 0
  const hardware = { kind: 'GPU', cpuModel: '测试处理器', cpuCores: 32, memoryBytes: 137438953472, diskBytes: 1099511627776, os: 'Linux', gpuDetection: 'NVIDIA_SMI', gpus: Array(4).fill('NVIDIA H100 80GB HBM3, 81559') }
  await page.route('**/api/v1/monitor/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/assets')) {
      await route.fulfill({ json: [
        { id: 'gpu', name: '科研计算服务器', version: 1, enabled: true, monitoringSource: 'SSH', gpuSupported: true, hardware },
        { id: 'mixed', name: '异构测试服务器', version: 1, enabled: false, monitoringSource: 'SSH', gpuSupported: true, hardware: { ...hardware, gpus: ['NVIDIA H100 80GB HBM3, 81559', 'NVIDIA H100 80GB HBM3, 81559', 'NVIDIA L4, 23034'] } },
      ] }); return
    }
    if (path.endsWith('/metrics')) {
      metricReads++
      await route.fulfill({ json: { state: 'SSH_CONNECTED', metrics: [{ metric: 'CPU', unit: '%', value: 12.5, status: 'AVAILABLE' }] } }); return
    }
    throw new Error(`Unexpected monitor request: ${path}`)
  })
  await page.clock.install()
  for (const width of [375, 768, 1440]) {
    const before = metricReads
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/app/servers')
    const toggle = page.getByRole('switch', { name: '实时查询' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText('NVIDIA H100 80GB HBM3 ✕ 4', { exact: true })).toBeVisible()
    await expect(page.getByText('NVIDIA H100 80GB HBM3 ✕ 2；NVIDIA L4', { exact: true })).toBeVisible()
    await expect(page.getByText(/SSH 自动采集/)).toHaveCount(0)
    await page.clock.fastForward(35_000)
    expect(metricReads).toBe(before)
    await expect(page.getByText('CPU 使用率', { exact: true })).toHaveCount(0)
    const switchBox = (await toggle.boundingBox())!
    const addBox = (await page.getByRole('button', { name: '添加服务器' }).boundingBox())!
    expect(switchBox.x + switchBox.width).toBeLessThanOrEqual(addBox.x)
    expect(Math.abs(switchBox.y + switchBox.height / 2 - addBox.y - addBox.height / 2)).toBeLessThan(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`server-toggle-off-${width}.png`), animations: 'disabled' })
    await toggle.focus()
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('CPU 使用率', { exact: true })).toBeVisible()
    await expect.poll(() => metricReads).toBe(before + 1)
    await page.screenshot({ path: testInfo.outputPath(`server-toggle-on-${width}.png`), animations: 'disabled' })
    await page.clock.fastForward(31_000)
    await expect.poll(() => metricReads).toBe(before + 2)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await page.clock.fastForward(61_000)
    expect(metricReads).toBe(before + 2)
    await expect(page.getByText('CPU 使用率', { exact: true })).toHaveCount(0)
    await toggle.click()
    await expect(page.getByText('CPU 使用率', { exact: true })).toBeVisible()
    await expect.poll(() => metricReads).toBe(before + 3)
    await page.reload()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await page.clock.fastForward(31_000)
    expect(metricReads).toBe(before + 3)
  }
})

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

for (const width of [375, 768, 1440]) {
  test(`new members can open registration from Lab login at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const { state } = await fixtures(page)
    state.authenticated = false
    let destination: URL | undefined
    let finishNavigation!: () => void
    const navigationGate = new Promise<void>(resolve => { finishNavigation = resolve })
    let oidcRequests = 0
    page.on('request', request => { if (new URL(request.url()).pathname === '/oauth2/authorization/lab') oidcRequests++ })
    await page.route(url => url.origin === 'https://auth.icthub.top' && url.pathname === '/if/flow/icthub-public-registration/', async route => {
      destination = new URL(route.request().url())
      await navigationGate
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>注册算法与科研实验室</h1>' })
    })
    await page.goto('/app/dashboard')
    await expect(page.getByText('正在验证实验室登录状态…')).toBeVisible()
    const register = page.getByRole('link', { name: '立即注册', exact: true })
    await expect(register).toBeVisible()
    await expect(register).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await register.focus()
    await page.keyboard.press('Enter')
    try {
      // Locator action prechecks can wait for this deliberately paused navigation.
      // Read the still-active document together, then release the response gate.
      await expect.poll(() => page.evaluate(() => {
        const status = document.querySelector('.api-auth-registration [role="status"]')
        return {
          redirecting: status?.textContent,
          redirectingVisible: status?.checkVisibility(),
          loginDisabled: document.querySelector('.api-login-button')?.getAttribute('aria-disabled'),
        }
      })).toEqual({ redirecting: '正在前往注册…', redirectingVisible: true, loginDisabled: 'true' })
    } finally { finishNavigation() }
    await expect(page.getByRole('heading', { name: '注册算法与科研实验室' })).toBeVisible()
    expect(destination?.searchParams.get('next')).toBe('/application/launch/xju-lab/')
    expect(oidcRequests).toBe(0)
  })
}

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

test('login rejection explains the reason and never renders arbitrary callback text', async ({ page }) => {
  const { state } = await fixtures(page)
  state.authenticated = false
  state.delay = 0
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [code, message] of Object.entries({
      email_unverified: '请先完成邮箱验证，再重新登录实验室。',
      email_domain: '当前邮箱不在实验室允许的注册范围内，请联系管理员确认。',
      member_inactive: '你的实验室账号已停用，请联系管理员。',
      provisioning_failed: '暂时无法完成实验室登录，请稍后重试。如仍失败，请联系管理员。',
      login_expired: '登录请求已过期或未能完成，请重新登录。',
    })) {
      await page.goto(`/app/dashboard?authError=${code}`)
      await expect(page.getByText(message, { exact: true })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveText(message)
      await expect(page.getByRole('button', { name: '重新检查', exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: /^统一身份登录/ })).toBeVisible()
      await expect(page.getByRole('link', { name: '立即注册', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    }
  }
  await page.goto('/app/dashboard?authError=%3Cscript%3Euntrusted%3C/script%3E')
  await expect(page.getByText('已有 OJ 账号可直接登录，无需重新注册。', { exact: true })).toBeVisible()
  await expect(page.getByText('untrusted')).toHaveCount(0)
})
