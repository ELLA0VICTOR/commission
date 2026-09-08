import type { Order } from './domain.ts'

// Expiry prevents the old authorization from settling later; it does not prove
// that it was never charged. A separate user acknowledgement is required.
export function canRetryArtwork(order: Order, orders: Order[], now = Date.now()) {
  const end = Number(order.paymentDiagnostics?.authorization?.validBefore)
  return order.service === 'image' && order.status === 'uncertain' && !order.settled &&
    !order.settlement && !order.recoverable && !order.retryOf &&
    order.paymentDiagnostics?.httpStatus === 402 && /\binvalid_transaction_state\b/.test(order.error || '') &&
    Number.isSafeInteger(end) && end > 0 && end * 1000 < now &&
    !orders.some(item => item.retryOf === order.id)
}
