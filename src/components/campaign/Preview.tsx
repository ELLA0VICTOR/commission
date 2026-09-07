import { Download, Maximize2, RectangleVertical, ScanLine } from '../ui/Icons'
import type { Brief } from '../../../shared/domain'
import { Poster, type Format } from './Poster'
export function Preview({ brief, artwork, format, onFormat, onExport, exporting, onExpand }: {
  brief: Brief; artwork?: string; format: Format; onFormat: (format: Format) => void;
  onExport: () => void; exporting: boolean; onExpand: () => void;
}) {
  return <section className="preview-panel preview-assembly" aria-labelledby="preview-title">
    <div className="preview-toolbar"><h2 id="preview-title">Your invitation</h2><button className="icon-button" aria-label="Enlarge preview" onClick={onExpand}><Maximize2 size={16} /></button></div>
    <div className="format-switch" role="group" aria-label="Preview format"><button aria-pressed={format === 'poster'} onClick={() => onFormat('poster')}><ScanLine size={14} /> Poster <span>3:4</span></button><button aria-pressed={format === 'story'} onClick={() => onFormat('story')}><RectangleVertical size={14} /> Story <span>9:16</span></button></div>
    <div className={'preview-stage ' + (format === 'story' ? 'is-story' : '')}><div className="poster-frame"><Poster brief={brief} artwork={artwork} format={format} /></div></div>
    <div className="preview-caption"><span className={'status-dot ' + (artwork ? 'connected' : '')} /><span>{artwork ? 'Purchased artwork · your live event details' : 'Layout preview · artwork not generated'}</span></div>
    <div className="preview-bottom"><span>{format === 'poster' ? '900 × 1200' : '900 × 1600'} px <span className="mx-2">/</span> PNG</span><button className="text-button" disabled={exporting} onClick={onExport}><Download size={15} />{exporting ? 'Exporting…' : artwork ? 'Export image' : 'Export layout preview'}</button></div>
  </section>
}
