import { z } from 'zod'

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
const integer = z.string().regex(/^\d{1,78}$/).optional()
// Explicitly strip signatures, nonces, extensions and all other unknown fields.
const envelope = z.object({
  accepted: z.object({ network: z.string().regex(/^eip155:\d+$/).optional(), asset: address, payTo: address, amount: integer }).optional(),
  payload: z.object({ authorization: z.object({ from: address, to: address, value: integer, validAfter: integer, validBefore: integer }).optional() }).optional(),
})

export function authorizationDiagnostics(header: string) {
  try {
    const result = envelope.safeParse(JSON.parse(Buffer.from(header, 'base64').toString('utf8')))
    if (result.success) return { accepted: result.data.accepted, authorization: result.data.payload?.authorization }
  } catch { /* Diagnostics must not change how an opaque wallet authorization is sent. */ }
  return {}
}
