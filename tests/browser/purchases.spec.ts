import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { randomUUID } from 'node:crypto'
import type { Brief, Order, Plan, Quote } from '../../shared/domain.ts'
// Browser-only fixtures: these tests never invoke Binance signing or write real purchase records.
test('payment approval is explicit; changed facts require copy review before narration', async ({ page }) => {
  const orders: Order[] = []
  let purchases = 0
  let quotedBrief: Brief
  let projectId = ''
  const plan: Plan = {
    concept: 'An understated rooftop listening session with blue architectural artwork.',
    imagePrompt: 'A blue rooftop at dusk, quiet architecture, no text, no logos.',
    narration: 'Join After Hours at The Terrace in Lagos on September nineteenth.',
    caption: 'After Hours. September 19 at The Terrace, Lagos. Reserve your spot.',
  }
  const quote: Quote = {
    id: randomUUID(), projectId: '', service: 'plan', amount: '0.014823', token: 'U',
    tokenAddress: '0xcE24439F2D9C6a2289F741120FE202248B666666',
    payTo: '0x515e7Bce44Baa5F6e42D16d4B5f27768E7f2F8cC', expiresAt: Date.now() + 120_000, ready: true, reasons: [],
  }
  await page.route('**/api/wallet', route => route.fulfill({ json: { connected: true, address: '0x' + '1'.repeat(40) } }))
  await page.route('**/api/orders', route => route.fulfill({ json: orders }))
  await page.route('**/api/quotes', route => {
    const input = route.request().postDataJSON() as { brief: Brief; projectId: string }
    quotedBrief = input.brief; projectId = input.projectId
    return route.fulfill({ json: { ...quote, projectId } })
  })
  await page.route('**/api/purchases', route => {
    purchases++
    expect(route.request().postDataJSON()).toEqual({ quoteId: quote.id, approvedAmount: quote.amount })
    const order: Order = {
      id: quote.id, projectId, service: 'plan', inputKey: 'test-only', status: 'delivered',
      amount: quote.amount, token: 'U', createdAt: new Date().toISOString(), settled: false,
      briefSnapshot: quotedBrief, plan,
    }
    orders.push(order)
    return route.fulfill({ json: order })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Wallet connected', exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Open Agent', exact: true }).click()
  await page.getByRole('button', { name: 'Direction', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText(quote.tokenAddress, { exact: true })).toBeVisible()
  expect(purchases).toBe(0)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Approve 0.014823 U purchase', exact: true }).click()
  await expect(page.getByText('delivered. Settlement not yet confirmed.', { exact: false })).toBeVisible()
  await expect(page.locator('.chat-receipt')).toHaveCount(0)
  await page.getByRole('button', { name: 'Review copy', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Voiceover script', exact: true })).toHaveValue(plan.narration)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
  expect(purchases).toBe(1)
  await page.getByLabel('Venue', { exact: true }).fill('The Listening Room')
  await page.getByRole('button', { name: 'Save brief', exact: true }).click()
  await page.getByRole('button', { name: 'Open Agent', exact: true }).click()
  await page.getByRole('button', { name: 'Voiceover', exact: true }).click()
  await page.getByRole('button', { name: 'Request paid voiceover', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Your brief changed')
  expect(purchases).toBe(1)
  await page.getByRole('button', { name: 'Review copy', exact: true }).click()
  await page.getByRole('textbox', { name: 'Voiceover script', exact: true }).fill('Join After Hours at The Listening Room on September nineteenth.')
  await page.getByRole('button', { name: 'Copy checked', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copy checked', exact: true })).not.toBeVisible()
})
test('unfinished drafts survive a refresh', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
  await page.getByLabel('Event name', { exact: true }).fill('')
  await page.getByLabel('Venue', { exact: true }).fill('Work in progress venue')
  await page.reload()
  await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
  await expect(page.getByLabel('Event name', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Venue', { exact: true })).toHaveValue('Work in progress venue')
})

test('narrated video contains both a video track and an Opus audio track', async ({ page }) => {
  const { defaultBrief } = await import('../../shared/domain.ts')
  const id = randomUUID()
  const plan: Plan = { concept: 'Test campaign direction.', imagePrompt: 'A blue abstract image with no text.', narration: 'A test invitation for the event.', caption: 'A test event invitation.' }
  await page.addInitScript(({ id, brief, plan }) => {
    localStorage.setItem('commission.projects.v2', JSON.stringify([{
      id, brief, plan, planKey: JSON.stringify({ ...brief, budget: undefined }), createdAt: new Date().toISOString(),
    }]))
  }, { id, brief: defaultBrief, plan })
  const voice: Order = { id: randomUUID(), projectId: id, service: 'voice', inputKey: 'test-only',
    status: 'delivered', amount: '0.01', token: 'U', createdAt: new Date().toISOString(),
    settled: false, assetUrl: '/api/assets/test-voice.wav', sourceText: plan.narration }
  await page.route('**/api/orders', route => route.fulfill({ json: [voice] }))
  // One second of generated test tone. It is a fixture, not a provider voiceover.
  const sampleRate = 16000
  const wav = Buffer.alloc(44 + sampleRate * 2)
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36)
  wav.writeUInt32LE(sampleRate * 2, 40)
  for (let index = 0; index < sampleRate; index++) wav.writeInt16LE(Math.round(Math.sin(index * 440 * Math.PI * 2 / sampleRate) * 1200), 44 + index * 2)
  await page.route('**/api/assets/test-voice.wav', route => route.fulfill({ contentType: 'audio/wav', body: wav }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Export narrated promo ? WebM', exact: true })).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export narrated promo ? WebM', exact: true }).click()
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile((await (await downloaded).path())!)
  expect(bytes.includes(Buffer.from('A_OPUS'))).toBe(true)
  expect(bytes.includes(Buffer.from('V_VP9')) || bytes.includes(Buffer.from('V_VP8'))).toBe(true)
})
