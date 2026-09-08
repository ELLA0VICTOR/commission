import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assetDirectory } from './store.ts'
export function audioExtension(bytes: Buffer, mime: string): 'wav' | 'mp3' {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Choose an audio file smaller than 10 MB.')
  if (mime === 'audio/wav' && bytes.length >= 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'wav'
  if (mime === 'audio/mpeg' && bytes.length >= 4 && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224 && (bytes[1] & 6) !== 0))) return 'mp3'
  throw new Error('The file is not a supported MP3 or WAV recording.')
}
export async function saveUploadedAudio(bytes: Buffer, mime: string) {
  const extension = audioExtension(bytes, mime)
  const name = 'uploaded-' + randomUUID() + '.' + extension
  await writeFile(resolve(assetDirectory(), name), bytes, { mode: 0o600, flag: 'wx' })
  return { assetUrl: '/api/assets/' + name }
}
