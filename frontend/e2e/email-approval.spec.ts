import { expect, test } from '@playwright/test'

for (const width of [375, 768, 1440]) {
  test(`mail opens without login or automatic approval at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const decisions: unknown[] = []
    let contexts = 0
    const preview = { applicationId: 'mail-application', memberId: 'member', memberName: '申请成员', startsAt: '2030-10-01T01:00:00Z', endsAt: '2030-10-01T09:00:00Z', reason: '请假审批页面验收', status: 'PENDING', version: 1, attachments: [{ id: 'image-file', filename: '证明.png', byteSize: 68 }, { id: 'pdf-file', filename: '说明.pdf', byteSize: 100 }] }
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/attachments/mail-application/image-file')) { await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFfoAAAAASUVORK5CYII=', 'base64') }); return }
      if (path.endsWith('/csrf')) { await route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'fixture' } }); return }
      if (path.endsWith('/email-action/context')) { contexts++; await route.fulfill({ status: 204 }); return }
      if (path.endsWith('/email-action')) {
        if (route.request().method() === 'POST') { decisions.push(route.request().postDataJSON()); await route.fulfill({ json: { ...preview, status: 'APPROVED' } }); return }
        await route.fulfill({ json: preview }); return
      }
      throw new Error(`Unexpected API request: ${path}`)
    })
    await page.goto(`/app/leave/email-action#token=${'a'.repeat(43)}`)
    await expect(page.getByText(preview.reason)).toBeVisible()
    expect(page.url()).not.toContain('token')
    expect(contexts).toBe(1)
    expect(decisions).toHaveLength(0)
    await page.reload()
    await expect(page.getByRole('button', { name: '确认批准' })).toBeVisible()
    expect(decisions).toHaveLength(0)
    await page.getByRole('button', { name: '查看图片 证明.png' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('img', { name: '证明.png' })).toHaveJSProperty('naturalWidth', 1)
    await expect(dialog.getByRole('link', { name: '下载原图' })).toHaveAttribute('href', /image-file$/)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('link', { name: /说明.pdf/ })).toHaveAttribute('href', /pdf-file$/)
    await expect(page.locator('.email-approval-card')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: testInfo.outputPath(`mail-approval-${width}.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('radio', { name: '驳回' }).check()
    await page.getByRole('button', { name: '确认驳回' }).click()
    expect(decisions).toHaveLength(0)
    await page.getByRole('radio', { name: '批准', exact: true }).check()
    await page.getByRole('button', { name: '确认批准' }).press('Enter')
    await expect(page.getByRole('heading', { name: '申请已批准' })).toBeVisible()
    expect(decisions).toEqual([{ applicationId: 'mail-application', version: 1, decision: 'APPROVED', reason: '' }])
  })
}
