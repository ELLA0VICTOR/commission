import { useState } from 'react'
import { CalendarDays, Copy, Link } from 'lucide-react'
import type { Brief } from '../../../shared/domain'
import { calendarFile, invitationText, invitationUrl, toLocalInput } from '../../lib/invitation'
import { download, filename } from '../../lib/download'
import { InvitationQr } from './InvitationQr'

export function InvitationPanel({ brief, onChange }: { brief: Brief; onChange: (brief: Brief) => void }) {
  const [message, setMessage] = useState('')
  const url = invitationUrl(brief)
  const text = invitationText(brief)
  function change(key: keyof Brief, value: string) { setMessage(''); onChange({ ...brief, [key]: value }) }
  function time(key: 'calendarStart' | 'calendarEnd', value: string) {
    change(key, value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : '')
  }
  return <div className="invitation-panel">
    <label className="field">RSVP or ticket link<input type="url" value={brief.rsvpUrl || ''} maxLength={500} placeholder="https://…" onChange={event => change('rsvpUrl', event.target.value)} /></label>
    {brief.rsvpUrl && !url && <p className="footnote" role="alert">Enter a complete http or https link.</p>}
    {url ? <div className="invitation-qr"><InvitationQr url={url} size={120} /><div><strong>Scan to join</strong><p className="footnote">Included on your poster, story and promo.</p><a className="text-button" href={url} target="_blank" rel="noreferrer"><Link size={14} /> Check destination</a></div></div> : <p className="footnote">Use your existing RSVP form or ticket page. The QR code appears when you add a link.</p>}
    <div className="invitation-calendar"><h3>Calendar invitation</h3><p className="footnote">{brief.calendarStart || brief.calendarEnd ? 'Times shown in ' + Intl.DateTimeFormat().resolvedOptions().timeZone + '.' : 'Date-only by default. Add exact times for a timed entry.'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="field">Start<input type="datetime-local" value={toLocalInput(brief.calendarStart || '')} onChange={event => time('calendarStart', event.target.value)} /></label><label className="field">End<input type="datetime-local" value={toLocalInput(brief.calendarEnd || '')} onChange={event => time('calendarEnd', event.target.value)} /></label></div>
      {(brief.calendarStart || brief.calendarEnd) && <button className="text-button" onClick={() => { onChange({ ...brief, calendarStart: '', calendarEnd: '' }); setMessage('') }}>Use date only</button>}
      <button className="text-button" onClick={() => { try { download(new Blob([calendarFile(brief)], { type: 'text/calendar;charset=utf-8' }), filename(brief) + '.ics'); setMessage('Calendar file downloaded. Open or import it in your calendar.') } catch (error) { setMessage((error as Error).message) } }}><CalendarDays size={16} /> Download calendar invitation</button>
    </div>
    <label className="field">Invitation message<textarea readOnly rows={6} value={text} /></label>
    <button className="button secondary" disabled={!brief.title.trim()} onClick={() => { void navigator.clipboard.writeText(text).then(() => setMessage('Invitation copied. Paste it into your family or friends’ chat.')).catch(() => setMessage('Select and copy the invitation text above.')) }}><Copy size={16} /> Copy invitation</button>
    <p className="footnote">Share the message and calendar file yourself. Both are also included in the campaign ZIP.</p>
    {message && <p className="footnote" role="status">{message}</p>}
  </div>
}
