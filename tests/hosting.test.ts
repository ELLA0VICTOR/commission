import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { initStore, withStore, persist, saveResponse, readResponse } from '../server/store.ts'

test('concurrent studios keep orders, saved responses and wallet directories separate', async () => {
  const root = resolve('.commission-data', 'test-isolation-' + randomUUID())
  const a = await initStore(resolve(root, 'a'), { BINANCE_BAW_DIR: resolve(root, 'a/wallet') })
  const b = await initStore(resolve(root, 'b'), { BINANCE_BAW_DIR: resolve(root, 'b/wallet') })
  await Promise.all([a, b].map((store, i) => withStore(store, async () => {
    await delay(i ? 1 : 5)
    await saveResponse({ owner: i }, 'same-id')
    await persist()
    assert.deepEqual(await readResponse('same-id'), { owner: i })
  })))
  assert.notEqual(a.walletEnv?.BINANCE_BAW_DIR, b.walletEnv?.BINANCE_BAW_DIR)
})

test('public API enforces login, studio ownership, CSRF, logout and persisted AI caps', async () => {
  const root = resolve('.commission-data', 'test-hosting-' + randomUUID())
  const origin = 'http://127.0.0.1:4359'
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(), windowsHide: true, stdio: 'ignore',
    env: { ...process.env, PORT: '4359', COMMISSION_PUBLIC: '1', COMMISSION_PUBLIC_ORIGIN: origin, COMMISSION_DATA_DIR: root,
      COMMISSION_SESSION_SECRET: randomBytes(32).toString('hex'), COMMISSION_WALLET_ENABLED: '0', COMMISSION_AI_DAILY_LIMIT: '0' },
  })
  try {
    let ready = false
    for (let i = 0; i < 60; i++) {
      ready = await fetch(origin + '/api/health').then(response => response.ok).catch(() => false)
      if (ready) break
      if (child.exitCode !== null) throw new Error('Hosted test server exited early.')
      await delay(200)
    }
    assert.ok(ready, 'hosted server started')
    async function request(path: string, cookie = '', body?: unknown, token?: string) {
      return fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', ...(token ? { 'X-Commission-Session': token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    }
    assert.equal((await request('/api/orders')).status, 401)
    const password = randomBytes(18).toString('hex')
    async function register(username: string) {
      const response = await request('/api/auth/register', '', { username, password })
      assert.equal(response.status, 200)
      assert.match(response.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/)
      return { cookie: response.headers.get('set-cookie')!.split(';')[0], id: (await response.json()).user.id as string }
    }
    const a = await register('studio_a'), b = await register('studio_b')
    const dirA = resolve(root, 'users', a.id), file = 'uploaded-' + randomUUID() + '.wav'
    await mkdir(resolve(dirA, 'assets'), { recursive: true })
    await writeFile(resolve(dirA, 'assets', file), 'private audio fixture')
    const orderId = randomUUID()
    await writeFile(resolve(dirA, 'orders.json'), JSON.stringify([{ id: orderId, status: 'delivered', projectId: randomUUID(), service: 'image', amount: '0.01', token: 'U' }]))
    const tokenA = (await (await request('/api/session', a.cookie)).json()).token
    const tokenB = (await (await request('/api/session', b.cookie)).json()).token
    assert.notEqual(tokenA, tokenB)
    assert.equal((await (await request('/api/orders', a.cookie)).json()).length, 1)
    assert.deepEqual(await (await request('/api/orders', b.cookie)).json(), [])
    assert.equal((await request('/api/assets/' + file, a.cookie)).status, 200)
    assert.equal((await request('/api/assets/' + file, b.cookie)).status, 404)
    assert.equal((await request('/api/purchases', b.cookie, { quoteId: orderId, approvedAmount: '0.01' }, tokenB)).status, 400)
    assert.equal((await request('/api/wallet/disconnect', b.cookie, {}, tokenA)).status, 403)
    const crossOrigin = await fetch(origin + '/api/auth/logout', { method: 'POST', headers: { Cookie: a.cookie, Origin: 'https://untrusted.example' } })
    assert.equal(crossOrigin.status, 403)
    assert.equal((await request('/api/agent/message', a.cookie, {}, tokenA)).status, 429)
    assert.equal((await request('/api/auth/logout', a.cookie, {})).status, 200)
    assert.equal((await request('/api/orders', a.cookie)).status, 401)
    const login = await request('/api/auth/login', '', { username: 'studio_a', password })
    assert.equal(login.status, 200)
    assert.equal((await login.json()).user.id, a.id)
    const storage = await readFile(resolve(root, 'accounts.json'), 'utf8')
    assert.ok(!storage.includes(password))
    assert.equal((await request('/api/auth/login', '', { username: 'studio_b', password: 'wrong-password-123' })).status, 401)
  } finally {
    child.kill()
    if (child.exitCode === null) await new Promise<void>(resolve => child.once('exit', () => resolve()))
  }
})
