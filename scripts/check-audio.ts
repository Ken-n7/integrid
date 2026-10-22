/// <reference lib="dom" />
// Result sounds must pause music, resume its position, and cancel safely during loading/replay.
import assert from 'node:assert/strict'

const originals = new Map(['AudioContext', 'document', 'localStorage', 'fetch'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
const settings = new Map<string, string>()
const sources: Source[] = []
let oscillators = 0
let failLoss = true
let releaseWin: (() => void) | undefined
const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} })
const gain = () => ({ gain: param(), connect() {} })
class Source {
  buffer: { duration: number; kind: string } | null = null
  loop = false
  stopped = false
  offset = 0
  onended: (() => void) | null = null
  connect() {}
  start(_when = 0, offset = 0) { this.offset = offset }
  stop() { this.stopped = true }
}
class Context {
  static current: Context
  currentTime = 10
  state = 'running'
  destination = {}
  constructor() { Context.current = this }
  resume() { this.state = 'running'; return Promise.resolve() }
  suspend() { return Promise.resolve() }
  createGain() { return gain() }
  createBufferSource() { const source = new Source(); sources.push(source); return source }
  createOscillator() {
    oscillators++
    return { frequency: param(), connect: () => ({ connect() {} }), start() {}, stop() {}, onended: null }
  }
  decodeAudioData(data: ArrayBuffer) {
    const code = new Uint8Array(data)[0]
    return Promise.resolve({ duration: code === 0 ? 20 : code === 1 ? 3.5 : 3, kind: ['music', 'win', 'lose'][code] })
  }
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context })
Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } })
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => settings.get(key) ?? null, setItem: (key: string, value: string) => settings.set(key, value) } })
Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (url: string) => {
  const kind = url.includes('level-win') ? 1 : url.includes('game-over') ? 2 : 0
  if (kind === 1) await new Promise<void>((resolve) => { releaseWin = resolve })
  return { ok: !(kind === 2 && failLoss), arrayBuffer: async () => new Uint8Array([kind]).buffer }
} })

const { sfx, resultSoundPlaying, setSoundOn, warmSoundEffects } = await import('../src/sound.ts')
const { startMusic, stopMusic, setMusicOn } = await import('../src/music.ts')
try {
  await startMusic()
  const firstMusic = sources.at(-1)!
  assert.equal(firstMusic.buffer?.kind, 'music')
  Context.current.currentTime = 12.5
  const cancelLoading = sfx.win()
  assert.equal(firstMusic.stopped, true)
  assert.equal(resultSoundPlaying(), true)
  await startMusic() // the global tap handler must not restart music over the result
  assert.equal(sources.length, 1)
  cancelLoading()
  await tick()
  assert.equal(resultSoundPlaying(), false)
  assert.equal(sources.at(-1)!.offset, 2.5)
  releaseWin!()
  await tick()
  assert.ok(sources.every((source) => source.buffer?.kind === 'music')) // cancelled load never starts later

  const stopWin = sfx.win()
  await tick()
  const win = sources.at(-1)!
  assert.equal(win.buffer?.kind, 'win')
  assert.equal(win.loop, false)
  const before = oscillators
  sfx.right()
  sfx.wrong()
  assert.equal(oscillators, before) // other effects cannot overlap the result
  Context.current.currentTime = 16
  win.onended!()
  await tick()
  assert.equal(resultSoundPlaying(), false)
  assert.equal(sources.at(-1)!.buffer?.kind, 'music')
  assert.equal(sources.at(-1)!.offset, 2.5) // result duration does not advance the paused music

  const stopFallback = sfx.lose() // HTTP/decode failure releases music through the same cancellation path
  await tick()
  assert.equal(oscillators, before + 4)
  assert.equal(resultSoundPlaying(), true)
  stopFallback()
  await tick()
  failLoss = false
  const stopLoss = sfx.lose()
  await tick()
  const loss = sources.at(-1)!
  assert.equal(loss.buffer?.kind, 'lose') // a failed clip can retry
  stopWin() // cleanup from an older run must not stop the current run's audio
  assert.equal(resultSoundPlaying(), true)
  setMusicOn(false)
  const musicCount = sources.filter((source) => source.buffer?.kind === 'music').length
  stopLoss()
  await tick()
  assert.equal(loss.stopped, true)
  assert.equal(sources.filter((source) => source.buffer?.kind === 'music').length, musicCount)
  setSoundOn(false)
  const count = sources.length
  sfx.win()()
  sfx.lose()()
  sfx.right()
  assert.equal(resultSoundPlaying(), false)
  assert.equal(sources.length, count)
  assert.equal(oscillators, before + 4)
  setSoundOn(true)
  warmSoundEffects()
  Context.current.state = 'suspended'
  warmSoundEffects() // an already-loaded clip can still be unlocked by the next user gesture
  assert.equal(Context.current.state, 'running')
  console.log('✓ Result audio, music pause/resume, muted playback and loading cancellation')
} finally {
  stopMusic()
  setSoundOn(false)
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
}
