import { expect, test, type Page } from '@playwright/test'

function printerFixture() {
  return {
    id: 'hp-fixture', name: '验收用惠普打印机', location: '', source: 'HP_STATUS', status: 'ONLINE', lastSeenAt: '2030-09-30T01:20:00Z',
    lastReport: { agentVersion: 'hp-status-v1', model: 'Test DeskJet', deviceState: 'READY', stateLabel: '空闲', paperLabel: '未报告缺纸',
      paperReportsDiffer: false, devicePaperLabel: '未报告缺纸', queuePaperLabel: '缺纸', suppliesApproximate: true,
      supplies: [{ name: '彩色墨盒', levelPercent: 27 as number | null, low: false }, { name: '黑色墨盒', levelPercent: 63 as number | null, low: false }] },
  }
}
async function fixture(page: Page, printer: ReturnType<typeof printerFixture>) {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const data: Record<string, unknown> = {
      '/session': { authenticated: true, memberId: 'fixture', displayName: '打印机验收成员', roles: ['SUPER_ADMIN'], issuer: 'fixture', registrationComplete: true },
      '/members/me': { registrationComplete: true, directions: ['算法'] },
      '/overview': { activeProjects: 0, openTasks: 0, upcomingMeetings: 0, pendingLeaves: 0 },
      '/printers': [printer], '/admin/printers': [printer],
      '/lab/settings': { name: '验收实验室', location: '验收位置', timezone: 'Asia/Shanghai', description: '', mailEnabled: false, tonerAlertEnabled: false, version: 1 },
    }
    await route.fulfill({ json: data[path] ?? { items: [], total: 0 } })
  })
}

test('printer card shows individual estimated cartridges and fits all viewports', async ({ page }, testInfo) => {
  await fixture(page, printerFixture())
  await page.goto('/app/dashboard')
  const panel = page.getByRole('region', { name: '打印机状态', exact: true })
  await expect(panel.getByRole('heading', { name: '验收用惠普打印机' })).toBeVisible()
  await expect(panel.getByText('Test DeskJet')).toBeVisible()
  await expect(panel.getByText('在线', { exact: true })).toBeVisible()
  await expect(panel.getByText('纸张 · 未报告缺纸')).toBeVisible()
  await expect(panel.getByRole('meter', { name: '彩色墨盒' })).toHaveAttribute('aria-valuenow', '27')
  await expect(panel.getByRole('meter', { name: '黑色墨盒' })).toHaveAttribute('aria-valuetext', '约 63%')
  await expect(panel.getByText('最近读取 · 2030年09月30日 09:20')).toBeVisible()
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await panel.scrollIntoViewIfNeeded()
    const box = await panel.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await panel.screenshot({ path: testInfo.outputPath(`printer-${width}.png`) })
  }
})

test('unknown ink is not zero and stale or unreachable status never says online', async ({ page }) => {
  const printer = printerFixture()
  printer.lastReport.supplies[0].levelPercent = null
  printer.lastReport.paperReportsDiffer = true
  await fixture(page, printer)
  await page.goto('/app/dashboard')
  const panel = page.getByRole('region', { name: '打印机状态', exact: true })
  await expect(panel.getByText('余量未知', { exact: true })).toBeVisible()
  await expect(panel.getByRole('meter', { name: '彩色墨盒' })).toHaveCount(0)
  await expect(panel.getByText('设备：未报告缺纸；队列：缺纸')).toBeVisible()
  for (const [status, label] of [['STALE', '数据已过期'], ['UNAVAILABLE', '状态暂不可用'], ['OFFLINE', '离线']]) {
    printer.status = status
    await panel.getByRole('button', { name: '刷新', exact: true }).click()
    await expect(panel.getByText(label, { exact: true })).toBeVisible()
    await expect(panel.getByText('在线', { exact: true })).toHaveCount(0)
    await expect(panel.getByText('空闲', { exact: true })).toHaveCount(0)
    await expect(panel.getByText(/以下为最近一次读取的信息/)).toBeVisible()
    await expect(panel.getByText('约 63%', { exact: true })).toBeVisible()
  }
})

test('HTTP printer management offers device controls without Agent credentials', async ({ page }) => {
  await fixture(page, printerFixture())
  await page.goto('/app/settings')
  await expect(page.getByRole('heading', { name: '打印机状态接入' })).toBeVisible()
  await expect(page.getByText(/状态接口同步 · 在线/)).toBeVisible()
  await expect(page.getByRole('button', { name: '停用设备' })).toBeVisible()
  await expect(page.getByRole('button', { name: '轮换 Agent 凭据' })).toHaveCount(0)
})
