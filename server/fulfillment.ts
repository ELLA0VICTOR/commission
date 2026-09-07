import { recordBodySettlement } from './settlement.ts'
import type { Order, Plan, Service } from '../shared/domain.ts'
export type FulfillmentQuote = { service: Service; paymentId: string; index: number; body: unknown }
type Signature = { paymentHeaderName: string; paymentHeaderValue: string; approveTxHash?: string; signatureExpiresAt: number }
export type FulfillmentDependencies = {
  sign: (paymentId: string, index: number) => Promise<Signature>;
  request: (service: Service, body: unknown, signature: string) => Promise<Response>;
  parsePlan: (raw: unknown) => Plan;
  saveAsset: (raw: unknown, service: Service, id: string) => Promise<string>;
  saveResponse: (raw: unknown, id: string) => Promise<void>;
  persist: () => Promise<void>;
}
export async function fulfill(quote: FulfillmentQuote, order: Order, deps: FulfillmentDependencies) {
  try {
    const signature = await deps.sign(quote.paymentId, quote.index)
    if (signature.paymentHeaderName !== 'PAYMENT-SIGNATURE' || signature.approveTxHash || signature.signatureExpiresAt * 1000 <= Date.now())
      throw new Error('The wallet returned an unexpected or expired authorization. Check wallet activity before retrying.')
    const response = await deps.request(quote.service, quote.body, signature.paymentHeaderValue)
    const receiptHeader = response.headers.get('payment-response')
    if (receiptHeader) {
      try {
        const receipt = JSON.parse(Buffer.from(receiptHeader, 'base64').toString('utf8')) as Record<string, unknown>
        const hash = receipt.txHash || receipt.transaction
        if (typeof hash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(hash)) order.settlement = hash
        order.settled = receipt.success === true && Boolean(order.settlement)
      } catch { /* Never invent a receipt when delivery succeeds without settlement metadata. */ }
      await deps.persist()
    }
    const raw: unknown = await response.json().catch(() => undefined)
    if (raw !== undefined) {
      await deps.saveResponse(raw, order.id)
      recordBodySettlement(raw, order)
      await deps.persist()
    }
    if (!response.ok) throw new Error('Provider returned HTTP ' + response.status + ' after authorization. ' + (order.settled ? 'Payment settled, but delivery failed.' : 'Payment may have settled; do not repeat it blindly.'))
    if (raw === undefined) throw new Error('Provider returned an unreadable response after authorization. Check settlement before retrying.')
    order.recoverable = true
    await deps.persist()
    if (quote.service === 'plan') order.plan = deps.parsePlan(raw)
    else order.assetUrl = await deps.saveAsset(raw, quote.service, order.id)
    order.status = 'delivered'
    await deps.persist()
  } catch (error) {
    order.status = 'uncertain'
    order.error = error instanceof Error ? error.message : 'Delivery could not be confirmed.'
    await deps.persist()
  }
}
