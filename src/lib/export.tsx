import { renderToStaticMarkup } from 'react-dom/server'
import { zipSync, strToU8 } from 'fflate'
import fontUrl from '@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2?url'
import type { Brief, Order, Plan } from '../../shared/domain'
import { Poster, type Format } from '../components/campaign/Poster'
import { dateLabel } from './projects'

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not prepare the export.'))
    reader.readAsDataURL(blob)
  })
}
async function image(source: string): Promise<HTMLImageElement> {
  const element = new Image()
  element.src = source
  await element.decode()
  return element
}
export async function posterCanvas(brief: Brief, format: Format, artwork?: string, layer: 'all' | 'art' | 'type' = 'all') {
  await document.fonts.ready
  const embeddedArtwork = artwork ? await dataUrl(await (await fetch(artwork)).blob()) : undefined
  const font = await dataUrl(await (await fetch(fontUrl)).blob())
  let svg = renderToStaticMarkup(<Poster brief={brief} format={format} artwork={embeddedArtwork} layer={layer} />)
  svg = svg.replace('<defs>', '<defs><style>@font-face{font-family:"Hanken Grotesk Variable";src:url(' + font + ') format("woff2");font-weight:100 900}</style>')
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 900; canvas.height = format === 'poster' ? 1200 : 1600
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas exports are unavailable in this browser.')
    context.drawImage(await image(url), 0, 0, canvas.width, canvas.height)
    return canvas
  } finally { URL.revokeObjectURL(url) }
}
export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed.')), 'image/png'))
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
export function filename(brief: Brief) { return brief.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign' }
export function fallbackCaption(brief: Brief) {
  return [brief.title, brief.subtitle, '', dateLabel(brief.date) + ' Â· ' + brief.time, brief.venue, '', brief.callToAction].join('\n')
}
export async function campaignZip(brief: Brief, orders: Order[], plan?: Plan, artwork?: string, audio?: string) {
  const [poster, story] = await Promise.all([
    posterCanvas(brief, 'poster', artwork).then(canvasBlob),
    posterCanvas(brief, 'story', artwork).then(canvasBlob),
  ])
  const files: Record<string, Uint8Array> = {
    'poster.png': new Uint8Array(await poster.arrayBuffer()),
    'story.png': new Uint8Array(await story.arrayBuffer()),
    'caption.txt': strToU8(plan?.caption || fallbackCaption(brief)),
    'campaign.json': strToU8(JSON.stringify({ brief, plan, artwork: artwork ? 'Purchased' : 'Local layout preview', receipts: orders }, null, 2)),
    'READ-ME.txt': strToU8('Created with Commission. ' + (artwork ? 'Includes purchased artwork.' : 'LAYOUT PREVIEW: artwork has not been purchased or generated.') + '\nReview event details and provider terms before publishing.\nMotion promo is exported separately as WebM in the workspace.'),
  }
  if (audio) {
    const response = await fetch(audio)
    if (!response.ok) throw new Error('Could not include the voiceover. Try again.')
    files['voiceover.' + (audio.split('.').pop() || 'mp3')] = new Uint8Array(await response.arrayBuffer())
  }
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
}
export async function motionPromo(brief: Brief, artwork: string | undefined, audio: string | undefined, onProgress: (progress: number) => void) {
  if (!window.MediaRecorder) throw new Error('Video export requires a recent Chrome or Edge browser.')
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error('This browser cannot export WebM video. Use Chrome or Edge.')
  const context = new AudioContext()
  await context.resume()
  let stream: MediaStream | undefined
  let source: AudioBufferSourceNode | undefined
  try {
    const [artLayer, typeLayer] = await Promise.all([
      posterCanvas(brief, 'story', artwork, 'art'), posterCanvas(brief, 'story', artwork, 'type'),
    ])
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1600
    const draw = canvas.getContext('2d')!
    draw.drawImage(artLayer, 0, 0); draw.drawImage(typeLayer, 0, 0)
    stream = canvas.captureStream(30)
    let duration = 8
    if (audio) {
      const response = await fetch(audio)
      if (!response.ok) throw new Error('Could not load the purchased voiceover.')
      const buffer = await context.decodeAudioData(await response.arrayBuffer())
      duration = buffer.duration + .5
      if (duration > 60) throw new Error('This voiceover exceeds the 60-second local video limit.')
      source = context.createBufferSource(); source.buffer = buffer
      const destination = context.createMediaStreamDestination()
      source.connect(destination); destination.stream.getAudioTracks().forEach(track => stream!.addTrack(track))
    }
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 })
    const chunks: Blob[] = []
    return await new Promise<Blob>((resolve, reject) => {
      let frame = 0

      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onerror = () => { clearTimeout(timer); cancelAnimationFrame(frame); reject(new Error('Video recording failed. Keep the tab open and try again.')) }
      recorder.onstop = () => { clearTimeout(timer); cancelAnimationFrame(frame); onProgress(100); resolve(new Blob(chunks, { type: 'video/webm' })) }
      recorder.start(250); source?.start()
      const start = performance.now()
      function paint() {
        const progress = Math.min(1, (performance.now() - start) / (duration * 1000))
        const scale = 1 + .07 * progress
        draw.save()
        draw.translate(450, 800)
        draw.scale(scale, scale)
        draw.drawImage(artLayer, -450, -800)
        draw.restore()
        draw.drawImage(typeLayer, 0, 0)
        onProgress(Math.round(progress * 100))
        frame = requestAnimationFrame(paint)
      }
      paint()
      const timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop() }, duration * 1000)
    })
  } finally { source?.stop(); stream?.getTracks().forEach(track => track.stop()); await context.close() }
}
