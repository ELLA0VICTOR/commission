import { useEffect, useRef, useState, type FormEvent } from 'react'
import { serviceNames, type Order, type Project } from '../../../shared/domain'
import type { AgentAction } from '../../lib/conversation'
import { Modal } from '../ui/Modal'
import { AgentMark, ArrowUpRight, LoaderCircle, ReceiptText, Send } from '../ui/Icons'
const actions: [AgentAction, string][] = [['brief', 'Build my brief'], ['direction', 'Direction'], ['image', 'Artwork'], ['voice', 'Voiceover'], ['review', 'Review copy'], ['wallet', 'Wallet'], ['export', 'Export']]
export function AgentPanel({ project, orders, busy, error, onSend, onAction, onClose, onClear }: {
  project: Project; orders: Order[]; busy: boolean; error: string; onSend: (text: string) => void;
  onAction: (action: AgentAction) => void; onClose: () => void; onClear: () => void;
}) {
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const messages = project.messages || []
  const orderStatus = orders.map(order => order.id + order.status + order.settled).join(',')
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages.length, orderStatus, busy])
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!text.trim() || busy) return
    onSend(text.trim()); setText('')
  }
  return <Modal title={<span className="agent-identity"><AgentMark size={30} strokeWidth={1.2} /><span>Agent</span></span>} className="agent-panel" onClose={onClose} actions={<button className="text-button" disabled={busy || (!messages.length && !project.agentField && !error && !text)} title="Clear messages; keep campaign files and receipts" onClick={() => { setText(''); onClear() }}>Clear chat</button>}>
    <div className="agent-status"><span className="agent-online-dot" />{busy ? 'Working' : 'Ready'}<span className="agent-mode">Local briefing · B402 production</span></div>
    <div className="conversation" role="log" aria-label="Campaign conversation" aria-live="polite" aria-relevant="additions text">
      <div className="chat-message incoming">Tell me about your event, or choose “Build my brief”. I can update the preview and commission creative services. You approve every payment.</div>
      {messages.map(message => <div key={message.id} className={'chat-message ' + (message.role === 'user' ? 'outgoing' : 'incoming')}><span className="sr-only">{message.role === 'user' ? 'You: ' : 'Agent: '}</span>{message.text}</div>)}
      {orders.map(order => order.settled ? <div className="chat-receipt" key={order.id}>
        <ReceiptText size={18} /><div><strong>{serviceNames[order.service]}</strong><small>{order.status === 'delivered' ? 'B402 payment · delivered' : order.status === 'processing' ? 'B402 payment · awaiting delivery' : 'B402 payment · delivery needs review'}</small>{order.settlement && <a href={'https://bscscan.com/tx/' + order.settlement} target="_blank" rel="noreferrer">Transaction <ArrowUpRight size={12} /></a>}</div><span className="money">{order.amount} {order.token}</span>
      </div> : <div className="chat-message incoming order-message" key={order.id}>
        {order.status === 'processing' && <LoaderCircle size={14} className="animate-spin" />}
        <span>{serviceNames[order.service]}: {order.status === 'processing' ? 'producing. Keep the local service running.' : order.status === 'delivered' ? 'delivered. Settlement not yet confirmed.' : order.error || 'delivery needs review.'}</span>
      </div>)}
      {error && <div className="chat-message incoming chat-error" role="alert">{error}</div>}
      {busy && <div className="agent-working" role="status"><LoaderCircle size={14} className="animate-spin" /> Checking the current request…</div>}
      <div ref={end} />
    </div>
    <div className="agent-actions" aria-label="Agent actions">{actions.map(([action, label]) => <button className="text-button" key={action} disabled={busy} onClick={() => onAction(action)}>{label}</button>)}</div>
    <form className="chat-composer" onSubmit={submit}><label className="sr-only" htmlFor="agent-message">Message Agent</label><textarea id="agent-message" rows={2} value={text} maxLength={2000} placeholder={project.agentField ? 'Your answer…' : 'Change venue to The Terrace…'} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (text.trim() && !busy) { onSend(text.trim()); setText('') } } }} /><button className="button primary chat-send" type="submit" aria-label="Send message" disabled={busy || !text.trim()}><Send size={18} /></button></form>
  </Modal>
}
