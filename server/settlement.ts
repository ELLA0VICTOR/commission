import type { Order } from '../shared/domain.ts'
import { units } from './policy.ts'
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
export function recordBodySettlement(raw: unknown, order: Order): boolean {
  const payment = object(object(raw)?.payment)
  const envelope = object(payment?.raw)
  const receipt = object(envelope?.data)
  const hash = receipt?.transaction
  if (payment?.facilitator !== 'b402' || payment.network !== 'eip155:56' ||
    envelope?.success !== true || envelope.code !== '000000' || receipt?.success !== true ||
    receipt.network !== 'eip155:56' || typeof hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(hash) ||
    payment.transaction !== hash || typeof receipt.amount !== 'string' || !/^\d+$/.test(receipt.amount) ||
    BigInt(receipt.amount) !== units(order.amount) || (order.settlement && order.settlement !== hash)) return false
  order.settlement = hash
  order.settled = true
  return true
}
