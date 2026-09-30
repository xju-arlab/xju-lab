import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

test.use({ locale: 'en-US', timezoneId: 'America/Los_Angeles' })
const confirmed = JSON.parse(readFileSync('src/features/seats/layout.confirmed.json', 'utf8'))

async function fixture(page: Page) {
  const state = { layout: structuredClone(confirmed), version: 4, conflict: false, layoutWrites: [] as Record<string, unknown>[], projects: [] as Record<string, unknown>[], meetings: [] as Record<string, unknown>[], leaveBodies: [] as string[] }
  await page.clock.setFixedTime(new Date('2030-09-30T17:20:00Z'))
  await page.addInitScript(() => localStorage.setItem('xju-lab.seat-layout.v1', '{"untrusted":"old-demo-layout"}'))
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const method = route.request().method()
    if (method === 'POST' && path === '/projects') { const data = route.request().postDataJSON(); state.projects.push({ ...data, id: `p${state.projects.length}`, leadId: 'fixture', status: 'ACTIVE', version: 1 }); await route.fulfill({ status: 201, json: state.projects.at(-1) }); return }
    if (method === 'POST' && path === '/meetings') { const data = route.request().postDataJSON(); state.meetings.push({ ...data, id: 'm1', version: 1 }); await route.fulfill({ status: 201, json: state.meetings.at(-1) }); return }
    if (method === 'POST' && path === '/leaves') { state.leaveBodies.push(route.request().postDataBuffer()?.toString() ?? ''); await route.fulfill({ status: 201, json: {} }); return }
    if (method === 'PUT' && path === '/seats/layout') {
      state.layoutWrites.push(route.request().postDataJSON())
      if (state.conflict) { await route.fulfill({ status: 409, json: { code: 'CONFLICT', message: '布局已被其他管理员修改，请取消后重新载入', requestId: 'fixture' } }); return }
      expect(route.request().headers()['if-match-version']).toBe(String(state.version))
      state.layout = route.request().postDataJSON(); state.version++
      await route.fulfill({ json: { layout: state.layout, version: state.version } }); return
    }
    const data: Record<string, unknown> = {
      '/session': { authenticated: true, memberId: 'fixture', displayName: '页面验收成员', roles: ['SUPER_ADMIN'], issuer: 'fixture', registrationComplete: true },
      '/members/me': { registrationComplete: true, directions: ['算法'] },
      '/members': { items: [{ id: 'reviewer', displayName: '验收审批人' }], total: 1 },
      '/csrf': { headerName: 'X-CSRF-TOKEN', token: 'fixture-only' },
      '/projects': { items: state.projects, total: state.projects.length }, '/meetings': { items: state.meetings, total: state.meetings.length },
      '/seats/layout': { version: state.version, layout: state.layout },
      '/seats': { items: state.layout.desks.map((desk: { id: string; kind: string }) => ({ id: desk.id, kind: desk.kind, directions: [], memberId: null, displayName: null, cohort: null, className: null, onLeaveNow: false })), total: 33 },
      '/public/snapshot': { isPublished: false, version: 0, payload: {} },
    }
    await route.fulfill({ json: data[path] ?? (path.endsWith('/members') || path.endsWith('/milestones') ? [] : { items: [], total: 0 }) })
  })
  return state
}

test('meeting and leave default to the opening day, with address and drag or click attachments', async ({ page }, testInfo) => {
  const state = await fixture(page)
  await page.goto('/app/meetings')
  await page.getByText('安排会议', { exact: true }).click()
  await expect(page.getByLabel('开始时间（北京时间）')).toHaveValue('2030年10月01日 09:00')
  await page.getByLabel('会议主题').fill('地址验收会议')
  await page.getByLabel('会议地址').fill('信息楼 A411')
  await page.getByRole('button', { name: '创建会议' }).click()
  await expect(page.getByText('会议已创建', { exact: true })).toBeVisible()
  expect(state.meetings[0]).toMatchObject({ location: '信息楼 A411', startsAt: '2030-10-01T09:00:00+08:00' })
  await expect(page.getByText('信息楼 A411', { exact: true })).toBeVisible()
  await page.goto('/app/leave')
  await expect(page.getByLabel('开始时间（北京时间）')).toHaveValue('2030年10月01日 09:00')
  await expect(page.getByLabel('结束时间（北京时间）')).toHaveValue('2030年10月01日 18:00')
  const input = page.getByLabel('选择请假附件')
  await input.setInputFiles({ name: '证明.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 fixture') })
  const transfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(['office fixture'], '说明.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); return data })
  await page.getByRole('button', { name: /拖拽文件到此处/ }).dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.getByRole('button', { name: '移除 证明.pdf' })).toBeVisible()
  await expect(page.getByRole('button', { name: '移除 说明.docx' })).toBeVisible()
  await page.getByRole('button', { name: '移除 证明.pdf' }).click()
  await input.setInputFiles({ name: 'danger.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') })
  await expect(page.getByRole('alert')).toContainText('请选择图片')
  await input.setInputFiles({ name: '图片.png', mimeType: 'image/png', buffer: Buffer.from([137,80,78,71,13,10,26,10]) })
  await page.getByLabel('审批人').click()
  await page.getByRole('option', { name: '验收审批人' }).click()
  await page.getByLabel('请假原因').fill('附件提交验收')
  await page.setViewportSize({ width: 375, height: 1000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('leave-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: '提交申请', exact: true }).click()
  await expect(page.getByText('申请已提交', { exact: true })).toBeVisible()
  expect(state.leaveBodies[0]).toContain('说明.docx')
  expect(state.leaveBodies[0]).toContain('图片.png')
  expect(state.leaveBodies[0]).toContain('2030-10-01T09:00:00+08:00')
  expect(state.leaveBodies[0]).not.toContain('证明.pdf')
  await expect(page.getByRole('button', { name: /^移除 / })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '提交申请', exact: true })).toBeEnabled()
})

test('project resource switch preserves drafts and submits only the selected platform fields', async ({ page }, testInfo) => {
  const state = await fixture(page)
  await page.goto('/app/projects')
  const mode = page.getByRole('group', { name: '项目资源类型' })
  const disclosure = page.getByText('新建项目', { exact: true })
  await expect(page.locator('.project-mode-switch')).toBeHidden()
  await expect(page.locator('.project-mode-switch button').first()).toBeDisabled()
  await expect(disclosure).toHaveJSProperty('tagName', 'SUMMARY')
  await disclosure.click()
  await expect(mode).toHaveCSS('opacity', '1')
  await expect(mode.getByRole('button', { name: 'GitHub', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('项目名称').fill('网盘资源验收')
  await page.getByLabel('项目简介').fill('切换时保留输入')
  await page.getByLabel('GitHub 链接').fill('https://github.com/example/project')
  await disclosure.focus()
  await page.keyboard.press('Space')
  await expect(page.locator('.project-mode-switch')).toHaveCSS('opacity', '0')
  await expect(page.locator('.project-mode-switch')).toBeHidden()
  await expect(disclosure).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(mode).toHaveCSS('opacity', '1')
  await expect(page.getByLabel('项目名称')).toHaveValue('网盘资源验收')
  await expect(page.getByLabel('GitHub 链接')).toHaveValue('https://github.com/example/project')
  await mode.getByRole('button', { name: '百度网盘' }).click()
  for (const [label, key] of [['作品与答辩材料','deliverables'],['素材与源码','sources'],['设计与开发文档','documents'],['作品展示视频','video']]) await page.getByLabel(label, { exact: true }).fill(`https://pan.baidu.com/s/${key}`)
  await mode.getByRole('button', { name: 'GitHub', exact: true }).click()
  await expect(page.getByLabel('GitHub 链接')).toHaveValue('https://github.com/example/project')
  await mode.getByRole('button', { name: '百度网盘' }).click()
  for (const width of [375,768,1440]) {
    await page.setViewportSize({ width, height: 1100 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: testInfo.outputPath('project-resources.png'), fullPage: true })
  await page.getByRole('button', { name: '创建项目', exact: true }).click()
  await expect(page.getByText('项目已创建', { exact: true })).toBeVisible()
  expect(state.projects[0].resourceMode).toBe('BAIDU')
  expect(Object.keys(state.projects[0].resourceLinks as object)).toEqual(['deliverables','sources','documents','video'])
  await page.getByRole('button', { name: /网盘资源验收/ }).click()
  await expect(page.getByRole('link', { name: '作品展示视频' })).toHaveAttribute('href','https://pan.baidu.com/s/video')
})

test('server layout editor supports drag, properties, undo, rotation, save and conflict recovery', async ({ page }, testInfo) => {
  const state = await fixture(page)
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto('/app/seats')
  await expect(page.getByText('工位数 31', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '放大平面图' }).click()
  await expect(page.getByRole('status').filter({ hasText: '125%' })).toBeVisible()
  await page.getByRole('button', { name: '适应画布' }).click()
  await page.getByRole('button', { name: '标定布局' }).click()
  const desk = page.locator('[data-seat-id="A01"]')
  const original = await desk.getAttribute('transform')
  const box = await desk.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 25, box!.y + box!.height / 2, { steps: 5 }); await page.mouse.up()
  await expect(desk).not.toHaveAttribute('transform', original!)
  await page.getByRole('button', { name: '撤销布局调整' }).click()
  await expect(desk).toHaveAttribute('transform', original!)
  await page.getByRole('button', { name: '重做布局调整' }).click()
  const x = page.getByRole('spinbutton', { name: '桌位 X', exact: true })
  await x.fill('330'); await x.press('Tab')
  await page.getByRole('group', { name: '实验室工位平面图', exact: true }).focus()
  await page.keyboard.press('r')
  await page.getByRole('button', { name: '工具区', exact: true }).click()
  const tool = page.getByRole('spinbutton', { name: '工具区 X', exact: true })
  await tool.fill('190'); await tool.press('Tab')
  for (const width of [375,768,1440]) {
    await page.setViewportSize({ width, height: 1100 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: testInfo.outputPath('seat-editor.png'), fullPage: true })
  await page.getByRole('button', { name: '保存调整', exact: true }).click()
  await expect(page.getByText('工位布局已保存', { exact: true })).toBeVisible()
  expect(state.layout.desks.find((item: { id: string }) => item.id === 'A01').x).toBe(330)
  expect(state.layout.room.toolX).toBe(190)
  expect(state.layout.desks.filter((item: { kind: string }) => item.kind === 'seat')).toHaveLength(31)
  await page.reload()
  await expect(desk).toHaveAttribute('transform', /translate\(330 /)
  await page.getByRole('button', { name: '标定布局' }).click()
  await desk.click()
  await x.fill('340'); await x.press('Tab')
  state.conflict = true
  await page.getByRole('button', { name: '保存调整', exact: true }).click()
  await expect(page.getByText(/布局已被其他管理员修改/)).toBeVisible()
  await expect(x).toHaveValue('340')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(desk).toHaveAttribute('transform', /translate\(330 /)
  expect(await page.evaluate(() => localStorage.getItem('xju-lab.seat-layout.v1'))).toBe('{"untrusted":"old-demo-layout"}')
})

test('homepage displays the supplied lab mark without overflow', async ({ page }, testInfo) => {
  await fixture(page); await page.goto('/')
  const mark = page.getByRole('img', { name: '算法与科研实验室 · XJU Algorithm & Research Lab' })
  await expect(mark).toBeVisible()
  await expect.poll(() => mark.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), { timeout: 30_000 }).toBe(true)
  for (const width of [375,768,1440]) {
    await page.setViewportSize({ width, height: 1100 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true })
  }
})
