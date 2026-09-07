import { useState } from 'react'
import type { UploadedNarration } from '../../../shared/domain'
import { uploadNarration } from '../../lib/narration'
import { AudioLines, LoaderCircle } from '../ui/Icons'
export function NarrationPanel({ script, uploaded, paidAudio, stale, providerUnavailable, onSave, onRemove, onReview, onPurchase }: {
  script: string; uploaded?: UploadedNarration; paidAudio?: string; stale: boolean; providerUnavailable: boolean;
  onSave: (audio: UploadedNarration) => void; onRemove: () => void; onReview: () => void; onPurchase: () => void;
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const uploadedStale = uploaded && uploaded.sourceText !== script
  async function select(file?: File) {
    if (!file) return
    setBusy(true); setError('')
    try { onSave(await uploadNarration(file, script)) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="narration-panel">
    <p className="text-muted">Upload your own recording to finish the campaign. No wallet payment is involved.</p>
    {providerUnavailable && <p className="notice">Xona speech generation is unavailable. Previous payment records are preserved.</p>}
    {script ? <label className="field">Current voiceover script<textarea rows={4} readOnly value={script} /></label> : <p className="footnote">Add narration for your event. Creative direction can provide a script.</p>}
    {stale && <p className="notice">Your brief changed. Review the copy before preparing narration or exporting.</p>}
    <label className="field">{uploaded ? 'Replace narration file' : 'Upload narration'}<input className="narration-file" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" disabled={busy} onChange={event => { void select(event.target.files?.[0]); event.target.value = '' }} /></label>
    <p className="footnote">MP3 or WAV, up to 60 seconds and 10 MB. Saved on this computer.</p>
    {busy && <p className="footnote" role="status"><LoaderCircle size={14} className="animate-spin" /> Checking and saving the recording...</p>}
    {uploaded ? <div className="narration-recording">
      <div><AudioLines size={18} /><strong>Uploaded narration</strong><span>{uploaded.duration.toFixed(1)}s</span></div>
      <p className="footnote narration-filename">{uploaded.filename}</p>
      <audio controls preload="metadata" src={uploaded.assetUrl} aria-label="Uploaded narration preview" />
      {uploadedStale && <p className="notice">The script changed. This recording is excluded from exports until you replace it or confirm it matches.</p>}
      <div className="flex flex-wrap gap-4">{uploadedStale && <button className="text-button" disabled={busy || stale} onClick={() => onSave({ ...uploaded, sourceText: script })}>Recording matches current script</button>}<button className="text-button" disabled={busy} onClick={onRemove}>Remove uploaded narration</button></div>
    </div> : paidAudio ? <div className="narration-recording"><strong>B402 narration</strong><audio controls src={paidAudio} aria-label="Purchased narration preview" /></div> : null}
    <div className="narration-actions"><button className="text-button" onClick={onReview}>Review copy</button><button className="text-button" disabled={busy || providerUnavailable} onClick={onPurchase}>Request paid voiceover</button></div>
    {error && <p className="notice" role="alert">{error}</p>}
  </div>
}
