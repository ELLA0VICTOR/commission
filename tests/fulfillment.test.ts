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

function bodyPayment(amount = '50000000000000000') {
  const transaction = '0x' + 'c'.repeat(64)
  return { facilitator: 'b402', network: 'eip155:56', transaction,
    raw: { code: '000000', success: true, data: { success: true, network: 'eip155:56', transaction, amount } } }
}
test('recognizes actual Xona body receipts without a payment response header', async () => {
  const current = order()
  await fulfill(quote, current, deps({ request: async () => new Response(JSON.stringify({ image_url: 'https://example.com/image.png', payment: bodyPayment() })) }))
  assert.equal(current.status, 'delivered'); assert.equal(current.settled, true)
  assert.equal(current.settlement, '0x' + 'c'.repeat(64))
})
test('does not attribute mismatched amount, network or failed body receipts to an order', async () => {
  const valid = bodyPayment()
  for (const payment of [bodyPayment('1'), { ...valid, network: 'eip155:1' }, { ...valid, raw: { ...valid.raw, success: false } }, { ...valid, transaction: '0x' + 'd'.repeat(64) }]) {
    const current = order()
    await fulfill(quote, current, deps({ request: async () => new Response(JSON.stringify({ payment })) }))
    assert.equal(current.settled, false)
  }
})
test('preserves failed provider JSON and payment evidence without enabling a recovery or retry charge', async () => {
  const current = order(); let saved: unknown; let calls = 0
  const body = { error: 'Upstream generation failed', payment: bodyPayment() }
  await fulfill(quote, current, deps({
    request: async () => { calls++; return new Response(JSON.stringify(body), { status: 500 }) },
    saveResponse: async raw => { saved = raw },
    saveAsset: async () => { throw new Error('Must not download failed delivery') },
  }))
  assert.equal(calls, 1); assert.deepEqual(saved, body)
  assert.equal(current.status, 'uncertain'); assert.equal(current.settled, true)
  assert.equal(current.recoverable, undefined); assert.match(current.error!, /Payment settled, but delivery failed/)
})

test('explains a provider credit failure without exposing provider account identifiers', async () => {
  const current = order()
  await fulfill({ ...quote, service: 'voice' }, current, deps({ request: async () => new Response(JSON.stringify({ message: 'TTS error 403: Your team private-team has either used all available credits or reached its monthly spending limit.', payment: bodyPayment() }), { status: 500 }) }))
  assert.equal(current.status, 'uncertain'); assert.equal(current.settled, true)
  assert.match(current.error!, /speech provider is out of credits/)
  assert.doesNotMatch(current.error!, /private-team/)
})
