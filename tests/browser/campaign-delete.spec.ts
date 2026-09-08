import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { defaultBrief } from '../../shared/domain.ts'

test('campaign deletion requires confirmation, persists, and leaves a blank workspace after the last campaign', async ({ page }) => {
  const projects = ['First event', 'Second event'].map(title => ({ id: randomUUID(), brief: { ...defaultBrief, title }, createdAt: new Date().toISOString() }))
  await page.addInitScript(projects => {
    if (!localStorage.getItem('commission.projects.v2')) localStorage.setItem('commission.projects.v2', JSON.stringify(projects))
  }, projects)
  await page.route('**/api/orders', route => route.fulfill({ json: [] }))
  await page.route('**/api/wallet', route => route.fulfill({ json: { connected: false } }))
  await page.route('**/api/agent/status', route => route.fulfill({ json: { configured: false } }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
  await page.getByRole('button', { name: 'Delete campaign', exact: true }).click()
  await page.getByRole('button', { name: 'Keep campaign' }).click()
  await expect(page.getByRole('heading', { name: 'First event', exact: true })).toBeVisible()
  for (const name of ['First event', 'Second event']) {
    await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
    await page.getByRole('button', { name: 'Delete campaign', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText(name)
    await page.getByRole('button', { name: 'Delete campaign', exact: true }).click()
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Campaigns', exact: true })).not.toContainText(name)
  }
  await expect(page.getByRole('heading', { name: 'New campaign', exact: true })).toBeVisible()
  await expect(page.getByText('No artwork yet', { exact: true })).toBeVisible()
})
