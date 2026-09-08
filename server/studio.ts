import { agentRequestSchema } from '../shared/agent.ts'
import { runAgent } from './agent.ts'
import { agentStatus } from './agent-model.ts'
import { saveUploadedAudio } from './audio-upload.ts'
import express from 'express'
import { fulfill } from './fulfillment.ts'
import { waitForAuthorization } from './authorization-window.ts'
import { randomUUID, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { briefSchema, planSchema, type Order, type Quote, type Brief } from '../shared/domain.ts'
import { assertBudget, assertPurchaseState, decimal, endpoints, fingerprint, MERCHANT, requestBody, samePaymentAccept, units, U_TOKEN, validateAccept } from './policy.ts'
import { baw } from './wallet.ts'
import { currentStore, persist, saveResponse, readResponse } from './store.ts'
import { getRequirements, merchantRequest, parsePlan, saveAsset } from './provider.ts'

export function createStudioRouter() {
const app = express.Router()
const { orders, assetDir } = currentStore()
const sessionToken = randomBytes(32).toString('hex')
app.use((req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-commission-session'] !== sessionToken) {
    res.status(403).json({ error: 'Reload Commission to renew your session.' }); return
  }
  next()
})
app.get('/api/session', (_req, res) => res.json({ token: sessionToken }))
app.use('/api/assets', express.static(assetDir, { dotfiles: 'deny', fallthrough: false }))
app.get('/api/orders', (_req, res) => res.json(orders))
// Uploads are local assets, never purchase records, and require the same local session.
app.post('/api/narration/upload', express.raw({ type: ['audio/mpeg', 'audio/wav'], limit: '10mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw new Error('Choose an MP3 or WAV recording.')
  res.json(await saveUploadedAudio(req.body, req.headers['content-type']?.split(';')[0] || ''))
})

app.get('/api/wallet', async (_req, res) => {
  const status = await baw<{ status: string }>(['wallet', 'status'])
  if (status.status !== 'CONNECTED') { res.json({ connected: false }); return }
  const data = await baw<{ addresses: { binanceChainId: string; address: string }[] }>(['wallet', 'address'])
  res.json({ connected: true, address: data.addresses.find(item => item.binanceChainId === '56')?.address })
})
type Pairing = { status: 'waiting' | 'connected' | 'failed'; urlForWeb?: string; pairingCode?: string; expireAt?: number | string; error?: string }
let pairing: Pairing | undefined
let startingPairing: Promise<Pairing> | undefined
app.get('/api/wallet/pairing', (_req, res) => res.json(pairing || { status: 'idle' }))
async function beginPairing(): Promise<Pairing> {
  const result = await baw<{ status?: string; urlForWeb: string; pairingCode: string; qrCodeId: string; expireAt: number | string }>(['auth', 'signin'])
  if (result.status === 'ALREADY_CONNECTED') return { status: 'connected' }
  const url = new URL(result.urlForWeb)
  if (url.protocol !== 'https:' || !(url.hostname === 'binance.com' || url.hostname.endsWith('.binance.com')))
    throw new Error('Binance returned an unexpected pairing URL. Connect with the official wallet CLI instead.')
  const current: Pairing = { status: 'waiting', urlForWeb: result.urlForWeb, pairingCode: result.pairingCode, expireAt: result.expireAt }
  pairing = current
  void baw<{ status: string }>(['auth', 'verify', '--qrCodeId', result.qrCodeId], 330_000)
    .then(async result => {
      const status = result.status === 'SUCCESS' ? await baw<{ status: string }>(['wallet', 'status']) : undefined
      current.status = status?.status === 'CONNECTED' ? 'connected' : 'failed'
      if (current.status === 'failed') current.error = 'The local wallet has not confirmed this connection. Start a new pairing.'
    })
    .catch(() => { current.status = 'failed'; current.error = 'Pairing expired or was declined. Start a new connection.' })
  return current
}
app.post('/api/wallet/connect', async (_req, res) => {
  if (pairing?.status === 'waiting') { res.json(pairing); return }
  startingPairing ??= beginPairing().finally(() => { startingPairing = undefined })
  res.json(await startingPairing)
})
app.post('/api/wallet/disconnect', async (_req, res) => {
  if (orders.some(order => order.status === 'processing')) throw new Error('Wait for the current purchase to finish before disconnecting.')
  await baw(['auth', 'signout'])
  pairing = undefined
  res.json({ ok: true })
})

const purchaseSchema = z.object({
  projectId: z.string().uuid(), service: z.enum(['plan', 'image', 'voice']),
  brief: briefSchema, plan: planSchema.optional(), retryOf: z.string().uuid().optional(),
})
type InternalQuote = Quote & { paymentId: string; index: number; body: unknown; inputKey: string; budget: string; brief: Brief; retryOf?: string }
const quotes = new Map<string, InternalQuote>()
type WalletOption = {
  index: number; status: string; reasons?: string[]; tokenAddress: string; payTo: string;
  amount: string; tokenSymbol: string; binanceChainId: string; scheme: string;
  assetTransferMethod: string; needApproveFirst: boolean; originalAccept: Record<string, unknown>;
}
function publicQuote(quote: InternalQuote): Quote {
  const { id, projectId, service, amount, token, tokenAddress, payTo, expiresAt, ready, reasons, retryOf } = quote
  return { id, projectId, service, amount, token, tokenAddress, payTo, expiresAt, ready, reasons, retryOf }
}
async function prepareQuote(input: z.infer<typeof purchaseSchema>) {
  assertPurchaseState(orders, input.projectId, input.service, input.retryOf)
  const body = requestBody(input.service, input.brief, input.plan)
  const inputKey = fingerprint(body)
  if (orders.some(order => order.projectId === input.projectId && order.service === input.service && order.inputKey === inputKey && order.status === 'delivered'))
    throw new Error('This exact service has already been delivered. Reuse it from the campaign receipts.')
  const requirements = await getRequirements(await merchantRequest(endpoints[input.service], body))
  const accepts = requirements.accepts as Record<string, unknown>[]
  const eligible = accepts.filter(validateAccept)
  if (!eligible.length) throw new Error('No supported exact U payment on BNB Chain. No signature was requested.')
  // Pass the whole, unchanged challenge; never repair or manufacture a provider quote.
  const preview = await baw<{ paymentId: string; options: WalletOption[] }>([
    'x402-payment', 'preview', '--paymentRequirements', Buffer.from(JSON.stringify(requirements)).toString('base64'),
  ])
  const option = preview.options.find(item =>
    validateAccept(item.originalAccept) && item.tokenAddress?.toLowerCase() === U_TOKEN.toLowerCase() &&
    item.payTo?.toLowerCase() === MERCHANT.toLowerCase() && item.binanceChainId === '56' &&
    item.scheme === 'exact' && item.assetTransferMethod === 'eip3009' && item.needApproveFirst === false &&
    eligible.some(accept => samePaymentAccept(accept, item.originalAccept)) &&
    units(item.amount) === BigInt(item.originalAccept.amount as string),
  )
  if (!option) throw new Error('The wallet could not validate a supported payment option. No payment was signed.')
  assertBudget(input.brief.budget, orders.filter(order => order.projectId === input.projectId).map(order => order.amount), option.amount)
  for (const [id, quote] of quotes) if (quote.expiresAt < Date.now()) quotes.delete(id)
  const quote: InternalQuote = {
    id: randomUUID(), projectId: input.projectId, service: input.service, amount: decimal(units(option.amount)),
    token: 'U', tokenAddress: U_TOKEN, payTo: option.payTo, expiresAt: Date.now() + 120_000,
    ready: option.status === 'READY_TO_SIGN', reasons: option.reasons || [],
    paymentId: preview.paymentId, index: option.index, body, inputKey, budget: input.brief.budget, brief: input.brief, retryOf: input.retryOf,
  }
  quotes.set(quote.id, quote)
  return publicQuote(quote)
}
app.post('/api/quotes', async (req, res) => { res.json(await prepareQuote(purchaseSchema.parse(req.body))) })

app.get('/api/agent/status', (_req, res) => res.json(agentStatus()))
const agentRuns = new Set<string>()
app.post('/api/agent/message', async (req, res) => {
  const input = agentRequestSchema.parse(req.body)
  if (agentRuns.has(input.projectId) || agentRuns.size >= 2) { res.status(429).json({ error: 'The agent is still working. Wait for its reply before sending another message.' }); return }
  agentRuns.add(input.projectId)
  try {
    res.json(await runAgent(input, orders, { quote: (service, brief, plan) => prepareQuote({ projectId: input.projectId, service, brief, plan }) }))
  } finally { agentRuns.delete(input.projectId) }
})

app.post('/api/purchases', async (req, res) => {
  const { quoteId, approvedAmount, retryAcknowledged } = z.object({ quoteId: z.string().uuid(), approvedAmount: z.string(), retryAcknowledged: z.boolean().optional() }).parse(req.body)
  const existing = orders.find(order => order.id === quoteId)
  if (existing) { res.json(existing); return }
  const quote = quotes.get(quoteId)
  if (!quote || quote.expiresAt <= Date.now()) throw new Error('This quote expired. Request a fresh quote before approving.')
  if (!quote.ready || quote.amount !== approvedAmount) throw new Error('This exact payment has not been approved or is not ready.')
  if (quote.retryOf && quote.service === 'image' && retryAcknowledged !== true)
    throw new Error('Check the previous payment and acknowledge the new charge before approving this artwork retry.')
  assertPurchaseState(orders, quote.projectId, quote.service, quote.retryOf)
  if (orders.some(order => order.projectId === quote.projectId && order.service === quote.service && order.inputKey === quote.inputKey && order.id !== quote.retryOf))
    throw new Error('This exact production request already has a receipt. Reuse it instead of paying again.')
  assertBudget(quote.budget, orders.filter(order => order.projectId === quote.projectId).map(order => order.amount), quote.amount)
  const order: Order = {
    id: quote.id, projectId: quote.projectId, service: quote.service, inputKey: quote.inputKey,
    status: 'processing', amount: quote.amount, token: quote.token, createdAt: new Date().toISOString(), settled: false,
    retryOf: quote.retryOf, briefSnapshot: quote.brief, sourceText: quote.service === 'voice' ? (quote.body as { text: string }).text : undefined,
  }
  // Reserve and persist before signing. Duplicate clicks and restarted servers cannot sign twice.
  orders.push(order)
  await persist()
  quotes.delete(quoteId)
  void fulfill(quote, order, {
    sign: (paymentId, index) => baw(['x402-payment', 'sign', '--paymentId', paymentId, '--selectedIndex', String(index)]),
    request: (service, body, signature) => merchantRequest(endpoints[service], body, signature),
    parsePlan, saveAsset, saveResponse, persist, waitForAuthorization,
  }).catch(() => console.error('Could not persist purchase status. Check the local data directory before restarting.'))
  res.status(202).json(order)
})
app.post('/api/orders/:id/recover', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id)
  const order = orders.find(item => item.id === id)
  if (!order || !order.recoverable || order.status !== 'uncertain') throw new Error('No saved provider response is available for this delivery.')
  const raw = await readResponse(order.id)
  // This route can only recover an existing response. It never calls the wallet or pays the provider.
  if (order.service === 'plan') order.plan = parsePlan(raw)
  else order.assetUrl = await saveAsset(raw, order.service, order.id)
  order.status = 'delivered'; order.error = undefined
  await persist()
  res.json(order)
})

return app
}
