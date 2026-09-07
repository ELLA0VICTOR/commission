import { Image } from '../ui/Icons'

export function EmptyPoster() {
  return <div className="poster-empty-content">
    <span className="canvas-corner top-left" aria-hidden="true" /><span className="canvas-corner top-right" aria-hidden="true" />
    <span className="canvas-corner bottom-left" aria-hidden="true" /><span className="canvas-corner bottom-right" aria-hidden="true" />
    <div className="empty-artwork-mark"><Image size={28} strokeWidth={1} /></div>
    <p>No artwork yet</p>
  </div>
}
