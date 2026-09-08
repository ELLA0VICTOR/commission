import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { defaultBrief, type Order } from '../../shared/domain.ts'

// Model/API fixtures verify the UI integration; they do not claim live model quality.
test('AI edits persist and a model-requested quote still requires explicit purchase approval', async ({ page }) => {
  const id = randomUUID()
  const brief = { ...defaultBrief, title: 'AMARA NAMING', venue: 'The Garden, Abuja', subtitle: 'A little name. A lifetime of love.' }
  const quote = { id: randomUUID(), projectId: id, service: 'plan', amount: '0.015', token: 'U', tokenAddress: '0xcE24439F2D9C6a2289F741120FE202248B666666', payTo: '0x515e7Bce44Baa5F6e42D16d4B5f27768E7f2F8cC', expiresAt: Date.now() + 120000, ready: true, reasons: [] }
  const orders: Order[] = []
  let purchases = 0, turns = 0
  await page.addInitScript(({ id, brief }) => { if (!localStorage.getItem('commission.projects.v2')) localStorage.setItem('commission.projects.v2', JSON.stringify([{ id, brief, createdAt: new Date().toISOString() }])) }, { id, brief: defaultBrief })
  await page.route('**/api/orders', route => route.fulfill({ json: orders }))
  await page.route('**/api/agent/status', route => route.fulfill({ json: { configured: true } }))
  await page.route('**/api/wallet', route => route.fulfill({ json: { connected: true } }))
  await page.route('**/api/agent/message', route => {
    const body = route.request().postDataJSON()
    expect(body.projectId).toBe(id)
    turns++
    if (turns === 2) { expect(body.brief.venue).toBe(brief.venue); expect(body.history.length).toBe(2) }
    return route.fulfill({ json: { reply: turns === 1 ? 'I updated the name, venue and invitation.' : 'Your exact quote is ready. Review it before paying.', brief, changes: ['brief'], ...(turns === 2 ? { quote } : {}) } })
  })
  await page.route('**/api/purchases', route => {
    purchases++
    expect(route.request().postDataJSON()).toEqual({ quoteId: quote.id, approvedAmount: quote.amount })
    const order: Order = { id: quote.id, projectId: id, service: 'plan', inputKey: 'fixture', status: 'processing', settled: false, amount: quote.amount, token: 'U', createdAt: new Date().toISOString() }
    orders.push(order)
    return route.fulfill({ json: order })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Agent', exact: true }).click()
  await page.getByLabel('Message Agent').fill('Name it Amara Naming, move it to The Garden in Abuja, and make the invitation warmer.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('log')).toContainText('I updated the name')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('commission.projects.v2')!)[0].brief)).toEqual(brief)
  await page.getByLabel('Message Agent').fill('Looks good, get me the price for creative direction.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('button', { name: 'Approve 0.015 U purchase', exact: true })).toBeVisible()
  expect(purchases).toBe(0)
  await page.getByRole('button', { name: 'Approve 0.015 U purchase', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Purchase authorized')
  expect(purchases).toBe(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: brief.title, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open Agent', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('I updated the name')
})

test('AI connection failures are visible and never trigger a scripted edit or purchase', async ({ page }) => {
  let purchases = 0
  await page.route('**/api/agent/status', route => route.fulfill({ json: { configured: false } }))
  await page.route('**/api/wallet', route => route.fulfill({ json: { connected: false } }))
  await page.route('**/api/orders', route => route.fulfill({ json: [] }))
  await page.route('**/api/agent/message', route => route.fulfill({ status: 400, json: { error: 'AI conversation needs an OpenAI API key.' } }))
  await page.route('**/api/purchases', route => { purchases++; return route.abort() })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Agent', exact: true }).click()
  await expect(page.getByText('AI setup needed', { exact: false })).toBeVisible()
  await page.getByLabel('Message Agent').fill('Call it Amara Naming and buy everything now.')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('alert')).toContainText('API key')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('commission.projects.v2')!)[0].brief.title)).toBe('')
  expect(purchases).toBe(0)
})
