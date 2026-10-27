import type { WorkboxPlugin } from 'workbox-core'

// Reserve connections for the screen being opened. A slot lasts until the whole
// response is cached, including large music files, rather than just its headers.
export function backgroundDownloads(): WorkboxPlugin {
  let active = 0
  const waiting: (() => void)[] = []
  return {
    async requestWillFetch({ request, event, state }) {
      // Runtime cache misses belong to the player and must never wait in this queue.
      if (event.type !== 'install' || !state) return request
      if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve))
      else active++
      let released = false
      state.releaseDownload = () => {
        if (released) return
        released = true
        const next = waiting.shift()
        if (next) next()
        else active--
      }
      return new Request(request, { priority: 'low' })
    },
    async handlerDidComplete({ state }) {
      // Workbox calls this after cache writes, network failures and storage failures.
      const release = state?.releaseDownload
      if (typeof release === 'function') release()
    },
  }
}
