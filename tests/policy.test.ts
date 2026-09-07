import test from 'node:test'
import assert from 'node:assert/strict'
import { assertBudget, decimal, MERCHANT, requestBody, units, U_TOKEN, validateAccept } from '../server/policy.ts'
import { defaultBrief } from '../shared/domain.ts'

const valid = { scheme: 'exact', network: 'eip155:56', asset: U_TOKEN, payTo: MERCHANT, amount: '50000000000000000', extra: { assetTransferMethod: 'eip3009' } }
test('uses exact 18-decimal arithmetic at budget boundaries', () => {
  assert.equal(decimal(units('0.050000000000000001')), '0.050000000000000001')
  assert.equal(decimal(units('10')), '10')
  assert.equal(decimal(0n), '0')
  assert.doesNotThrow(() => assertBudget('0.06', ['0.05'], '0.01'))
  assert.throws(() => assertBudget('0.06', ['0.05'], '0.010000000000000001'), /budget/)
  for (const value of ['-1', '1e6', 'NaN', '0.1234567890123456789']) assert.throws(() => units(value))
})
test('rejects unsupported tokens, chains, merchants, allowance methods and malformed challenges', () => {
  assert.equal(validateAccept(valid), true)
  for (const patch of [
    { network: 'eip155:8453' }, { asset: '0xwrong' }, { asset: undefined },
    { payTo: '0xwrong' }, { scheme: 'upto' }, { amount: '-1' }, { amount: '0' },
    { extra: { assetTransferMethod: 'permit2' } },
  ]) assert.equal(validateAccept({ ...valid, ...patch }), false)
})
test('campaign fact changes reuse the purchased visual; narration follows the reviewed script', () => {
  const plan = { concept: 'A quiet rooftop scene.', imagePrompt: 'Architectural blue rooftop, no text.', narration: 'Join us at The Terrace on September 19.', caption: 'An invitation to After Hours.' }
  assert.deepEqual(requestBody('image', defaultBrief, plan), requestBody('image', { ...defaultBrief, venue: 'New venue' }, plan))
  assert.notDeepEqual(requestBody('voice', defaultBrief, plan), requestBody('voice', defaultBrief, { ...plan, narration: 'Updated invitation.' }))
  assert.throws(() => requestBody('image', defaultBrief), /direction/)
})
