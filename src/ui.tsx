import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { useBack } from './back.ts'
import { focusScreen } from './focus.ts'
import { Art, type ArtName } from './Art.tsx'

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

// Supplied and generated artwork share the same decorative rendering and control hit areas.
const CONTROL_ART = {
  lock: 'lock', user: 'profile', close: 'close', info: 'info', clock: 'clock', settings: 'settings',
  back: 'arrow-left', next: 'arrow-right', restart: 'restart',
} as const satisfies Record<string, ArtName>
export const Icon = ({ name }: { name: keyof typeof CONTROL_ART }) => <Art name={CONTROL_ART[name]} className="utility-art" />

// Decoration a screen reader should skip ("→" is read as "right arrow", 🎮 as "video game").
const DECORATION_ART: Record<string, ArtName> = {
  '💗': 'heart', '💔': 'broken-heart', '📖': 'book', '🔎': 'magnifier', '⏱': 'clock',
  '🏆': 'trophy', '🎉': 'party', '🌿': 'leaf', '🔥': 'flame', '⚔️': 'battle',
  '🏅': 'medal', '⭐': 'star', '🌟': 'star', '🎯': 'target', '❌': 'error', '💰': 'coin',
  '🔊': 'sound-on', '🔇': 'sound-off', '🎵': 'music-on',
  '✓': 'check', '✗': 'error',
  '💡': 'hint', '🧩': 'puzzle', '🗺️': 'map', '🎮': 'controller', '🏁': 'flag',
  '👍': 'thumbs-up', '📱': 'phone', '🖨': 'printer', '🥧': 'pie', '↩️': 'undo',
  '←': 'arrow-left', '→': 'arrow-right', '↓': 'arrow-down', '▶': 'arrow-right',
  '⬇': 'download', '↻': 'restart',
}
export const Deco = ({ children }: { children: ReactNode }) => {
  const art = typeof children === 'string' ? DECORATION_ART[children] : undefined
  return <span aria-hidden="true">{art ? <Art name={art} /> : children}</span>
}

// The shared coin asset keeps the same appearance on every phone.
export const Coins = ({ n }: { n: number }) => (
  <span className="coins">
    <img className="coin" src="/art/coin.png" width="20" height="20" alt="" aria-hidden="true" />
    {n}
    <span className="sr">&nbsp;coins</span>
  </span>
)

// Pop-up: Escape and the X close it, Tab stays inside it, and closing hands focus back
// to whatever opened it (e.g. the (!) button).
// onBack: what Android's back gesture does while it's open (default: close it).
export function Dialog({ title, onClose, onBack = onClose, children, className = '', focusTitle = false }: { title: ReactNode; onClose?: () => void; onBack?: () => void; children: ReactNode; className?: string; focusTitle?: boolean }) {
  const panel = useRef<HTMLDivElement>(null)
  useBack(() => onBack?.(), 'popup', !!onBack)
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose?.()
    if (e.key !== 'Tab') return
    const items = panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input')
    const first = items[0]
    const last = items[items.length - 1]
    if (!first) return
    const active = document.activeElement
    const outside = !panel.current!.contains(active)
    // Result summaries can receive initial focus before the first button.
    const summary = active?.getAttribute('tabindex') === '-1'
    if (e.shiftKey ? active === first || summary || outside : active === last || outside) {
      e.preventDefault()
      ;(e.shiftKey ? last : first)?.focus()
    }
  })
  const [opener] = useState(() => document.activeElement as HTMLElement | null) // read before autoFocus moves focus
  useEffect(() => {
    const node = panel.current!
    if (focusTitle) { node.querySelector<HTMLElement>('#dialog-title')?.focus({ preventScroll: true }); node.scrollTop = 0 }
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('keydown', onKey)
      // Hand focus back once the pop-up is really gone (React's dev double-run keeps it on the page).
      setTimeout(() => {
        if (node.isConnected || document.querySelector('[role="dialog"]')) return
        if (opener?.isConnected) opener.focus()
        else focusScreen()
      })
    }
  }, [opener, focusTitle])
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={panel} className={className ? `panel ${className}` : 'panel'} role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-body">
        {onClose && (
          <button className="close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        )}
        <h2 id="dialog-title" tabIndex={focusTitle ? -1 : undefined}>{title}</h2>
        <div id="dialog-body" className="dialog-body">
          {children}
        </div>
      </div>
    </div>
  )
}
