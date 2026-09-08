export type AgentAction = 'upload' | 'brief' | 'edit' | 'direction' | 'image' | 'voice' | 'review' | 'wallet' | 'export' | 'receipts' | 'invitation'
export type ChatMessage = { id: string; role: 'user' | 'agent'; text: string; createdAt: string }
export function chatMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return { id: crypto.randomUUID(), role, text, createdAt: new Date().toISOString() }
}
