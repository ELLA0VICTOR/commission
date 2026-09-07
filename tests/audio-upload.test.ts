import test from 'node:test'
import assert from 'node:assert/strict'
import { audioExtension } from '../server/audio-upload.ts'
test('audio uploads reject empty, oversized and disguised files', () => {
  const wav = Buffer.alloc(44); wav.write('RIFF'); wav.write('WAVE', 8)
  assert.equal(audioExtension(wav, 'audio/wav'), 'wav')
  assert.equal(audioExtension(Buffer.from('ID3test audio'), 'audio/mpeg'), 'mp3')
  for (const [bytes, mime] of [[Buffer.alloc(0), 'audio/wav'], [Buffer.alloc(10 * 1024 * 1024 + 1), 'audio/wav'], [Buffer.from('<html>not audio</html>'), 'audio/mpeg'], [wav, 'image/png']] as const)
    assert.throws(() => audioExtension(bytes, mime))
})
