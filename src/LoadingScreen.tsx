import { useEffect, useState, useSyncExternalStore } from 'react'
import { getOfflineState, subscribeOfflineState } from './offlineState.ts'

export function LoadingScreen({ title = 'Getting your adventure ready', detail = 'Your next challenge is on its way.', embedded = false, retryNow = false }: { title?: string; detail?: string; embedded?: boolean; retryNow?: boolean }) {
  const Tag = embedded ? 'section' : 'main'
  const [slow, setSlow] = useState(false)
  useEffect(() => { const timer = setTimeout(() => setSlow(true), 12000); return () => clearTimeout(timer) }, [])
  return <Tag className={`loading-screen${embedded ? ' embedded' : ''}`} role="status" aria-live="polite">
    <div className="loading-card">
      <p className="loading-brand">INTEGRID <span>IN ACTION</span></p>
      <div className="loading-grid" aria-hidden="true"><span>−3</span><span>+</span><span className="loading-answer">?</span><span>=</span><span>2</span></div>
      <h1>{title}</h1><p>{detail}</p>
      <span className="loading-dots" aria-hidden="true"><i /><i /><i /></span>
      <small>{slow && !retryNow ? 'Taking a little longer. Check your connection and try again.' : 'One box. One step closer.'}</small>
      {(slow || retryNow) && <button className="loading-retry" onClick={() => location.reload()} autoFocus={retryNow}>{retryNow ? 'Reload game' : 'Try again'}</button>}
    </div>
  </Tag>
}
export function OfflineStatus() {
  const state = useSyncExternalStore(subscribeOfflineState, getOfflineState)
  return <p className={`offline-status ${state}`} role="status" aria-live="polite">
    {state === 'ready' ? 'Ready for offline play' : state === 'saving' ? 'Saving for offline play…' : state === 'updating' ? 'Updating offline files…' : '\u00a0'}
  </p>
}
