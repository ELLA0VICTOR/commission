import { useMemo } from 'react'
import QRCode from 'qrcode'
export function InvitationQr({ url, x = 0, y = 0, size = 160 }: { url: string; x?: number; y?: number; size?: number }) {
  const code = useMemo(() => {
    const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' })
    let path = ''
    for (let row = 0; row < modules.size; row++) for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`
    }
    return { path, size: modules.size + 8 }
  }, [url])
  return <svg x={x} y={y} width={size} height={size} viewBox={`0 0 ${code.size} ${code.size}`} aria-label="Invitation QR code" role="img" shapeRendering="crispEdges">
    <rect width={code.size} height={code.size} fill="var(--text-primary)" />
    <path d={code.path} fill="var(--bg-base)" />
  </svg>
}
