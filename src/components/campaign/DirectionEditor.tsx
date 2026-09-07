import type { Plan } from '../../../shared/domain'
export function DirectionEditor({ plan, stale, onChange, onConfirm }: { plan: Plan; stale: boolean; onChange: (plan: Plan) => void; onConfirm: () => void }) {
  return <div className="direction-editor"><p className="text-muted mb-5">{plan.concept}</p>
    {stale && <p className="notice mb-4">The brief changed. Check the script and caption against the new event details.</p>}
    <label className="field">Image direction<textarea rows={4} maxLength={1800} value={plan.imagePrompt} onChange={e => onChange({ ...plan, imagePrompt: e.target.value })} /></label>
    <label className="field">Voiceover script<textarea rows={4} maxLength={700} value={plan.narration} onChange={e => onChange({ ...plan, narration: e.target.value })} /></label>
    <label className="field">Social caption<textarea rows={4} maxLength={1600} value={plan.caption} onChange={e => onChange({ ...plan, caption: e.target.value })} /></label>
    <button className="button primary" onClick={onConfirm}>Copy checked</button>
  </div>
}
