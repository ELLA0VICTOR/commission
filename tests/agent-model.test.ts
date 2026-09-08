import test from 'node:test'
import assert from 'node:assert/strict'
import { completeAgent } from '../server/agent-model.ts'

test('model connection explains exhausted API credits without exposing provider details', async t => {
  const previous = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'local-test-placeholder'
  t.after(() => { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous })
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { type: 'insufficient_quota', code: 'credit_balance_exhausted', message: 'Private provider details' } }, { status: 429 }))
  await assert.rejects(completeAgent({ instructions: 'Test', input: [], tools: [] }), error => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /API credits/)
    assert.doesNotMatch(error.message, /Private provider details/)
    return true
  })
})

test('model requests stay on the official endpoint with bounded output and no stored response', async t => {
  const previous = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'local-test-placeholder'
  t.after(() => { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous })
  t.mock.method(globalThis, 'fetch', async (url: string, request: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    const body = JSON.parse(request.body as string)
    assert.equal(body.store, false)
    assert.equal(body.parallel_tool_calls, false)
    assert.equal(body.max_output_tokens, 1400)
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello.' }] }] })
  })
  assert.equal((await completeAgent({ instructions: 'Test', input: [], tools: [] })).length, 1)
})
