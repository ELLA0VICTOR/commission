import type { UploadedNarration } from '../../shared/domain'
import { api } from './api'
export async function uploadNarration(file: File, sourceText: string): Promise<UploadedNarration> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'mp3' && extension !== 'wav') throw new Error('Choose an MP3 or WAV recording.')
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose an audio file smaller than 10 MB.')
  const context = new AudioContext()
  let duration: number
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    duration = decoded.duration
    if (!Number.isFinite(duration) || duration <= 0 || duration > 60) throw new Error('Choose a recording up to 60 seconds long.')
  } catch (error) {
    if (error instanceof Error && error.message.includes('60 seconds')) throw error
    throw new Error('This recording cannot be played. Export it as MP3 or WAV and try again.', { cause: error })
  } finally { await context.close() }
  const { token } = await api<{ token: string }>('/session')
  const response = await fetch('/api/narration/upload', {
    method: 'POST', headers: { 'Content-Type': extension === 'mp3' ? 'audio/mpeg' : 'audio/wav', 'X-Commission-Session': token }, body: file,
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Could not save this recording. Keep the local service running.')
  return { assetUrl: result.assetUrl, filename: file.name.slice(0, 180), duration, sourceText, addedAt: new Date().toISOString() }
}
