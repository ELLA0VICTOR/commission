import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { z } from 'zod'

if (existsSync('.env')) loadEnvFile('.env')
export type ModelItem = Record<string, unknown>
export type ModelRequest = { instructions: string; input: ModelItem[]; tools: ModelItem[]; tool_choice?: 'auto' | 'none' }
const responseSchema = z.object({ output: z.array(z.record(z.string(), z.unknown())) })
export function agentStatus() { return { configured: Boolean(process.env.OPENAI_API_KEY), model: process.env.COMMISSION_AGENT_MODEL || 'gpt-4.1-mini' } }
export async function completeAgent(request: ModelRequest): Promise<ModelItem[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('AI conversation needs an OpenAI API key. Add OPENAI_API_KEY to the local .env file and restart npm run dev. You can still use the action buttons and edit the brief manually.')
  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, model: agentStatus().model, store: false, parallel_tool_calls: false, max_output_tokens: 1400 }),
      signal: AbortSignal.timeout(25_000),
    })
  } catch { throw new Error('The AI connection timed out or could not be reached. No payment was made. Try your message again.') }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('The AI provider rejected the API key or model access. Check the local AI configuration.')
    if (response.status === 429) {
      const failure = z.object({ error: z.object({ code: z.string().optional(), type: z.string().optional() }) }).safeParse(await response.json().catch(() => null))
      if (failure.success && (failure.data.error.type === 'insufficient_quota' || ['insufficient_quota', 'credit_balance_exhausted'].includes(failure.data.error.code || '')))
        throw new Error('OpenAI API credits are exhausted or billing is not enabled. Add API credits in your OpenAI Platform billing settings. ChatGPT subscription and Binance wallet funds do not cover AI chat usage.')
      throw new Error('The AI provider has reached its request limit. Try again shortly. No payment was made through Binance.')
    }
    throw new Error('The AI provider could not answer (HTTP ' + response.status + '). Your campaign is saved; try again.')
  }
  return responseSchema.parse(await response.json()).output
}
