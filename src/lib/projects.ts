import { z } from 'zod'
import { draftBriefSchema } from '../../shared/agent.ts'
import { defaultBrief, uploadedNarrationSchema, type Project } from '../../shared/domain.ts'
let key = 'commission.projects.v2'
export function setProjectScope(userId?: string) { key = userId ? 'commission.projects.v2.' + userId : 'commission.projects.v2' }
const draftPlan = z.object({ concept: z.string().max(500), imagePrompt: z.string().max(1800), narration: z.string().max(700), caption: z.string().max(1600) })
export function createProject(): Project {
  return { id: crypto.randomUUID(), brief: { ...defaultBrief, title: '', subtitle: '', date: '', time: '', venue: '', callToAction: '', details: '' }, createdAt: new Date().toISOString() }
}
export function loadProjects(): Project[] {
  try {
    // Retire the previous demo workspace; new drafts persist under v2.
    localStorage.removeItem('commission.projects.v1')
    const raw: unknown = JSON.parse(localStorage.getItem(key) || '[]')
    if (Array.isArray(raw)) {
      const result = raw.filter((value): value is Project =>
        value && z.string().uuid().safeParse(value.id).success &&
        draftBriefSchema.safeParse(value.brief).success && (!value.plan || draftPlan.safeParse(value.plan).success))
      if (result.length) return result.map(project => ({
        ...project,
        uploadedNarration: uploadedNarrationSchema.safeParse(project.uploadedNarration).success ? project.uploadedNarration : undefined,
        agentField: project.agentField && Object.keys(defaultBrief).includes(project.agentField) ? project.agentField : undefined,
        messages: z.array(z.object({ id: z.string(), role: z.enum(['user', 'agent']), text: z.string().max(4000), createdAt: z.string() })).max(150).safeParse(project.messages).success ? project.messages : [],
      }))
    }
  } catch { /* A corrupt or unavailable store starts a fresh local draft. */ }
  const initial = [createProject()]
  try { saveProjects(initial) } catch { /* Editing will surface a storage error if persistence is unavailable. */ }
  return initial
}
export function saveProjects(projects: Project[]) { localStorage.setItem(key, JSON.stringify(projects)) }
export function contentKey(brief: Project['brief']) { return JSON.stringify({ ...brief, budget: undefined, rsvpUrl: undefined, calendarStart: undefined, calendarEnd: undefined }) }
export function dateLabel(date: string) {
  const parsed = new Date(date + 'T12:00:00')
  return Number.isNaN(parsed.getTime()) ? 'Choose a date' : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
