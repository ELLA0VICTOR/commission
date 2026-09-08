import { useId } from 'react'
import type { Brief } from '../../../shared/domain'
import { dateLabel } from '../../lib/projects'
import { invitationUrl } from '../../lib/invitation'
import { InvitationQr } from './InvitationQr'
export type Format = 'poster' | 'story'
function lines(text: string, limit: number) {
  const result: string[] = []
  for (const word of text.split(/\s+/)) {
    if (result.length && (result[result.length - 1] + ' ' + word).length <= limit) result[result.length - 1] += ' ' + word
    else result.push(word)
  }
  return result
}
export function Poster({ brief, format, artwork, layer = 'all' }: { brief: Brief; format: Format; artwork?: string; layer?: 'all' | 'art' | 'type' }) {
  const clipId = useId().replaceAll(':', '')
  const height = format === 'story' ? 1600 : 1200
  const rsvp = invitationUrl(brief)
  const background = 'var(--bg-raised)'
  const ink = 'var(--text-primary)'
  const accent = 'var(--accent-gold)'
  const headline = lines(brief.title.toUpperCase() || 'YOUR EVENT', 9)
  const fontSize = Math.min(147, 770 / Math.max(...headline.map(line => line.length)) * 1.55)
  return <svg data-testid="campaign-poster" xmlns="http://www.w3.org/2000/svg" viewBox={'0 0 900 ' + height} role="img" aria-label={brief.title + ' campaign ' + format} style={{ fontFamily: '"Hanken Grotesk Variable", sans-serif' }}>
    <defs><clipPath id={clipId}><rect width="900" height={height} /></clipPath></defs>
    <g clipPath={'url(#' + clipId + ')'}>
      {layer !== 'type' && <><rect width="900" height={height} fill={background} />
      {artwork ? <><image href={artwork} width="900" height={height} preserveAspectRatio="xMidYMid slice" /><rect width="900" height={height} fill={background} opacity=".40" /><rect width="900" height={headline.length * fontSize + 220} fill={background} opacity=".42" /></> : <>
        <g className="poster-art" transform={'translate(450 ' + (height * .60) + ') rotate(-22)'}>
          <ellipse rx="450" ry="187" fill={accent} />
          <ellipse rx="390" ry="151" fill={background} />
          <ellipse rx="324" ry="119" fill={ink} />
          <ellipse rx="256" ry="86" fill={background} />
          <ellipse rx="187" ry="55" fill={accent} />
          <ellipse rx="111" ry="26" fill={background} />
          <path d="M-440 5L-390 360L-280 360L-307 132Z" fill={ink} />
          <path d="M390 -85L430 325L500 325L447 -12Z" fill={accent} />
        </g>
        <circle cx="736" cy={height * .4} r="35" fill={ink} />
      </>}
      </>}
      {layer !== 'art' && <><text className="poster-kicker" x="62" y="77" fontSize="18" fontWeight="600" letterSpacing="3" fill={accent}>AN INDEPENDENT GATHERING</text>
      <path d="M788 54h42m-21-21v42" stroke={accent} strokeWidth="2" />
      {headline.map((line, index) => <text className="poster-title" key={index} x="54" y={207 + index * fontSize * .88} fontSize={fontSize} fontWeight="850" letterSpacing="-5" fill={headline.length > 1 && index === headline.length - 1 ? accent : ink}>{line}</text>)}
      {lines(brief.subtitle, 42).map((line, index) => <text className="poster-tagline" key={index} x="63" y={238 + (headline.length - 1) * fontSize * .88 + index * 30} fontSize="24" fill={ink}>{line}</text>)}
      {rsvp ? <g className="poster-footer"><rect y={height - 268} width="900" height="268" fill={background} />
        <path d={`M62 ${height - 254}H838`} stroke={accent} strokeOpacity=".5" />
        <text x="62" y={height - 207} fill={ink} fontSize="27" fontWeight="650">{dateLabel(brief.date)}</text>
        <text x="62" y={height - 173} fill={ink} fontSize="24">{brief.time}</text>
        {lines(brief.venue, 36).slice(0, 2).map((line, i) => <text key={i} x="62" y={height - 130 + i * 30} fill={ink} fontSize="24">{line}</text>)}
        <text x="62" y={height - 39} fill={accent} fontSize="21" fontWeight="600" textLength={brief.callToAction.length > 40 ? 550 : undefined} lengthAdjust="spacingAndGlyphs">{brief.callToAction} ↗</text>
        <InvitationQr url={rsvp} x={666} y={height - 230} size={172} />
        <text x="752" y={height - 32} fill={ink} textAnchor="middle" fontSize="16" letterSpacing="2">SCAN TO JOIN</text>
      </g> : <g className="poster-footer"><rect x="0" y={height - 204} width="900" height="204" fill={background} />
      <path d={'M62 ' + (height - 192) + 'H838'} stroke={accent} strokeOpacity=".5" />
      <text x="62" y={height - 148} fill={ink} fontSize="27" fontWeight="650">{dateLabel(brief.date)} · {brief.time}</text>
      {lines(brief.venue, 46).slice(0, 2).map((line, i) => <text key={i} x="62" y={height - 104 + i * 30} fill={ink} fontSize="24">{line}</text>)}
      <text x="62" y={height - 39} fill={accent} fontSize="21" fontWeight="600">{brief.callToAction} ↗</text>
      <text x="838" y={height - 39} textAnchor="end" fill={ink} fontSize="18">COME AS YOU ARE.</text></g>}
      </>}
    </g>
    {layer === 'all' && <rect className="poster-edge" x="1" y="1" width="898" height={height - 2} fill="none" stroke="var(--border-strong)" strokeWidth="2" />}
  </svg>
}
