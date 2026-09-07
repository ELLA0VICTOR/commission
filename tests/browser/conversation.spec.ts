import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { defaultBrief, type Order } from '../../shared/domain.ts'

test('conversation updates the saved preview and receives a settled purchase', async ({ page }) => {
  const id = randomUUID()
  let orders: Order[] = []
  await page.addInitScript(({ id, brief }) => { if (!localStorage.getItem('commission.projects.v2')) localStorage.setItem('commission.projects.v2', JSON.stringify([{ id, brief, createdAt: new Date().toISOString() }])) }, { id, brief: defaultBrief })
  await page.route('**/api/orders', route => route.fulfill({ json: orders }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByLabel('Venue', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Open Agent', exact: true }).click()
  await page.getByLabel('Message Agent').fill('venue: The Listening Room, Accra')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByTestId('campaign-poster')).toContainText('The Listening Room, Accra')
  await expect(page.locator('.chat-receipt')).toHaveCount(0)
  // A browser-only delivered/settled provider record, never a real payment.
  const brief = { ...defaultBrief, venue: 'The Listening Room, Accra' }
  orders = [{ id: randomUUID(), projectId: id, service: 'plan', inputKey: 'fixture', status: 'delivered', settled: true, settlement: '0x' + 'a'.repeat(64), amount: '0.014823', token: 'U', createdAt: new Date().toISOString(), briefSnapshot: brief, plan: { concept: 'A quiet evening with live music.', imagePrompt: 'Architectural artwork without lettering.', narration: 'Join us at The Listening Room, Accra.', caption: 'An evening at The Listening Room, Accra.' } }]
  await expect(page.locator('.chat-receipt')).toContainText('0.014823 U')
  await expect(page.locator('.campaign-footer .money')).toHaveText('0.014823 U')
  await expect(page.getByRole('button', { name: 'Artwork, current', includeHidden: true })).toHaveAttribute('aria-current', 'step')
  await page.screenshot({ path: 'test-results/agent-conversation.png' })
  await page.reload()
  await expect(page.getByTestId('campaign-poster')).toContainText('The Listening Room, Accra')
  await page.getByRole('button', { name: 'Open Agent', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Updated venue')
})
