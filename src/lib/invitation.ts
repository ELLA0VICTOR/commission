import { rsvpUrlSchema, type Brief } from '../../shared/domain.ts'
import { dateLabel } from './projects.ts'

export function invitationUrl(brief: Brief) {
  const result = rsvpUrlSchema.safeParse(brief.rsvpUrl || '')
  return result.success ? result.data : ''
}
export function invitationText(brief: Brief) {
  return [brief.title, brief.subtitle, '', `${dateLabel(brief.date)} · ${brief.time}`, brief.venue,
    '', brief.details, '', brief.callToAction, invitationUrl(brief)].filter((line, i, lines) => line || lines[i - 1]).join('\n').trim()
}
function escapeText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}
// RFC 5545 folds at 75 UTF-8 octets; never split a multibyte character.
function fold(line: string) {
  const encoder = new TextEncoder()
  let result = '', length = 0
  for (const character of line) {
    const bytes = encoder.encode(character).length
    if (length + bytes > 75) { result += '\r\n '; length = 1 }
    result += character; length += bytes
  }
  return result
}
function stamp(date: Date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') }
export function calendarFile(brief: Brief) {
  const date = new Date(brief.date + 'T00:00:00Z')
  if (!brief.title.trim() || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== brief.date) {
    throw new Error('Add an event name and a valid date first.')
  }
  let dates: string[]
  if (brief.calendarStart || brief.calendarEnd) {
    const start = new Date(brief.calendarStart || ''), end = new Date(brief.calendarEnd || '')
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new Error('Choose a calendar end after the start, or clear both times for a date-only entry.')
    }
    if (toLocalInput(brief.calendarStart!).slice(0, 10) !== brief.date) throw new Error('Calendar start must match the event date. Update the calendar times.')
    dates = ['DTSTART:' + stamp(start), 'DTEND:' + stamp(end)]
  } else {
    const end = new Date(date); end.setUTCDate(end.getUTCDate() + 1)
    dates = ['DTSTART;VALUE=DATE:' + brief.date.replaceAll('-', ''), 'DTEND;VALUE=DATE:' + end.toISOString().slice(0, 10).replaceAll('-', '')]
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Commission//Event invitation//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${crypto.randomUUID()}@commission.local`, 'DTSTAMP:' + stamp(new Date()), ...dates,
    'SUMMARY:' + escapeText(brief.title), 'LOCATION:' + escapeText(brief.venue),
    'DESCRIPTION:' + escapeText(invitationText(brief)), ...(invitationUrl(brief) ? ['URL:' + invitationUrl(brief)] : []),
    'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n'
}
export function toLocalInput(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return adjusted.toISOString().slice(0, 16)
}
