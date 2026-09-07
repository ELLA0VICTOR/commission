import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { defaultBrief, type Plan, type Order } from '../../shared/domain.ts'

test('uploaded narration persists, plays, exports audio, and becomes stale after script edits without paying', async ({ page, request }) => {
  const id = randomUUID()
  const plan: Plan = { concept: 'An evening of independent music.', imagePrompt: 'A quiet architectural rooftop without lettering.', narration: 'Join us for an evening of music on the rooftop.', caption: 'An evening of music at The Terrace.' }
  const before = await (await request.get('/api/orders')).json()
  await page.addInitScript(({ id, brief, plan }) => {
    if (!localStorage.getItem('commission.projects.v1')) localStorage.setItem('commission.projects.v1', JSON.stringify([{ id, brief, plan, planKey: JSON.stringify({ ...brief, budget: undefined }), createdAt: new Date().toISOString() }]))
  }, { id, brief: defaultBrief, plan })
  const records: Order[] = [{ id: randomUUID(), projectId: id, service: 'image', status: 'delivered', amount: '0.05', token: 'U', inputKey: 'fixture', settled: false, createdAt: new Date().toISOString(), assetUrl: '/api/assets/narration-fixture.png' }, { id: randomUUID(), projectId: id, service: 'voice', status: 'uncertain', amount: '0.01', token: 'U', inputKey: 'fixture', settled: false, createdAt: new Date().toISOString(), error: 'The speech provider is out of credits.' }]
  await page.route('**/api/orders', route => route.fulfill({ json: records }))
  await page.route('**/api/wallet', route => route.fulfill({ json: { connected: false } }))
  await page.route('**/api/assets/narration-fixture.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNuoAAAAASUVORK5CYII=', 'base64') }))
  let payments = 0
  await page.route(/\/api\/(quotes|purchases)$/, route => { payments++; return route.abort() })
  const sampleRate = 16000
  const wav = Buffer.alloc(44 + sampleRate * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(sampleRate * 2, 40)
  for (let i = 0; i < sampleRate; i++) wav.writeInt16LE(Math.round(Math.sin(i * 440 * Math.PI * 2 / sampleRate) * 1200), 44 + i * 2)
  await page.goto('/')
  await page.getByRole('button', { name: 'Ready, completed' }).click()
  await page.getByRole('button', { name: 'Optional voiceover', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Request paid voiceover' })).toBeDisabled()
  await page.getByLabel('Upload narration', { exact: true }).setInputFiles({ name: 'invalid.wav', mimeType: 'audio/wav', buffer: Buffer.from('not audio') })
  await expect(page.getByRole('alert')).toContainText('cannot be played')
  await page.getByLabel('Upload narration', { exact: true }).setInputFiles({ name: 'test-recording.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.getByText('Uploaded narration', { exact: true })).toBeVisible()
  const player = page.getByLabel('Uploaded narration preview')
  await expect.poll(() => player.evaluate((node: HTMLAudioElement) => node.readyState)).toBeGreaterThanOrEqual(1)
  expect(await player.evaluate((node: HTMLAudioElement) => node.duration)).toBeCloseTo(1, 1)
  await player.evaluate((node: HTMLAudioElement) => node.play())
  await expect.poll(() => player.evaluate((node: HTMLAudioElement) => node.currentTime)).toBeGreaterThan(0)
  await page.reload()
  await page.getByRole('button', { name: 'Ready, completed' }).click()
  await expect(page.getByText('Narration source: Uploaded narration', { exact: true })).toBeVisible()
  const zipped = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download campaign ZIP' }).click()
  const zip = unzipSync(await readFile((await (await zipped).path())!))
  expect(Buffer.from(zip['voiceover-uploaded.wav'])).toEqual(wav)
  expect(JSON.parse(strFromU8(zip['campaign.json'])).narration.source).toBe('Uploaded narration')
  expect(strFromU8(zip['READ-ME.txt'])).toContain('Uploaded narration')
  const video = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export narrated promo/ }).click()
  const bytes = await readFile((await (await video).path())!)
  expect(bytes.includes(Buffer.from('A_OPUS'))).toBe(true)
  expect(bytes.includes(Buffer.from('V_VP9')) || bytes.includes(Buffer.from('V_VP8'))).toBe(true)
  await expect(page.getByRole('button', { name: /Export narrated promo/ })).toBeEnabled()
  await page.getByRole('button', { name: 'Review copy', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Creative direction', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Voiceover script', exact: true }).fill('A revised invitation with different event details.')
  await page.getByRole('button', { name: 'Copy checked', exact: true }).click()
  await page.getByRole('button', { name: 'Ready, completed' }).click()
  await page.getByRole('button', { name: 'Optional voiceover', exact: true }).click()
  await expect(page.getByText('The script changed.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Remove uploaded narration' }).click()
  await expect(page.getByLabel('Uploaded narration preview')).toHaveCount(0)
  expect(payments).toBe(0)
  expect(await (await request.get('/api/orders')).json()).toEqual(before)
})

test('upload endpoint requires a local session and rejects non-audio', async ({ request }) => {
  expect((await request.post('/api/narration/upload', { headers: { 'Content-Type': 'audio/wav' }, data: Buffer.from('invalid') })).status()).toBe(403)
  const { token } = await (await request.get('/api/session')).json()
  const response = await request.post('/api/narration/upload', { headers: { 'Content-Type': 'audio/wav', 'X-Commission-Session': token }, data: Buffer.from('<html>not audio</html>') })
  expect(response.status()).toBe(400)
  expect((await response.json()).error).toContain('not a supported MP3 or WAV')
})
