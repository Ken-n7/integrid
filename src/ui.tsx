import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { useBack } from './back.ts'
import { focusScreen } from './focus.ts'

// Negative numbers in parentheses like the paper's test items, (−7), with slim parentheses
// so the digits stay big in small cells.
// One <span> so a centered cell treats it as a single item.
export const Num = ({ v }: { v: number }) =>
  v < 0 ? (
    <span>
      <small>(</small>−{-v}
      <small>)</small>
    </span>
  ) : (
    <span>{v}</span>
  )

// Line icons for controls and states: emoji and "‹ ↻ ▶ 🔒" glyphs look different on every phone.
const ICONS = {
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 6l6 6-6 6',
  restart: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5',
  close: 'M18 6 6 18M6 6l12 12',
  info: 'M12 7v6M12 17h.01',
  clock: 'M12 7v5l3 2',
  settings:
    'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0', // Lucide gear
}
export const Icon = ({ name }: { name: keyof typeof ICONS }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(name === 'info' || name === 'clock') && <circle cx="12" cy="12" r="9.5" />}
    <path d={ICONS[name]} />
  </svg>
)

// Decoration a screen reader should skip ("→" is read as "right arrow", 🎮 as "video game").
export const Deco = ({ children }: { children: ReactNode }) => <span aria-hidden="true">{children}</span>

// The shared coin asset keeps the same appearance on every phone.
export const Coins = ({ n }: { n: number }) => (
  <span className="coins">
    <img className="coin" src="/coin.svg" width="20" height="20" alt="" aria-hidden="true" />
    {n}
    <span className="sr">&nbsp;coins</span>
  </span>
)

// Pop-up: Escape and the X close it, Tab stays inside it, and closing hands focus back
// to whatever opened it (e.g. the (!) button).
// onBack: what Android's back gesture does while it's open (default: close it).
export function Dialog({ title, onClose, onBack = onClose, children }: { title: ReactNode; onClose?: () => void; onBack?: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useBack(() => onBack?.(), 'popup', !!onBack)
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose?.()
    if (e.key !== 'Tab') return
    const items = panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input')
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
      e.preventDefault()
      ;(e.shiftKey ? last : first)?.focus()
    }
  })
  const [opener] = useState(() => document.activeElement as HTMLElement | null) // read before autoFocus moves focus
  useEffect(() => {
    const node = panel.current!
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
      // Hand focus back once the pop-up is really gone (React's dev double-run keeps it on the page).
      setTimeout(() => {
        if (node.isConnected) return
        if (opener?.isConnected) opener.focus()
        else focusScreen()
      })
    }
  }, [opener])
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={panel} className="panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-body">
        {onClose && (
          <button className="close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        )}
        <h2 id="dialog-title">{title}</h2>
        <div id="dialog-body" className="dialog-body">
          {children}
        </div>
      </div>
    </div>
  )
}
