import test from 'node:test'
import assert from 'node:assert/strict'
import { waitForAuthorization } from '../server/authorization-window.ts'

const validAfter = 1788880501
const expires = 1788880621
function diagnostic() {
  return { paymentId: 'fixture', optionIndex: 1, signingStartedAt: 1788880500494,
    accepted: { network: 'eip155:56' }, authorization: { validAfter: String(validAfter), validBefore: String(expires) } }
}

test('the observed 370ms race waits past validAfter and the chain lag margin', async () => {
  let now = 1788880501370, reads = 0
  const blocks = [validAfter - 1, validAfter, validAfter + 1, validAfter + 2, validAfter + 3]
  const result = await waitForAuthorization(diagnostic(), expires, {
    now: () => now, sleep: async ms => { now += ms },
    blockTimestamp: async () => blocks[reads++],
  })
  assert.equal(reads, 5)
  assert.equal(result.settlementBlockTimestamp, validAfter + 3)
  assert.equal(result.authorizationReadyAt, 1788880504370)
})

test('an authorization already valid on-chain requires no sleep', async () => {
  let sleeps = 0
  await waitForAuthorization(diagnostic(), expires, {
    now: () => 1788880510000, sleep: async () => { sleeps++ }, blockTimestamp: async () => validAfter + 9,
  })
  assert.equal(sleeps, 0)
})

test('a stuck chain stops within 20 seconds without consuming the authorization window', async () => {
  let now = 1788880501370
  await assert.rejects(waitForAuthorization(diagnostic(), expires, {
    now: () => now, sleep: async ms => { now += ms }, blockTimestamp: async () => validAfter,
  }), /enough time to settle/)
  assert.equal(now, 1788880521370)
})

test('rejects expired windows, missing timestamps and RPC failures', async () => {
  const clock = { now: () => 1788880501370, sleep: async () => {}, blockTimestamp: async () => validAfter + 3 }
  await assert.rejects(waitForAuthorization(diagnostic(), validAfter + 10, clock), /enough time to settle/)
  await assert.rejects(waitForAuthorization({ ...diagnostic(), authorization: {} }, expires, clock), /supported authorization/)
  await assert.rejects(waitForAuthorization(diagnostic(), expires, {
    ...clock, blockTimestamp: async () => { throw new Error('RPC unavailable') },
  }), /RPC unavailable/)
})
