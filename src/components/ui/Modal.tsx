import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from './Icons'
export function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => { dialog?.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className={'modal ' + className} aria-labelledby={titleId} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal-inner"><div className="flex items-center justify-between gap-4 mb-6">
      <h2 id={titleId} className="text-2xl font-semibold tracking-tight">{title}</h2>
      <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>
    </div>{children}</div>
  </dialog>
}
