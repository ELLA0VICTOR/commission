import { recordBodySettlement } from './settlement.ts'
import { settlementFailure } from './provider-error.ts'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Order } from '../shared/domain.ts'

export type StudioStore = { dataDir: string; assetDir: string; orders: Order[]; writes: Promise<void>; walletEnv?: Record<string, string> }
const context = new AsyncLocalStorage<StudioStore>()
export function currentStore() {
  const store = context.getStore()
  if (!store) throw new Error('Workspace context is missing.')
  return store
}
export function withStore<T>(store: StudioStore, work: () => T) { return context.run(store, work) }
export function assetDirectory() { return currentStore().assetDir }
export async function initStore(dataDir = resolve('.commission-data'), walletEnv?: Record<string, string>) {
  const store: StudioStore = { dataDir, assetDir: resolve(dataDir, 'assets'), orders: [], writes: Promise.resolve(), walletEnv }
  await withStore(store, async () => {
  const { assetDir, orders } = store
  const ordersPath = resolve(dataDir, 'orders.json')
  await mkdir(assetDir, { recursive: true })
  try { orders.push(...JSON.parse(await readFile(ordersPath, 'utf8'))) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  for (const order of orders) if (order.status === 'processing') {
    order.status = 'uncertain'
    order.error = 'The server restarted during this purchase. Check the wallet transaction history before making another purchase.'
  }
  // Restore receipts already saved in provider bodies, without calling or paying the provider.
  for (const order of orders) {
    try {
      const raw = await readResponse(order.id)
      if (!order.settled) recordBodySettlement(raw, order)
      if (order.status === 'uncertain' && !order.settled) order.error = settlementFailure(raw) || order.error
      if (order.service === 'voice' && order.status === 'uncertain' && raw && typeof raw === 'object' && 'message' in raw && typeof raw.message === 'string' &&
        /TTS error 403/i.test(raw.message) && /used all available credits|reached its monthly spending limit/i.test(raw.message))
        order.error = 'The Xona speech provider is out of credits or has reached its spending limit. ' + (order.settled ? 'Payment settled, but no audio was delivered. ' : 'Payment may have settled. ') + 'Do not retry until the provider restores service.'
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  await persist()
  })
  return store
}
export function persist() {
  const store = currentStore()
  const ordersPath = resolve(store.dataDir, 'orders.json')
  const snapshot = JSON.stringify(store.orders, null, 2)
  store.writes = store.writes.then(async () => {
    await writeFile(ordersPath + '.tmp', snapshot, { mode: 0o600 })
    await rename(ordersPath + '.tmp', ordersPath)
  })
  return store.writes
}

export async function saveResponse(raw: unknown, id: string) {
  await writeFile(resolve(currentStore().dataDir, id + '.response.json'), JSON.stringify(raw), { mode: 0o600 })
}
export async function readResponse(id: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(currentStore().dataDir, id + '.response.json'), 'utf8'))
}
