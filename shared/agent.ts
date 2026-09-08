import { z } from 'zod'
import { planSchema, type Brief, type Plan, type Quote } from './domain.ts'

export const draftBriefSchema = z.object({
  title: z.string().max(64), subtitle: z.string().max(100), date: z.string().max(10),
  time: z.string().max(30), venue: z.string().max(90), callToAction: z.string().max(60),
  details: z.string().max(600), direction: z.enum(['After dark', 'Open air', 'Gallery opening']),
  budget: z.string().max(20),
})
export const agentRequestSchema = z.object({
  projectId: z.string().uuid(), brief: draftBriefSchema, plan: planSchema.optional(),
  planKey: z.string().max(5000).optional(), message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(['user', 'agent']), text: z.string().max(1000) })).max(12),
  timeZone: z.string().max(80),
})
export type AgentRequest = z.infer<typeof agentRequestSchema>
export const agentPanels = ['edit', 'direction', 'export', 'receipts', 'wallet', 'narration'] as const
export type AgentTurn = {
  reply: string; brief: Brief; plan?: Plan; quote?: Quote; panel?: typeof agentPanels[number];
  changes: string[];
}
