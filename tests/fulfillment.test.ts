import test from 'node:test'
import assert from 'node:assert/strict'
import { fulfill, type FulfillmentDependencies } from '../server/fulfillment.ts'
import type { Order } from '../shared/domain.ts'
function order(): Order { return { id: 'fixture', projectId: 'project', service: 'image', inputKey: 'key', status: 'processing', amount: '0.05', token: 'U', createdAt: new Date().toISOString(), settled: false } }
function deps(patch: Partial<FulfillmentDependencies> = {}): FulfillmentDependencies {
  return {
    sign: async () => ({ paymentHeaderName: 'PAYMENT-SIGNATURE', paymentHeaderValue: 'fixture-proof', signatureExpiresAt: Date.now() / 1000 + 30 }),
    request: async () => new Response(JSON.stringify({ image_url: 'https://example.com/image.png' }), { status: 200 }),
    parsePlan: () => { throw new Error('Not a plan test') },
    saveAsset: async () => '/api/assets/fixture.png', saveResponse: async () => {}, persist: async () => {},
    ...patch,
  }
}
const quote = { service: 'image' as const, paymentId: 'wallet-payment', index: 2, body: { prompt: 'A blue scene' } }
test('replays the identical request with the selected one-based wallet index and stores real settlement', async () => {
  const receipt = { success: true, transaction: '0x' + 'a'.repeat(64) }
  const current = order()
  let signed = 0
  await fulfill(quote, current, deps({
    sign: async (id, index) => {
      signed++; assert.equal(id, quote.paymentId); assert.equal(index, 2)
      return { paymentHeaderName: 'PAYMENT-SIGNATURE', paymentHeaderValue: 'proof', signatureExpiresAt: Date.now() / 1000 + 30 }
    },
    request: async (service, body, signature) => {
      assert.equal(service, 'image'); assert.deepEqual(body, quote.body); assert.equal(signature, 'proof')
      return new Response('{}', { headers: { 'PAYMENT-RESPONSE': Buffer.from(JSON.stringify(receipt)).toString('base64') } })
    },
  }))
  assert.equal(signed, 1); assert.equal(current.status, 'delivered')
  assert.equal(current.settled, true); assert.equal(current.settlement, receipt.transaction)
})
test('does not sign or replay again after an ambiguous network failure', async () => {
  const current = order(); let requests = 0; let signatures = 0
  await fulfill(quote, current, deps({
    sign: async () => { signatures++; return { paymentHeaderName: 'PAYMENT-SIGNATURE', paymentHeaderValue: 'proof', signatureExpiresAt: Date.now() / 1000 + 30 } },
    request: async () => { requests++; throw new Error('Network interrupted') },
  }))
  assert.equal(requests, 1); assert.equal(signatures, 1)
  assert.equal(current.status, 'uncertain'); assert.equal(current.settled, false)
})
test('refuses expired authorizations before sending anything to the merchant', async () => {
  let requests = 0
  const current = order()
  await fulfill(quote, current, deps({
    sign: async () => ({ paymentHeaderName: 'PAYMENT-SIGNATURE', paymentHeaderValue: 'proof', signatureExpiresAt: 1 }),
    request: async () => { requests++; return new Response('{}') },
  }))
  assert.equal(requests, 0); assert.equal(current.status, 'uncertain')
})
test('delivery without a valid settlement receipt never becomes a fabricated payment confirmation', async () => {
  const current = order()
  await fulfill(quote, current, deps())
  assert.equal(current.status, 'delivered'); assert.equal(current.settled, false); assert.equal(current.settlement, undefined)
})
test('a successful charge with failed asset delivery remains visible and needs review', async () => {
  const current = order()
  const receipt = { success: true, txHash: '0x' + 'b'.repeat(64) }
  await fulfill(quote, current, deps({
    request: async () => new Response('{}', { headers: { 'PAYMENT-RESPONSE': Buffer.from(JSON.stringify(receipt)).toString('base64') } }),
    saveAsset: async () => { throw new Error('Asset unavailable') },
  }))
  assert.equal(current.status, 'uncertain'); assert.equal(current.settled, true); assert.equal(current.recoverable, true)
})
