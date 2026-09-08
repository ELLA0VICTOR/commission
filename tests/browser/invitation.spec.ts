import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { PNG } from 'pngjs'
import jsQR from 'jsqr'
import { defaultBrief } from '../../shared/domain.ts'

test('invitation persists, exported QR scans, and expanded poster corners fit the screen', async ({ page }) => {
  const id = randomUUID(), url = 'https://example.com/rsvp?family=commission'
  const brief = { ...defaultBrief, time: '18:00–21:00' }
  await page.addInitScript(({ id, brief }) => {
    if (!localStorage.getItem('commission.projects.v2')) localStorage.setItem('commission.projects.v2', JSON.stringify([{ id, brief, createdAt: new Date().toISOString() }]))
  }, { id, brief })
  await page.route('**/api/orders', route => route.fulfill({ json: [{ id: randomUUID(), projectId: id, service: 'image', status: 'delivered', assetUrl: '/test-art.svg', amount: '0.01', token: 'U', settled: false, createdAt: new Date().toISOString() }] }))
  await page.route('**/test-art.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="gray"/></svg>' }))
  await page.route('**/api/wallet', route => route.fulfill({ json: { connected: false } }))
  await page.route('**/api/agent/status', route => route.fulfill({ json: { configured: false } }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Invite guests', exact: true }).click()
  await page.getByLabel('RSVP or ticket link').fill(url)
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Invitation QR code' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Invite guests', exact: true }).click()
  await expect(page.getByLabel('RSVP or ticket link')).toHaveValue(url)
  const calendarDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download calendar invitation' }).click()
  expect(await readFile((await (await calendarDownload).path())!, 'utf8')).toContain('DTSTART;VALUE=DATE:20260919')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    for (const format of ['Poster 3:4', 'Story 9:16']) {
      await page.getByRole('button', { name: format }).click()
      await page.getByRole('button', { name: 'Enlarge preview' }).click()
      const corners = await page.locator('.preview-modal .poster-edge').evaluate(element => {
        const rect = element.getBoundingClientRect(), dialog = element.closest('dialog')!
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, blur: getComputedStyle(dialog, '::backdrop').backdropFilter, scroll: dialog.scrollHeight > dialog.clientHeight }
      })
      expect(corners.x).toBeGreaterThan(10); expect(corners.y).toBeGreaterThan(10)
      expect(corners.right).toBeLessThan(viewport.width - 10); expect(corners.bottom).toBeLessThan(viewport.height - 10)
      expect(corners.blur).toBe('none'); expect(corners.scroll).toBe(false)
      await page.getByRole('button', { name: 'Close dialog' }).click()
    }
  }
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const zipDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download campaign ZIP' }).click()
  const zip = unzipSync(await readFile((await (await zipDownload).path())!))
  expect(strFromU8(zip['invitation.txt'])).toContain(url)
  expect(strFromU8(zip['event.ics'])).toContain('URL:' + url)
  for (const name of ['poster.png', 'story.png']) {
    const png = PNG.sync.read(Buffer.from(zip[name]))
    expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(url)
  }
})
