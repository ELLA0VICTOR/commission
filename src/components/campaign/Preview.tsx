import { Maximize2, RectangleVertical, ScanLine } from '../ui/Icons'
import type { Brief } from '../../../shared/domain'
import { Poster, type Format } from './Poster'
import { EmptyPoster } from './EmptyPoster'
export function Preview({ brief, artwork, format, onFormat, onExpand }: {
  brief: Brief; artwork?: string; format: Format; onFormat: (format: Format) => void; onExpand: () => void;
}) {
  return <section className="preview-panel preview-assembly" aria-labelledby="preview-title">
    <div className="preview-toolbar"><h2 id="preview-title">Campaign preview</h2>
      <div className="format-switch" role="group" aria-label="Preview format"><button aria-pressed={format === 'poster'} onClick={() => onFormat('poster')}><ScanLine size={14} /> Poster <span>3:4</span></button><button aria-pressed={format === 'story'} onClick={() => onFormat('story')}><RectangleVertical size={14} /> Story <span>9:16</span></button></div>
      <button className="icon-button" aria-label="Enlarge preview" disabled={!artwork} onClick={onExpand}><Maximize2 size={16} /></button>
    </div>
    <div className={'preview-stage ' + (format === 'story' ? 'is-story' : '')}><div className={'poster-frame' + (artwork ? '' : ' poster-empty')}>{artwork ? <Poster brief={brief} artwork={artwork} format={format} /> : <EmptyPoster />}</div></div>
    <div className="preview-caption"><span>{artwork ? 'Purchased artwork with live event details' : ''}</span></div>
  </section>
}
