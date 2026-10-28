import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoadingScreen } from './LoadingScreen.tsx'
import { Art } from './Art.tsx'

// Acquire ownership before mounting any student state/persistence effects. A stale tab
// never gets a writable in-memory store; after ownership transfers it loads fresh data.
export function DeviceWriter({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'active' | 'waiting' | 'unsupported'>('checking')
  const tryAgain = useRef<() => void>(() => {})
  useEffect(() => {
    let disposed = false
    let requesting = false
    let release: (() => void) | undefined
    const attempt = async () => {
      if (disposed || requesting) return
      if (!navigator.locks) { setState('unsupported'); return }
      requesting = true
      try {
        await navigator.locks.request('integrid:student-writer', { ifAvailable: true }, async lock => {
          if (disposed) return
          if (!lock) { setState('waiting'); return }
          setState('active')
          await new Promise<void>(resolve => { release = resolve })
        })
      } catch { if (!disposed) setState('unsupported') }
      finally { requesting = false }
    }
    tryAgain.current = () => { void attempt() }
    const focus = () => { if (!document.hidden) void attempt() }
    void attempt()
    const timer = setInterval(() => { void attempt() }, 2000)
    addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    return () => { disposed = true; clearInterval(timer); release?.(); removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus) }
  }, [])
  if (state === 'active') return children
  if (state === 'checking') return <LoadingScreen title="Opening your saved adventure" detail="Checking this device’s game session." />
  return <main className="screen center" tabIndex={-1}>
    <Art name="controller" size={80} />
    <h1>{state === 'waiting' ? 'Your game is open in another tab' : 'This browser can’t protect your saved game'}</h1>
    <p className="sub">{state === 'waiting' ? 'Keep playing there, or close that tab to continue here. Your progress will load when this tab opens.' : 'Open INTEGRID using its HTTPS link in an updated browser, then try again.'}</p>
    <button className="big" onClick={() => tryAgain.current()}>Try this tab again</button>
  </main>
}
