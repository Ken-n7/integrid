import assert from 'node:assert/strict'
import { backgroundDownloads } from '../src/offlineDownloads.ts'

const plugin = backgroundDownloads()
type PluginEvent = Parameters<NonNullable<typeof plugin.requestWillFetch>>[0]['event']
const request = new Request('https://integrid.test/music/sky-puzzle.mp3')
const event = { type: 'install' } as PluginEvent
const states = Array.from({ length: 4 }, () => ({}))
const started: number[] = []
const requests = states.map(async (state, i) => {
  const next = await plugin.requestWillFetch!({ request, event, state })
  started.push(i)
  return next
})
await Promise.all(requests.slice(0, 2))
assert.deepEqual(started, [0, 1], 'only two installation downloads start together')

// An interactive fetch bypasses a busy installation queue.
assert.equal(await plugin.requestWillFetch!({ request, event: { type: 'fetch' } as PluginEvent, state: {} }), request)

// A response completing (or failing) releases exactly one waiting request.
await plugin.handlerDidComplete!({ request, event, state: states[0] })
await requests[2]
assert.deepEqual(started, [0, 1, 2])
await plugin.handlerDidComplete!({ request, event, state: states[0] })
assert.deepEqual(started, [0, 1, 2], 'a completed download cannot release twice')
await plugin.handlerDidComplete!({ request, event, state: states[1], error: new Error('network or cache failure') })
await requests[3]
assert.deepEqual(started, [0, 1, 2, 3], 'failures do not strand queued files')
for (const state of states.slice(2)) await plugin.handlerDidComplete!({ request, event, state })
await plugin.requestWillFetch!({ request, event, state: states[0] })
await plugin.handlerDidComplete!({ request, event, state: states[0] })
console.log('✓ Offline installation concurrency, foreground bypass and failure recovery')
