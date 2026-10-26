import type { ReactNode } from 'react'
import { Art } from './Art.tsx'
import { Dialog } from './ui.tsx'

// Destructive actions always start with focus on the safe choice.
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel, busy = false, error, danger = true }: {
  title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string
  onConfirm: () => void; onCancel: () => void; busy?: boolean; error?: string; danger?: boolean
}) {
  return (
    <Dialog title={title} onClose={busy ? undefined : onCancel} onBack={busy ? () => {} : onCancel} className="confirmation-panel" focusTitle={busy}>
      <span className="confirmation-art" aria-hidden="true"><Art name="warning" /></span>
      {children}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="big secondary" onClick={onCancel} disabled={busy} autoFocus>{cancelLabel}</button>
        <button className={`big${danger ? ' danger' : ''}`} onClick={onConfirm} disabled={busy}>{busy ? 'Please wait…' : confirmLabel}</button>
      </div>
    </Dialog>
  )
}
