/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { addPlugins, cleanupOutdatedCaches, matchPrecache, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { backgroundDownloads } from './offlineDownloads.ts'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: PrecacheEntry[] }

// Keep already-cached legacy PNGs for open tabs while the new app moves to WebP.
// New installations do not download these files. Student data is never in these caches.
const LEGACY_ART = 'integrid-legacy-art'
self.addEventListener('install', (event) => event.waitUntil((async () => {
  try {
    for (const name of await caches.keys()) {
      if (!name.includes('precache')) continue
      const old = await caches.open(name)
      for (const request of await old.keys()) {
        const url = new URL(request.url)
        if (!url.pathname.startsWith('/art/') || !url.pathname.endsWith('.png')) continue
        const response = await old.match(request)
        if (response?.ok) {
          const legacy = await caches.open(LEGACY_ART)
          await legacy.put(new Request(new URL(url.pathname, self.location.origin)), response)
        }
      }
    }
  } catch { /* A full cache must not prevent the application from updating. */ }
})()))
registerRoute(({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/art/') && url.pathname.endsWith('.png'), new CacheFirst({
  cacheName: LEGACY_ART,
  plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 86400 })],
}))

// Installation downloads yield network bandwidth to the screen the learner is using.
addPlugins([backgroundDownloads()])

// Register navigation FIRST so even /index.html checks the latest deployment.
registerRoute(({ request }) => request.mode === 'navigate', new NetworkFirst({
  cacheName: 'integrid-pages',
  networkTimeoutSeconds: 3,
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new ExpirationPlugin({ maxEntries: 5 }),
    { handlerDidError: async () => (await matchPrecache('/index.html')) ?? Response.error() },
  ],
}))

// Workbox updates changed files and removes obsolete app files on activation.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
// A runtime HTML copy may still refer to the previous deployment's removed chunks.
self.addEventListener('activate', (event) => event.waitUntil(caches.delete('integrid-pages')))
void self.skipWaiting()
clientsClaim()
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
