import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Request, Response } from 'express'
import { z } from 'zod'

const scrypt = promisify(scryptCallback)
export type Account = { id: string; username: string; salt: string; hash: string }
const credentials = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/), password: z.string().min(12).max(128) })
const cookieName = 'commission_session'
const age = 7 * 24 * 60 * 60 * 1000
export async function createAccounts(root: string, secure: boolean) {
  await mkdir(root, { recursive: true })
  const path = resolve(root, 'accounts.json')
  const accounts: Account[] = await readFile(path, 'utf8').then(raw => JSON.parse(raw) as Account[]).catch(error => { if (error.code === 'ENOENT') return []; throw error })
  const sessions = new Map<string, { id: string; expires: number }>()
  const attempts = new Map<string, { count: number; expires: number }>()
  let writes = Promise.resolve()
  const digest = (value: string) => createHash('sha256').update(value).digest('hex')
  const cookie = (value: string, maxAge: number) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
  function sessionKey(req: Request) { return digest(req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '') }
  function identify(req: Request) {
    const key = sessionKey(req), session = sessions.get(key)
    if (!session || session.expires < Date.now()) { sessions.delete(key); return undefined }
    return accounts.find(account => account.id === session.id)
  }
  function throttle(req: Request) {
    for (const [key, value] of attempts) if (value.expires < Date.now()) attempts.delete(key)
    const key = req.ip || 'unknown'
    const entry = attempts.get(key) || { count: 0, expires: Date.now() + 15 * 60_000 }
    entry.count++; attempts.set(key, entry)
    return entry.count <= 10
  }
  async function enter(req: Request, res: Response, register: boolean) {
    if (!throttle(req)) { res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' }); return }
    const parsed = credentials.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Use a username of 3–32 letters, numbers, underscores or hyphens, and a password of 12–128 characters.' }); return }
    const { username, password } = parsed.data
    let account = accounts.find(item => item.username === username)
    const salt = account?.salt || randomBytes(16).toString('hex')
    const hash = await scrypt(password, salt, 64) as Buffer
    if (register) {
      if (accounts.some(item => item.username === username)) { res.status(409).json({ error: 'That username is unavailable.' }); return }
      if (accounts.length >= Number(process.env.COMMISSION_MAX_ACCOUNTS || 100)) { res.status(429).json({ error: 'New studios are temporarily full. Please try later.' }); return }
      account = { id: randomUUID(), username, salt, hash: hash.toString('hex') }
      accounts.push(account)
      const snapshot = JSON.stringify(accounts)
      writes = writes.then(async () => { await writeFile(path + '.tmp', snapshot, { mode: 0o600 }); await rename(path + '.tmp', path) })
      await writes
    } else if (!account || !timingSafeEqual(hash, Buffer.from(account.hash, 'hex'))) {
      res.status(401).json({ error: 'Username or password is incorrect.' }); return
    }
    for (const [key, value] of sessions) if (value.expires < Date.now() || value.id === account.id) sessions.delete(key)
    const token = randomBytes(32).toString('hex')
    sessions.set(digest(token), { id: account.id, expires: Date.now() + age })
    res.setHeader('Set-Cookie', cookie(token, age / 1000))
    res.json({ user: { id: account.id, username: account.username } })
  }
  return { identify, enter, logout(req: Request, res: Response) { sessions.delete(sessionKey(req)); res.setHeader('Set-Cookie', cookie('', 0)); res.json({ ok: true }) } }
}
