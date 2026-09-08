import { z } from 'zod'

export const rsvpUrlSchema = z.union([z.literal(''), z.string().trim().max(500).url().refine(value => {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}, 'Use an http or https invitation link')])
export const calendarInstantSchema = z.union([z.literal(''), z.iso.datetime()])

export const briefSchema = z.object({
  title: z.string().trim().min(2).max(64),
  subtitle: z.string().trim().max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().trim().min(1).max(30),
  venue: z.string().trim().min(2).max(90),
  callToAction: z.string().trim().min(2).max(60),
  details: z.string().trim().max(600),
  rsvpUrl: rsvpUrlSchema.optional(),
  calendarStart: calendarInstantSchema.optional(),
  calendarEnd: calendarInstantSchema.optional(),
  direction: z.enum(['After dark', 'Open air', 'Gallery opening']),
  budget: z.string().regex(/^\d{1,2}(\.\d{1,4})?$/).refine(v => Number(v) > 0 && Number(v) <= 10, 'Set a budget between 0.0001 and 10 U'),
})
export type Brief = z.infer<typeof briefSchema>
export const planSchema = z.object({
  concept: z.string().min(10).max(500),
  imagePrompt: z.string().min(20).max(1800),
  narration: z.string().min(10).max(700),
  caption: z.string().min(10).max(1600),
})
export type Plan = z.infer<typeof planSchema>
export type Service = 'plan' | 'image' | 'voice'
export const uploadedNarrationSchema = z.object({
  assetUrl: z.string().regex(/^\/api\/assets\/uploaded-[0-9a-f-]{36}\.(mp3|wav)$/),
  filename: z.string().min(1).max(180), duration: z.number().positive().max(60),
  sourceText: z.string().max(700), addedAt: z.string(),
})
export type UploadedNarration = z.infer<typeof uploadedNarrationSchema>
export type Project = { uploadedNarration?: UploadedNarration; id: string; brief: Brief; createdAt: string; plan?: Plan; planKey?: string; planOrderId?: string; briefConfirmed?: boolean; agentField?: keyof Brief; messages?: { id: string; role: 'user' | 'agent'; text: string; createdAt: string }[] }
export type Quote = {
  id: string; projectId: string; service: Service; amount: string; token: string;
  tokenAddress: string; payTo: string; expiresAt: number; ready: boolean; reasons: string[];
}
export type Order = {
  id: string; projectId: string; service: Service; inputKey: string;
  status: 'processing' | 'delivered' | 'uncertain';
  amount: string; token: string; createdAt: string; settlement?: string;
  settled: boolean; recoverable?: boolean; retryOf?: string; briefSnapshot?: Brief; sourceText?: string; assetUrl?: string; plan?: Plan; error?: string;
  paymentDiagnostics?: {
    paymentId: string; optionIndex: number; signingStartedAt: number;
    signedAt?: number; signatureExpiresAt?: number; requestStartedAt?: number; respondedAt?: number;
    httpStatus?: number; providerDate?: number; settlementHeaderPresent?: boolean;
    accepted?: { network?: string; asset?: string; payTo?: string; amount?: string };
    authorization?: { from?: string; to?: string; value?: string; validAfter?: string; validBefore?: string };
  };
}
export type Wallet = { connected: boolean; address?: string; error?: string }
export const serviceNames: Record<Service, string> = {
  plan: 'Creative direction', image: 'Campaign artwork', voice: 'Voiceover',
}
export function briefKey(brief: Brief) { return JSON.stringify(brief) }
export const defaultBrief: Brief = {
  title: 'AFTER HOURS', subtitle: 'Good music. A different perspective.',
  date: '2026-09-19', time: '18:00 – late', venue: 'The Terrace, Lagos',
  callToAction: 'Reserve your spot',
  details: 'An intimate rooftop listening session. Independent DJs, slow grooves, and a city after sunset. For people who come for the music. Keep the tone understated and inviting.',
  direction: 'After dark', budget: '0.25',
}
