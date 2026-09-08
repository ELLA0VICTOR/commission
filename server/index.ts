import './agent-model.ts'
import express from 'express'
import { createHmac } from 'node:crypto'
import { resolve } from 'node:path'
import { z } from 'zod'
import { createAccounts } from './accounts.ts'
import { createUsageLimit } from './usage.ts'
import { initStore, withStore, type StudioStore } from './store.ts'
import { createStudioRouter } from './studio.ts'

const hosted = process.env.COMMISSION_PUBLIC === '1'
const port = Number(process.env.PORT || 4317)
const root = resolve(process.env.COMMISSION_DATA_DIR || '.commission-data')
const publicOrigin = process.env.COMMISSION_PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || ''
const secret = process.env.COMMISSION_SESSION_SECRET || ''
if (hosted && (!publicOrigin || secret.length < 32)) throw new Error('Public mode requires COMMISSION_PUBLIC_ORIGIN and a stable COMMISSION_SESSION_SECRET of at least 32 characters.')
if (hosted && new URL(publicOrigin).protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(new URL(publicOrigin).hostname)) throw new Error('Public hosting requires HTTPS.')
// The CLI's OS keyring uses a global service/account name. Public hosting must
// use the official per-directory encrypted-file fallback, never a shared keyring.
if (hosted && process.env.COMMISSION_WALLET_ENABLED !== '0') {
  const keyringAvailable = await import('@github/keytar').then(async module => {
    await module.default.getPassword('baw', 'agentSessionId'); return true
  }).catch(() => false)
  if (keyringAvailable) throw new Error('Public wallet hosting requires a headless environment without a shared OS keyring. Use the supplied Docker image.')
}
const app = express()
if (hosted) app.set('trust proxy', 1)
const localOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5173', 'http://localhost:5173']
const origins = new Set(hosted ? [new URL(publicOrigin).origin] : localOrigins)
const allowedHosts = new Set([...origins].map(origin => new URL(origin).host))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store')
  if (req.path === '/api/health' && req.method === 'GET') { res.json({ ok: true, mode: hosted ? 'hosted' : 'local' }); return }
  if (!allowedHosts.has(req.headers.host || '')) { res.status(403).json({ error: 'Host not allowed.' }); return }
  const origin = req.headers.origin
  if ((origin && !origins.has(origin)) || (hosted && !['GET', 'HEAD'].includes(req.method) && !origin)) {
    res.status(403).json({ error: 'Origin not allowed.' }); return
  }
  next()
})
app.use(express.json({ limit: '64kb' }))
const accounts = hosted ? await createAccounts(root, new URL(publicOrigin).protocol === 'https:') : undefined
const consumeAI = hosted ? await createUsageLimit(root) : undefined
const writeLimits = new Map<string, { count: number; expires: number }>()
const studios = new Map<string, Promise<{ store: StudioStore; router: express.Router }>>()
function studio(id: string) {
  let pending = studios.get(id)
  if (!pending) {
    const directory = hosted ? resolve(root, 'users', id) : root
    const walletEnv = hosted ? {
      BINANCE_BAW_DIR: resolve(directory, 'wallet'),
      BINANCE_INSTANCE_ID: createHmac('sha256', secret).update(id).digest('hex'),
    } : undefined
    pending = initStore(directory, walletEnv).then(store => ({ store, router: withStore(store, createStudioRouter) }))
    studios.set(id, pending)
    void pending.catch(() => studios.delete(id))
  }
  return pending
}
if (!hosted) await studio('local')
app.get('/api/access', (req, res) => {
  const user = accounts?.identify(req)
  res.json({ hosted, user: user ? { id: user.id, username: user.username } : null })
})
if (accounts) {
  app.post('/api/auth/register', (req, res) => accounts.enter(req, res, true))
  app.post('/api/auth/login', (req, res) => accounts.enter(req, res, false))
  app.post('/api/auth/logout', (req, res) => accounts.logout(req, res))
}
app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/')) { next(); return }
  const user = accounts?.identify(req)
  if (hosted && !user) { res.status(401).json({ error: 'Sign in to your studio to continue.' }); return }
  if (user && req.method === 'POST') {
    for (const [id, limit] of writeLimits) if (limit.expires < Date.now()) writeLimits.delete(id)
    const limit = writeLimits.get(user.id) || { count: 0, expires: Date.now() + 15 * 60_000 }
    limit.count++; writeLimits.set(user.id, limit)
    if (limit.count > 60) { res.status(429).json({ error: 'Too many requests. Please pause and try again later.' }); return }
  }
  if (consumeAI && user && req.method === 'POST' && req.path === '/api/agent/message') {
    try { await consumeAI(user.id) } catch (error) { res.status(429).json({ error: (error as Error).message }); return }
  }
  const { store, router } = await studio(user?.id || 'local')
  withStore(store, () => router(req, res, next))
})
app.use(express.static(resolve('dist')))
app.get('/{*path}', (req, res) => {
  if (req.path.startsWith('/api/')) { res.status(404).json({ error: 'Not found' }); return }
  res.sendFile(resolve('dist/index.html'))
})
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error && typeof error === 'object' && 'status' in error && error.status === 404) { res.status(404).json({ error: 'File not found in this studio.' }); return }
  const message = error instanceof z.ZodError ? 'Some fields are invalid. Check the brief and try again.' :
    error && typeof error === 'object' && 'code' in error ? 'The service could not complete this operation. Please try later.' :
    error instanceof Error ? error.message : 'The request could not be completed.'
  res.status(400).json({ error: message })
})
app.listen(port, hosted ? '0.0.0.0' : '127.0.0.1', () => console.log(`Commission ${hosted ? 'hosted' : 'local'} service listening on port ${port}`))
