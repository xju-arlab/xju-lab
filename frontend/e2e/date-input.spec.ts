import { expect, test, type Page } from '@playwright/test'

test.use({ locale: 'en-US', timezoneId: 'America/Los_Angeles' })

async function meetingsFixture(page: Page) {
  const posted: Record<string, unknown>[] = []
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    if (route.request().method() === 'POST' && path === '/meetings') {
      posted.push(route.request().postDataJSON()); await route.fulfill({ json: {} }); return
    }
    const data: Record<string, unknown> = {
      '/session': { authenticated: true, memberId: 'fixture', displayName: '日期验收成员', roles: ['SUPER_ADMIN'], issuer: 'fixture', registrationComplete: true },
      '/members/me': { displayName: '日期验收成员', registrationComplete: true, directions: ['算法'] },
      '/members': { items: [], total: 0 },
      '/meetings': { items: [{ id: 'meeting', title: '日期格式验收会议', startsAt: '2030-09-30T16:30:00Z', version: 0 }], total: 1 },
      '/meetings/meeting/minutes': { meetingId: 'meeting', version: 0, body: '' },
      '/meetings/meeting/actions': [{ id: 'task', title: '日历日期保持不偏移', dueDate: '2030-10-01', status: 'OPEN' }],
      '/csrf': { headerName: 'X-CSRF-TOKEN', token: 'fixture-only' },
    }
    await route.fulfill({ json: data[path] ?? { items: [], total: 0 } })
  })
  await page.goto('/app/meetings')
  await expect(page.getByRole('heading', { name: '会议记录' })).toBeVisible()
  await page.getByText('安排会议', { exact: true }).click()
  return posted
}

test('Chinese dates preserve Beijing time, reject invalid input and reset after submission', async ({ page }) => {
  const posted = await meetingsFixture(page)
  await expect(page.getByText(/会议时间使用实验室业务时区/)).toHaveCount(0)
  await expect(page.getByText('2030年10月01日 00:30', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /日期格式验收会议/ }).click()
  await expect(page.getByText('未分配 · 2030年10月01日', { exact: true })).toBeVisible()
  const startsAt = page.getByLabel('开始时间（北京时间）')
  await expect(startsAt).toHaveAttribute('placeholder', '年/月/日 时:分')
  await expect(page.locator('input[type="date"],input[type="datetime-local"]')).toHaveCount(0)
  await page.getByLabel('会议主题').fill('中文日期提交')
  await page.getByRole('button', { name: '创建会议' }).click()
  expect(posted).toHaveLength(0)
  await startsAt.fill('2030年02月30日 09:00')
  await page.getByRole('button', { name: '创建会议' }).click()
  await expect(page.getByRole('alert')).toContainText('请输入有效日期和时间')
  expect(posted).toHaveLength(0)
  await startsAt.fill('2030-05-20T09:00')
  await startsAt.press('Tab')
  await expect(startsAt).toHaveValue('2030年05月20日 09:00')
  await page.getByRole('button', { name: '创建会议' }).click()
  await expect(page.getByText('会议已创建', { exact: true })).toBeVisible()
  expect(posted[0]).toMatchObject({ startsAt: '2030-05-20T09:00:00+08:00' })
  await expect(startsAt).toHaveValue('')
  await expect(page.locator('input[name="startsAt"]')).toHaveValue('')
  const due = page.getByLabel('截止日期')
  await due.fill('2028年02月29日')
  await due.press('Tab')
  await expect(page.locator('input[name="dueDate"]')).toHaveValue('2028-02-29')
  await due.fill('2027年02月29日')
  expect(await due.evaluate(element => (element as HTMLInputElement).checkValidity())).toBe(false)
})

test('Chinese calendar supports keyboard, leap days, clearing and narrow viewports', async ({ page }, testInfo) => {
  await meetingsFixture(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const startsAt = page.getByLabel('开始时间（北京时间）')
  const trigger = page.getByRole('button', { name: '打开日历', exact: true })
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await startsAt.fill('2028-02-28T23:45')
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '选择日期与时间', exact: true })
    const last = dialog.getByRole('button', { name: '2028年02月28日', exact: true })
    await expect(last).toBeFocused()
    await last.press('ArrowRight')
    const leap = dialog.getByRole('button', { name: '2028年02月29日', exact: true })
    await expect(leap).toBeFocused()
    await leap.press('Enter')
    await dialog.getByLabel('小时', { exact: true }).fill('22')
    await dialog.getByLabel('分钟', { exact: true }).fill('30')
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`chinese-calendar-${width}.png`), animations: 'disabled' })
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(startsAt).toHaveValue('2028年02月29日 22:30')
    await expect(trigger).toBeFocused()
    await trigger.click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    await trigger.click()
    await dialog.getByRole('button', { name: '清空', exact: true }).click()
    await expect(startsAt).toHaveValue('')
    await page.screenshot({ path: testInfo.outputPath(`chinese-date-field-${width}.png`), animations: 'disabled' })
  }
  expect(errors).toEqual([])
})
