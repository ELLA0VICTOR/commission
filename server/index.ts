import express from 'express'
import { fulfill } from './fulfillment.ts'
import { randomUUID, randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { z } from 'zod'
import { briefSchema, planSchema, type Order, type Quote, type Brief } from '../shared/domain.ts'
import { assertBudget, decimal, endpoints, fingerprint, MERCHANT, requestBody, samePaymentAccept, units, U_TOKEN, validateAccept } from './policy.ts'
import { baw } from './wallet.ts'
import { assetDir, initStore, orders, persist, saveResponse, readResponse } from './store.ts'
import { getRequirements, merchantRequest, parsePlan, saveAsset } from './provider.ts'

await initStore()
const app = express()
const sessionToken = randomBytes(32).toString('hex')
const port = 4317
const allowedHosts = new Set(['127.0.0.1:4317', 'localhost:4317', '127.0.0.1:5173', 'localhost:5173'])
app.use((req, res, next) => {
  if (!allowedHosts.has(req.headers.host || '')) { res.status(403).json({ error: 'Local access only.' }); return }
  const origin = req.headers.origin
  if (origin && !['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4317', 'http://localhost:4317'].includes(origin)) {
    res.status(403).json({ error: 'Origin not allowed.' }); return
  }
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-commission-session'] !== sessionToken) {
    res.status(403).json({ error: 'Reload Commission to renew your local session.' }); return
  }
  next()
})
app.use(express.json({ limit: '20kb' }))
app.use('/api/assets', express.static(assetDir, { dotfiles: 'deny' }))
app.get('/api/session', (_req, res) => res.json({ token: sessionToken }))
app.get('/api/health', (_req, res) => res.json({ ok: true, mode: 'local', wallet: 'Binance Agentic Wallet', payments: 'B402 / BNB Chain' }))
app.get('/api/orders', (_req, res) => res.json(orders))

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
  brief: briefSchema, plan: planSchema.optional(),
})
type InternalQuote = Quote & { paymentId: string; index: number; body: unknown; inputKey: string; budget: string; brief: Brief }
const quotes = new Map<string, InternalQuote>()
type WalletOption = {
  index: number; status: string; reasons?: string[]; tokenAddress: string; payTo: string;
  amount: string; tokenSymbol: string; binanceChainId: string; scheme: string;
  assetTransferMethod: string; needApproveFirst: boolean; originalAccept: Record<string, unknown>;
}
function publicQuote(quote: InternalQuote): Quote {
  const { id, projectId, service, amount, token, tokenAddress, payTo, expiresAt, ready, reasons } = quote
  return { id, projectId, service, amount, token, tokenAddress, payTo, expiresAt, ready, reasons }
}
app.post('/api/quotes', async (req, res) => {
  const input = purchaseSchema.parse(req.body)
  if (orders.some(order => order.projectId === input.projectId && (order.status === 'processing' || order.status === 'uncertain')))
    throw new Error('This campaign has a pending or unresolved purchase. Check its receipt before starting another.')
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
    paymentId: preview.paymentId, index: option.index, body, inputKey, budget: input.brief.budget, brief: input.brief,
  }
  quotes.set(quote.id, quote)
  res.json(publicQuote(quote))
})

app.post('/api/purchases', async (req, res) => {
  const { quoteId, approvedAmount } = z.object({ quoteId: z.string().uuid(), approvedAmount: z.string() }).parse(req.body)
  const existing = orders.find(order => order.id === quoteId)
  if (existing) { res.json(existing); return }
  const quote = quotes.get(quoteId)
  if (!quote || quote.expiresAt <= Date.now()) throw new Error('This quote expired. Request a fresh quote before approving.')
  if (!quote.ready || quote.amount !== approvedAmount) throw new Error('This exact payment has not been approved or is not ready.')
  if (orders.some(order => order.projectId === quote.projectId && order.status !== 'delivered'))
    throw new Error('An earlier purchase needs attention. No new payment was signed.')
  if (orders.some(order => order.projectId === quote.projectId && order.service === quote.service && order.inputKey === quote.inputKey))
    throw new Error('This exact production request already has a receipt. Reuse it instead of paying again.')
  assertBudget(quote.budget, orders.filter(order => order.projectId === quote.projectId).map(order => order.amount), quote.amount)
  const order: Order = {
    id: quote.id, projectId: quote.projectId, service: quote.service, inputKey: quote.inputKey,
    status: 'processing', amount: quote.amount, token: quote.token, createdAt: new Date().toISOString(), settled: false,
    briefSnapshot: quote.brief, sourceText: quote.service === 'voice' ? (quote.body as { text: string }).text : undefined,
  }
  // Reserve and persist before signing. Duplicate clicks and restarted servers cannot sign twice.
  orders.push(order)
  await persist()
  quotes.delete(quoteId)
  void fulfill(quote, order, {
    sign: (paymentId, index) => baw(['x402-payment', 'sign', '--paymentId', paymentId, '--selectedIndex', String(index)]),
    request: (service, body, signature) => merchantRequest(endpoints[service], body, signature),
    parsePlan, saveAsset, saveResponse, persist,
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
app.use(express.static(resolve('dist')))
app.get('/{*path}', (req, res) => {
  if (req.path.startsWith('/api/')) { res.status(404).json({ error: 'Not found' }); return }
  res.sendFile(resolve('dist/index.html'))
})
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof z.ZodError ? 'Some fields are invalid. Check the brief and try again.' :
    error instanceof Error ? error.message : 'The request could not be completed.'
  res.status(400).json({ error: message })
})
app.listen(port, '127.0.0.1', () => console.log('Commission local service: http://127.0.0.1:' + port))
