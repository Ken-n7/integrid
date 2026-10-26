/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: PrecacheEntry[] }

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
