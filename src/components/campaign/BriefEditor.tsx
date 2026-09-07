import { Check, ChevronDown } from '../ui/Icons'
import type { Brief } from '../../../shared/domain'
export function BriefEditor({ brief, onChange, onReview, busy }: {
  brief: Brief; onChange: (value: Brief) => void; onReview: () => void; busy: boolean;
}) {
  function field(key: keyof Brief, value: string) { onChange({ ...brief, [key]: value }) }
  return <section className="brief-panel" aria-labelledby="brief-title">
    <div className="panel-heading"><div><span className="step-number">01</span><h2 id="brief-title">The brief</h2></div><span className="quiet-tag"><Check size={12} /> Saved locally</span></div>
    <div className="brief-fields">
      <label className="field">Event name<input value={brief.title} maxLength={64} onChange={e => field('title', e.target.value)} placeholder="Give it a name" /></label>
      <label className="field">One-line invitation<input value={brief.subtitle} maxLength={100} onChange={e => field('subtitle', e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="field">Date<input type="date" value={brief.date} onChange={e => field('date', e.target.value)} /></label><label className="field">Time<input value={brief.time} maxLength={30} onChange={e => field('time', e.target.value)} /></label></div>
      <label className="field">Venue<input value={brief.venue} maxLength={90} onChange={e => field('venue', e.target.value)} /></label>
      <label className="field">Call to action<input value={brief.callToAction} maxLength={60} onChange={e => field('callToAction', e.target.value)} /></label>
      <label className="field">The atmosphere<span className="select-wrap"><select value={brief.direction} onChange={e => field('direction', e.target.value)}><option>After dark</option><option>Open air</option><option>Gallery opening</option></select><ChevronDown size={15} /></span></label>
      <label className="field">What should people know?<textarea value={brief.details} maxLength={600} rows={3} onChange={e => field('details', e.target.value)} placeholder="Audience, atmosphere, and the details that matter." /></label>
    </div>
    <div className="budget-field"><div><label htmlFor="budget">Production budget</label></div><div className="amount-input"><input id="budget" inputMode="decimal" aria-label="Production budget in U" value={brief.budget} onChange={e => field('budget', e.target.value)} /><span>U</span></div></div>
    <button className="button secondary w-full" disabled={busy} onClick={onReview}>Save brief</button>
  </section>
}
