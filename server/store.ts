import { recordBodySettlement } from './settlement.ts'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Order } from '../shared/domain.ts'

export const dataDir = resolve('.commission-data')
export const assetDir = resolve(dataDir, 'assets')
const ordersPath = resolve(dataDir, 'orders.json')
export const orders: Order[] = []
let writes = Promise.resolve()
export async function initStore() {
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
      if (order.service === 'voice' && order.status === 'uncertain' && raw && typeof raw === 'object' && 'message' in raw && typeof raw.message === 'string' &&
        /TTS error 403/i.test(raw.message) && /used all available credits|reached its monthly spending limit/i.test(raw.message))
        order.error = 'The Xona speech provider is out of credits or has reached its spending limit. ' + (order.settled ? 'Payment settled, but no audio was delivered. ' : 'Payment may have settled. ') + 'Do not retry until the provider restores service.'
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  await persist()
}
export function persist() {
  const snapshot = JSON.stringify(orders, null, 2)
  writes = writes.then(async () => {
    await writeFile(ordersPath + '.tmp', snapshot, { mode: 0o600 })
    await rename(ordersPath + '.tmp', ordersPath)
  })
  return writes
}

export async function saveResponse(raw: unknown, id: string) {
  await writeFile(resolve(dataDir, id + '.response.json'), JSON.stringify(raw), { mode: 0o600 })
}
export async function readResponse(id: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(dataDir, id + '.response.json'), 'utf8'))
}
