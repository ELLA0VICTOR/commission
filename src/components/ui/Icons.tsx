import type { ReactNode, SVGProps } from 'react'
type GlyphProps = SVGProps<SVGSVGElement> & { size?: number }
function glyph(drawing: ReactNode) {
  return function Glyph({ size = 20, strokeWidth = 1.4, ...props }: GlyphProps) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false" {...props}>{drawing}</svg>
  }
}
export const ArrowUpRight = glyph(<path d="M6 18 18 6M6 6h12v12" />)
export const ArrowDownToLine = glyph(<path d="M12 3v13m-5-5 5 5 5-5M4 21h16" />)
export const Download = glyph(<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4" />)
export const Check = glyph(<path d="m4 12 5 5L20 6" />)
export const ChevronRight = glyph(<path d="m9 5 7 7-7 7" />)
export const ChevronDown = glyph(<path d="m5 9 7 7 7-7" />)
export const X = glyph(<path d="m6 6 12 12M18 6 6 18" />)
export const Plus = glyph(<path d="M12 4v16M4 12h16" />)
export const Menu = glyph(<path d="M3 6h18M3 12h18M3 18h18" />)
export const CircleHelp = glyph(<><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01" /></>)
export const Clock3 = glyph(<><circle cx="12" cy="12" r="9" /><path d="M12 6v6h5" /></>)
export const WalletCards = glyph(<><path d="M3 6h18v14H3zM3 6V3h15v3M21 11h-7v5h7" /><path d="M17 13.5h.01" /></>)
export const ReceiptText = glyph(<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm3 5h8M8 12h8M8 16h4" />)
export const BookOpen = glyph(<path d="M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15" />)
export const FolderClosed = glyph(<path d="M3 5h7l2 3h9v12H3V5Zm0 7h18" />)
export const Maximize2 = glyph(<path d="M14 3h7v7M21 3l-7 7M10 21H3v-7m0 7 7-7" />)
export const RectangleVertical = glyph(<path d="M6 2h12v20H6zM10 19h4" />)
export const ScanLine = glyph(<path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M3 12h18" />)
export const AudioLines = glyph(<path d="M3 10v4m4-7v10m5-14v18m5-14v10m4-7v4" />)
export const Clapperboard = glyph(<path d="M3 9h18v12H3zM3 9 2 4l18-3 1 5L3 9Zm3-6 4 4m3-5 4 4" />)
export const FileText = glyph(<path d="M5 2h9l5 5v15H5V2Zm9 0v6h5M8 12h8m-8 4h8" />)
export const Image = glyph(<><path d="M3 3h18v18H3zM3 18l6-7 5 6 3-4 4 5" /><circle cx="16" cy="8" r="1.5" /></>)
export const LoaderCircle = glyph(<path d="M21 12a9 9 0 1 1-9-9" />)
export const Copy = glyph(<path d="M8 8h13v13H8zM4 16H2V2h14v2" />)
export const ShieldCheck = glyph(<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-5 9 4 4 6-7" />)

export const Message = glyph(<path d="M3 4h18v13H9l-6 4V4Zm4 5h10M7 13h6" />)
export const Send = glyph(<path d="m3 11 18-8-8 18-2-8-8-2Zm8 2L21 3" />)
export const LogoMark = glyph(<><path d="M18 6H10a6 6 0 0 0 0 12h8v-4h-8a2 2 0 0 1 0-4h8z" fill="var(--accent-gold)" stroke="none" /><path d="M17 9h5v6h-5z" fill="var(--text-primary)" stroke="none" /></>)
