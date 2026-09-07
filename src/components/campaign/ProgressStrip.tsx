import { Check } from '../ui/Icons'
const labels = ['Brief', 'Direction', 'Artwork', 'Ready']
export function ProgressStrip({ current, onStep }: { current: number; onStep: (index: number) => void }) {
  return <nav className="progress-strip" aria-label="Campaign progress"><ol>{labels.map((label, index) => {
    const state = index < current ? 'complete' : index === current ? 'current' : 'upcoming'
    return <li className={'progress-step ' + state} key={label}>
      <button aria-label={label + (state === 'complete' ? ', completed' : state === 'current' ? ', current' : ', upcoming')} aria-current={state === 'current' ? 'step' : undefined} onClick={() => onStep(index)}>
        <span className="progress-node">{state === 'complete' ? <Check size={14} /> : index + 1}</span>
        <span className="progress-label">{label}</span>
      </button>
    </li>
  })}</ol></nav>
}
