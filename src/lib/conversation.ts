import { briefSchema, type Brief, type Project } from '../../shared/domain'

export type AgentAction = 'upload' | 'brief' | 'edit' | 'direction' | 'image' | 'voice' | 'review' | 'wallet' | 'export' | 'receipts'
export type ChatMessage = { id: string; role: 'user' | 'agent'; text: string; createdAt: string }
export type ConversationResult = { reply: string; brief?: Brief; field?: keyof Brief; confirmed?: boolean; action?: AgentAction }
export const fields: (keyof Brief)[] = ['title', 'subtitle', 'date', 'time', 'venue', 'callToAction', 'direction', 'details', 'budget']
const prompts: Record<keyof Brief, string> = {
  title: 'What is the event called?',
  subtitle: 'What is the one-line invitation?',
  date: 'What date is it? Use YYYY-MM-DD, or a month, day, and year.',
  time: 'What time should guests arrive?',
  venue: 'Where is it happening?',
  callToAction: 'What should guests do next? For example, “Reserve your spot”.',
  direction: 'What is the atmosphere: After dark, Open air, or Gallery opening?',
  details: 'Tell me about the audience, music, or anything else the creative direction should reflect.',
  budget: 'What is your production ceiling in U? Every purchase still needs its own approval.',
}
const names: Record<keyof Brief, string> = { title: 'event name', subtitle: 'invitation', date: 'date', time: 'time', venue: 'venue', callToAction: 'call to action', direction: 'atmosphere', details: 'event details', budget: 'budget' }
const labels: Record<string, keyof Brief> = { title: 'title', name: 'title', 'event name': 'title', subtitle: 'subtitle', invitation: 'subtitle', tagline: 'subtitle', date: 'date', time: 'time', venue: 'venue', location: 'venue', 'call to action': 'callToAction', cta: 'callToAction', atmosphere: 'direction', style: 'direction', details: 'details', budget: 'budget' }

function valueFor(field: keyof Brief, input: string): string | undefined {
  let value = input.trim().replace(/^["“](.*)["”]$/, '$1')
  if (field === 'budget') value = value.replace(/\s*U\s*$/i, '').trim()
  if (field === 'direction') {
    const match = ['After dark', 'Open air', 'Gallery opening'].find(option => option.toLowerCase() === value.toLowerCase())
    if (!match) return undefined
    value = match
  }
  if (field === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      if (!/\b\d{4}\b/.test(value)) return undefined
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) return undefined
      value = [parsed.getFullYear(), String(parsed.getMonth() + 1).padStart(2, '0'), String(parsed.getDate()).padStart(2, '0')].join('-')
    }
    const parsed = new Date(value + 'T12:00:00Z')
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return undefined
  }
  return briefSchema.shape[field].safeParse(value).success ? value : undefined
}
export function respond(project: Project, input: string): ConversationResult {
  const text = input.trim()
  const command = text.toLowerCase().replace(/[.!?]+$/, '')
  const actions: [RegExp, AgentAction, string][] = [
    [/^(?:upload|import|add)(?: my| a| the)? (?:audio|narration|voiceover)$/, 'upload', 'Opening narration. Select an MP3 or WAV from your computer; uploading makes no payment.'],
    [/^(?:build|start|create|write)(?: my| a| the)? brief$/, 'brief', prompts.title],
    [/^(?:edit|show|open)(?: my| the)? brief$/, 'edit', 'Opening the brief editor. Your changes appear in the preview immediately.'],
    [/^(?:(?:get|buy|create|commission|generate)(?: the| a| my)? )?(?:creative )?direction$/, 'direction', 'I’ll request the live price for creative direction. You will review it before payment.'],
    [/^(?:(?:get|buy|create|commission|generate)(?: the| a| my)? )?(?:artwork|image)$/, 'image', 'I’ll get an artwork quote using your reviewed image direction.'],
    [/^(?:(?:get|buy|create|commission|generate)(?: the| a| my)? )?(?:voiceover|narration|voice)$/, 'voice', 'I’ll get a voiceover quote for the current script.'],
    [/^(?:review|edit)(?: my| the)? (?:direction|copy|script|plan)$/, 'review', 'Opening the creative direction and copy for review.'],
    [/^(?:connect|open)(?: my| the)? wallet$/, 'wallet', 'Let’s connect your Binance Agentic Wallet. Connecting does not spend anything.'],
    [/^(?:download|export)(?: my| the)?(?: campaign| files| pack)?$/, 'export', 'Choose your campaign files or the motion promo.'],
    [/^(?:show|open|view)?\s*(?:my |the )?receipts$/, 'receipts', 'Here are the actual delivery and settlement records.'],
  ]
  for (const [pattern, action, reply] of actions) if (pattern.test(command))
    return { reply, action, field: action === 'brief' ? 'title' : project.agentField }
  if (/^(help|what can you do|how does this work)$/.test(command))
    return { reply: 'I can guide you through the brief, update fields (“change venue to The Terrace”), and request Direction, Artwork, or Voiceover through B402. Brief editing is local and free. AI production is paid only after you approve a quote.', field: project.agentField }
  if (/^(cancel|stop)$/.test(command)) return { reply: 'Brief questions paused. Your edits are saved. Any already-authorized purchase continues; it is not cancelled by this message.' }

  const patches: Partial<Record<keyof Brief, string>> = {}
  for (const part of text.split(/[;\n]+/)) {
    const match = part.trim().match(/^(?:(?:change|set|update)(?: the)?\s+)?(event name|call to action|title|name|subtitle|invitation|tagline|date|time|venue|location|cta|atmosphere|style|details|budget)(?:\s*:\s*|\s+to\s+|\s+is\s+)(.+)$/i)
    if (match) patches[labels[match[1].toLowerCase()]] = match[2]
  }
  const name = text.match(/^(?:call|name) (?:it|the event)\s+(.+)$/i)
  if (name) patches.title = name[1]
  if (Object.keys(patches).length) {
    const brief = { ...project.brief }
    for (const [key, raw] of Object.entries(patches)) {
      const field = key as keyof Brief
      const value = valueFor(field, raw)
      if (value === undefined) return { reply: 'I could not apply the ' + names[field] + '. ' + prompts[field], field: project.agentField }
      Object.assign(brief, { [field]: value })
    }
    const answered = project.agentField && patches[project.agentField] !== undefined
    const next = answered ? fields[fields.indexOf(project.agentField!) + 1] : project.agentField
    return { brief, field: next, confirmed: Boolean(answered && !next), reply: 'Updated ' + Object.keys(patches).map(key => names[key as keyof Brief]).join(', ') + '. The preview is up to date.' + (answered ? next ? ' ' + prompts[next] : ' Your brief is ready. Choose Direction for a live quote.' : '') }
  }
  if (project.agentField) {
    const field = project.agentField
    const value = command === 'skip' ? project.brief[field] : valueFor(field, text)
    if (value === undefined) return { reply: 'I need a valid ' + names[field] + '. ' + prompts[field], field }
    const brief = { ...project.brief, [field]: value }
    const next = fields[fields.indexOf(field) + 1]
    if (next) return { brief, field: next, reply: 'Saved. ' + prompts[next] }
    return { brief, confirmed: true, reply: 'Your brief is ready. Review the invitation, then choose Direction for a live quote. I will not pay until you approve it.' }
  }
  if (/\?$/.test(text) || /^(what|why|how|can|do|is|are)\b/i.test(text)) return { reply: 'For now I guide brief edits and production requests. Try “Build my brief”, “venue: The Terrace”, “Direction”, or “receipts”.' }
  if (text.length <= 600) return { brief: { ...project.brief, details: text }, field: 'title', reply: 'I’ve saved that as the event context. Let’s complete the brief. ' + prompts.title }
  return { reply: 'Keep the event context under 600 characters, or update a field with “venue: …”.' }
}
export function chatMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return { id: crypto.randomUUID(), role, text, createdAt: new Date().toISOString() }
}
