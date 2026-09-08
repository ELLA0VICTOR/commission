import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultBrief } from '../shared/domain.ts'
import { calendarFile, invitationUrl } from '../src/lib/invitation.ts'

test('calendar exports escape text, fold UTF-8, and use exclusive all-day end dates', () => {
  const file = calendarFile({ ...defaultBrief, date: '2026-12-31', title: 'Friends, family; night', details: 'é'.repeat(100) + '\nBEGIN:VEVENT' })
  assert.ok(file.includes('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101'))
  assert.ok(file.includes('SUMMARY:Friends\\, family\\; night'))
  assert.equal(file.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1)
  assert.ok(file.split('\r\n').every(line => Buffer.byteLength(line) <= 75))
})
test('timed calendar exports preserve instants and reject incomplete or reversed times', () => {
  const brief = { ...defaultBrief, calendarStart: '2026-09-19T18:00:00Z', calendarEnd: '2026-09-19T20:00:00Z' }
  assert.ok(calendarFile(brief).includes('DTSTART:20260919T180000Z'))
  assert.throws(() => calendarFile({ ...brief, calendarEnd: '' }), /Choose a calendar end/)
  assert.throws(() => calendarFile({ ...brief, calendarEnd: '2026-09-19T17:00:00Z' }), /Choose a calendar end/)
  assert.throws(() => calendarFile({ ...brief, date: '2026-09-20' }), /must match/)
  assert.throws(() => calendarFile({ ...defaultBrief, date: '2026-02-30' }), /valid date/)
})
test('QR destinations allow web links and reject executable or credential-bearing URLs', () => {
  for (const rsvpUrl of ['javascript:alert(1)', 'data:text/html,test', 'https://secret:pass@example.com', 'not a link']) assert.equal(invitationUrl({ ...defaultBrief, rsvpUrl }), '')
  assert.equal(invitationUrl({ ...defaultBrief, rsvpUrl: 'https://example.com/rsvp?event=family' }), 'https://example.com/rsvp?event=family')
})
