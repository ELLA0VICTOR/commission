import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { defaultBrief, type Order } from '../../shared/domain.ts'

test('artwork retry keeps direction and the old receipt and requires new-charge acknowledgement', async ({ page }) => {
  const projectId = randomUUID(), failedId = randomUUID(), quoteId = randomUUID()
  const plan = { concept: 'An intimate garden dinner.', imagePrompt: 'A quiet garden at dusk without text or logos.', narration: 'Join us for a garden dinner.', caption: 'An evening in the garden.' }
  await page.addInitScript(({ projectId, plan, brief }) => localStorage.setItem('commission.projects.v2', JSON.stringify([
    { id: projectId, plan, brief, createdAt: new Date().toISOString() },
  ])), { projectId, plan, brief: defaultBrief })
  const failed: Order = { id: failedId, projectId, service: 'image', status: 'uncertain', inputKey: 'art', amount: '0.05', token: 'U',
    createdAt: new Date().toISOString(), settled: false, error: 'B402 invalid_transaction_state',
    paymentDiagnostics: { paymentId: 'fixture', optionIndex: 1, signingStartedAt: 1, httpStatus: 402, authorization: { validBefore: '1' } } }
  const orders = [failed]; let quotes = 0, purchases = 0
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/access') return route.fulfill({ json: { hosted: false, user: null } })
    if (path === '/api/session') return route.fulfill({ json: { token: 'test-session' } })
    if (path === '/api/wallet') return route.fulfill({ json: { connected: true, address: '0x' + 'a'.repeat(40) } })
    if (path === '/api/agent/status') return route.fulfill({ json: { configured: false } })
    if (path === '/api/orders') return route.fulfill({ json: orders })
    if (path === '/api/quotes') {
      quotes++
      const body = route.request().postDataJSON()
      expect(body.retryOf).toBe(failedId); expect(body.service).toBe('image'); expect(body.plan).toEqual(plan)
      return route.fulfill({ json: { id: quoteId, projectId, service: 'image', amount: '0.05', token: 'U', tokenAddress: '0x' + 'b'.repeat(40),
        payTo: '0x' + 'c'.repeat(40), expiresAt: Date.now() + 120_000, ready: true, reasons: [], retryOf: failedId } })
    }
    if (path === '/api/purchases') {
      purchases++
      expect(route.request().postDataJSON()).toEqual({ quoteId, approvedAmount: '0.05', retryAcknowledged: true })
      const replacement: Order = { ...failed, id: quoteId, retryOf: failedId, status: 'processing', error: undefined }
      orders.push(replacement)
      return route.fulfill({ status: 202, json: replacement })
    }
    return route.fulfill({ status: 404, json: { error: 'Unexpected test request' } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await page.getByRole('button', { name: 'Request artwork retry quote' }).click()
  const approve = page.getByRole('button', { name: 'Approve 0.05 U purchase' })
  await expect(approve).toBeDisabled()
  expect(purchases).toBe(0)
  await page.getByRole('checkbox', { name: 'I checked the previous payment and understand this approves a new charge.' }).check()
  await approve.click()
  await expect(approve).not.toBeVisible()
  expect(quotes).toBe(1); expect(purchases).toBe(1)
  expect(orders[0]).toEqual(failed)
})
