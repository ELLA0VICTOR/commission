import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { planSchema, type Plan, type Service } from '../shared/domain.ts'
import { assetDirectory } from './store.ts'

export async function merchantRequest(url: string, body: unknown, signature?: string) {
  return fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'PAYMENT-SIGNATURE': signature } : {}) },
    body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(signature ? 240_000 : 30_000),
  })
}
export async function getRequirements(response: Response): Promise<Record<string, unknown>> {
  if (response.status !== 402) throw new Error('The provider did not return a payment quote (HTTP ' + response.status + '). No payment was signed.')
  const header = response.headers.get('payment-required')
  const raw = header ? JSON.parse(Buffer.from(header, 'base64').toString('utf8')) : await response.json()
  const schema = z.object({ x402Version: z.literal(2), accepts: z.array(z.record(z.string(), z.unknown())).min(1) }).passthrough()
  return schema.parse(raw)
}
export function parsePlan(raw: unknown): Plan {
  const envelope = z.object({ text: z.string() }).passthrough().parse(raw)
  return planSchema.parse(JSON.parse(envelope.text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()))
}
function isPublic(address: string) {
  if (address.includes(':')) return !/^(::|fc|fd|fe[89ab]|2001:db8)/i.test(address)
  const [a, b] = address.split('.').map(Number)
  return a !== 0 && a !== 10 && a !== 127 && !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) &&
    !(a === 100 && b >= 64 && b <= 127) && a < 224
}
export async function saveAsset(raw: unknown, service: Service, id: string) {
  const field = service === 'image' ? 'image_url' : 'audio_url'
  const record = z.record(z.string(), z.unknown()).parse(raw)
  const url = new URL(z.string().url().parse(record[field]))
  // No arbitrary browser-supplied URLs. Still validate the provider's output before fetching.
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(url.hostname))
    throw new Error('Provider returned an unsupported asset address.')
  const addresses = await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(entry => !isPublic(entry.address))) throw new Error('Provider asset address is not public.')
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) })
  const mime = response.headers.get('content-type')?.split(';')[0] || ''
  const formats: Record<string, string> = service === 'image'
    ? { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
    : { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg' }
  const extension = formats[mime]
  if (!response.ok || !extension || !response.body) throw new Error('Provider asset could not be downloaded in a supported format.')
  const chunks: Uint8Array[] = []
  let length = 0
  for await (const chunk of response.body) {
    length += chunk.length
    if (length > 25 * 1024 * 1024) throw new Error('Provider asset exceeds the 25 MB limit.')
    chunks.push(chunk)
  }
  await writeFile(resolve(assetDirectory(), id + '.' + extension), Buffer.concat(chunks))
  return '/api/assets/' + id + '.' + extension
}
