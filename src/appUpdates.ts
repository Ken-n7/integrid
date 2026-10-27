import { isBackNavigationSettling } from './back.ts'
import { setOfflineState } from './offlineState.ts'

// Only app files are refreshed. Student saves, sign-in and preferences stay in localStorage.
const blockers = new Set<symbol>()
let processUpdate: (() => void) | undefined
let started = false

export function holdAppUpdates() {
  const token = Symbol('active work')
  blockers.add(token)
  return () => {
    blockers.delete(token)
    // Let React finish committing and saving before a screen is replaced.
    setTimeout(() => processUpdate?.(), 0)
  }
}

export function startAppUpdates() {
  if (started || !('serviceWorker' in navigator)) return
  started = true
  const serviceWorker = navigator.serviceWorker
  let registration: ServiceWorkerRegistration | undefined
  let hadController = !!serviceWorker.controller
  if (hadController) setOfflineState('ready')
  let needsReload = false
  let reloading = false
  let checking = false
  let connecting = false
  let checkedAt = 0

  processUpdate = () => {
    if (blockers.size || document.hidden || reloading || isBackNavigationSettling()) return
    if (needsReload) {
      reloading = true
      dispatchEvent(new Event('integrid:before-update'))
      location.reload()
    } else registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
  }
  const queueUpdate = () => setTimeout(() => processUpdate?.(), 0)
  serviceWorker.addEventListener('controllerchange', () => {
    // Claiming a brand-new installation does not need another page load.
    setOfflineState('ready')
    if (hadController) needsReload = true
    hadController = true
    queueUpdate()
  })

  async function check(force = false) {
    if (!registration || checking || document.hidden || !navigator.onLine) return
    if (!force && Date.now() - checkedAt < 5000) return
    if (registration.installing) return
    checking = true
    checkedAt = Date.now()
    try { await registration.update() } catch { /* Offline: keep the working copy. */ }
    finally { checking = false; queueUpdate() }
  }
  function watchInstalling() {
    const worker = registration?.installing
    if (worker) setOfflineState(hadController ? 'updating' : 'saving')
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'activated') setOfflineState('ready')
      if (worker.state === 'redundant') setOfflineState(hadController ? 'ready' : 'idle')
      if (worker.state === 'installed' || worker.state === 'activated') queueUpdate()
    })
  }
  async function connect() {
    if (registration || connecting) return
    connecting = true
    try {
      try { registration = await serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }) }
      catch { registration = await serviceWorker.getRegistration('/') }
      if (registration) {
        registration.addEventListener('updatefound', watchInstalling)
        watchInstalling()
        if (registration.active?.state === 'activated' && !registration.installing) setOfflineState('ready')
        queueUpdate()
        void check(true)
      }
    } catch { /* First visit offline: keep the current page usable. */ }
    finally { connecting = false }
  }
  const begin = () => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => { void connect() }, { timeout: 3000 })
    else setTimeout(() => { void connect() }, 0)
  }
  if (document.readyState === 'complete') begin()
  else addEventListener('load', begin, { once: true })
  const checkOrConnect = (force = false) => registration ? check(force) : connect()

  addEventListener('integrid:history-settled', queueUpdate)
  addEventListener('online', () => { void checkOrConnect(true); queueUpdate() })
  addEventListener('focus', () => { void checkOrConnect(); queueUpdate() })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { void checkOrConnect(); queueUpdate() }
  })
  setInterval(() => { if (!document.hidden && navigator.onLine) void checkOrConnect() }, 60_000)

  // A stale tab can reference a chunk removed by a deploy. Recover when its work is safe.
  addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    needsReload = true
    void check(true)
    queueUpdate()
  })
}
