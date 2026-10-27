/// <reference lib="dom" />
import assert from 'node:assert/strict'
import { RESULT_CLIPS } from '../src/resultClips.ts'
import { SOUND_BANK } from '../src/soundBank.generated.ts'
import { MUSIC_PLAYLISTS, MUSIC_TRACKS, musicSceneForScreen } from '../src/musicPlaylists.ts'
const originals = new Map(['AudioContext', 'document', 'localStorage', 'fetch', 'setTimeout', 'clearTimeout'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
const settings = new Map<string, string>(), sources: Source[] = [], timers = new Map<number, { callback: () => void; ms: number }>()
let timerId = 0, oscillatorCount = 0
const param = () => ({ value: 0, setValueAtTime(v: number) { this.value = v }, exponentialRampToValueAtTime(v: number) { this.value = v }, linearRampToValueAtTime(v: number) { this.value = v }, setTargetAtTime(v: number) { this.value = v }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} })
const gains: ReturnType<typeof gain>[] = []
function gain() { return { gain: param(), connect() { return this }, disconnect() {} } }
class Source {
  buffer: { duration: number; kind: string } | null = null
  loop = false; stopped = false; stopAt = 0; offset = 0; duration = 0
  onended: (() => void) | null = null
  connect(destination: unknown) { return destination }
  disconnect() {}
  start(_at = 0, offset = 0, duration = 0) { this.offset = offset; this.duration = duration }
  stop(at = 0) { this.stopAt = at; if (at <= Context.current.currentTime) this.stopped = true }
}
class Context {
  static current: Context
  currentTime = 10; state = 'running'; destination = {}
  constructor() { Context.current = this }
  resume() { this.state = 'running'; return Promise.resolve() }
  suspend() { this.state = 'suspended'; return Promise.resolve() }
  createGain() { const g = gain(); gains.push(g); return g }
  createBuffer(_channels: number, length: number, rate: number) { return { duration: length / rate, kind: 'embedded-tap', getChannelData: () => new Float32Array(length) } }
  createBufferSource() { const source = new Source(); sources.push(source); return source }
  createOscillator() { oscillatorCount++; return { frequency: param(), connect: () => gain(), disconnect() {}, start() {}, stop() {}, onended: null } }
  decodeAudioData(data: ArrayBuffer) { const kind = new TextDecoder().decode(data); return Promise.resolve({ duration: kind.includes('/music/') ? 20 : 5, kind }) }
}
let release: (() => void) | undefined, releaseWin: (() => void) | undefined, delay = '', delayWin = true
const doc = { hidden: false }
const tick = async () => { for (let n = 0; n < 8; n++) await Promise.resolve() }
for (const [key, value] of Object.entries({
  AudioContext: Context, document: doc,
  localStorage: { getItem: (key: string) => settings.get(key) ?? null, setItem: (key: string, value: string) => settings.set(key, value) },
  setTimeout: (callback: () => void, ms: number) => { const id = ++timerId; timers.set(id, { callback, ms }); return id },
  clearTimeout: (id: number) => timers.delete(id),
  fetch: async (url: string) => {
    if (url === delay) await new Promise<void>((resolve) => { release = resolve })
    if (url === RESULT_CLIPS.win && delayWin) await new Promise<void>((resolve) => { releaseWin = resolve })
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer }
  },
})) Object.defineProperty(globalThis, key, { configurable: true, value })
const sound = await import('../src/sound.ts'), music = await import('../src/music.ts')
const lastMusic = () => sources.filter((s) => s.loop).at(-1)!
try {
  assert.deepEqual(MUSIC_PLAYLISTS.menu, ['sky-puzzle', 'puzzle-dreams'])
  assert.deepEqual(MUSIC_PLAYLISTS.relax, ['puzzle-game-3', 'cool-puzzler'])
  assert.strictEqual(MUSIC_PLAYLISTS.expert, MUSIC_PLAYLISTS.battle)
  for (const screen of ['landing', 'login', 'intro', 'howto', 'pre', 'modes', 'ranking', 'settings']) assert.equal(musicSceneForScreen(screen), 'menu')
  for (const mode of ['relax', 'expert', 'battle']) { assert.equal(musicSceneForScreen(mode), mode); assert.equal(musicSceneForScreen({ level: mode + '-1' }), mode) }
  sound.sfx.tap()
  assert.equal(sources.at(-1)!.buffer?.kind, 'embedded-tap', 'first click works before downloads')
  assert.equal(sources.at(-1)!.duration, SOUND_BANK.tap.duration)
  sound.setSoundOn(false); sound.setSoundOn(true)
  const warming = sound.warmSoundEffects()
  await tick()
  await music.startMusic()
  assert.equal(lastMusic().buffer?.kind, MUSIC_TRACKS['sky-puzzle'].src)
  music.nextMusicTrack(); await tick()
  assert.equal(lastMusic().buffer?.kind, MUSIC_TRACKS['puzzle-dreams'].src)
  assert.ok(sources[0].stopAt > Context.current.currentTime, 'crossfade schedules the outgoing song stop')
  const selected = lastMusic()
  Context.current.currentTime += 2.5
  const cancelLoading = sound.sfx.win()
  assert.equal(selected.stopped, true)
  assert.equal(sound.resultSoundPlaying(), true)
  const whileLoading = sources.length
  await music.startMusic()
  assert.equal(sources.length, whileLoading, 'music stays paused while a result loads')
  cancelLoading(); await tick()
  assert.equal(lastMusic().offset, 2.5)
  assert.ok(releaseWin)
  delayWin = false; releaseWin!(); await warming
  assert.ok(sources.every((source) => source.buffer?.kind !== RESULT_CLIPS.win), 'cancelled loading never starts a stale result')
  const stopResult = sound.sfx.win()
  assert.equal(sources.at(-1)!.buffer?.kind, RESULT_CLIPS.win)
  assert.equal(sources.at(-1)!.loop, false)
  assert.equal(sources.at(-1)!.offset, 0)
  assert.equal(sources.at(-1)!.duration, 0, 'the full supplied recording is played')
  const sourceCount = sources.length, notes = oscillatorCount
  await music.startMusic(); sound.sfx.tap(); sound.sfx.wrong()
  assert.equal(sources.length, sourceCount); assert.equal(oscillatorCount, notes)
  stopResult(); await tick()
  assert.equal(lastMusic().offset, 2.5, 'result cue resumes the same song at its saved position')
  const stopLoss = sound.sfx.lose(), loss = sources.at(-1)!
  assert.equal(loss.buffer?.kind, RESULT_CLIPS.lose)
  stopResult(); assert.equal(sound.resultSoundPlaying(), true, 'older cleanup cannot stop the new result')
  Context.current.currentTime += 3.08
  loss.onended!(); await tick()
  assert.equal(sound.resultSoundPlaying(), false)
  assert.equal(lastMusic().offset, 2.5, 'recording duration does not advance paused music')
  stopLoss()
  const menuGain = gains.at(-1)!.gain.value
  const releaseFocus = music.focusMusic(), releaseSecond = music.focusMusic()
  assert.ok(gains.at(-1)!.gain.value < menuGain)
  releaseFocus(); releaseFocus(); assert.ok(gains.at(-1)!.gain.value < menuGain)
  releaseSecond(); assert.equal(gains.at(-1)!.gain.value, menuGain)
  music.setMusicScene('expert'); await tick()
  assert.equal(lastMusic().buffer?.kind, MUSIC_TRACKS['hypnotic-puzzle-3'].src)
  const count = sources.length
  music.setMusicScene('battle'); await tick(); assert.equal(sources.length, count)
  Context.current.currentTime += 19.5
  const timer = [...timers.values()].at(-1)!; timer.callback(); await tick()
  assert.equal(music.getMusicTrack(), 'mind-bender', 'automatically rotates the selected pair')
  music.setMusicOn(false); const mutedCount = sources.length
  await music.startMusic(); assert.equal(sources.length, mutedCount)
  delay = MUSIC_TRACKS['puzzle-game-3'].src
  music.setMusicScene('relax'); music.setMusicOn(true); await tick()
  assert.ok(release)
  music.setMusicScene('menu'); await tick()
  const latest = lastMusic(); release!(); await tick()
  assert.equal(lastMusic(), latest, 'late mode download cannot replace the current scene')
  music.setMusicVolume(0); assert.equal(lastMusic().stopped, true)
  music.setMusicVolume(.5); await tick()
  music.setMusicVolume(9); assert.equal(music.musicVolume(), 1)
  Context.current.currentTime += .1
  const beforeTap = sources.length
  sound.sfx.tap(); assert.equal(sources.length - beforeTap, 1, 'one sampled button click')
  assert.equal(sources.at(-1)!.buffer?.kind, '/sounds/puzzle-kit.wav')
  assert.equal(sources.at(-1)!.duration, SOUND_BANK.tap.duration)
  Context.current.currentTime += .1; sound.sfx.clue()
  assert.equal(sources.at(-1)!.offset, SOUND_BANK.clue.offset)
  assert.equal(sources.at(-1)!.duration, SOUND_BANK.clue.duration)
  sound.setSoundVolume(0); const quietSources = sources.length; sound.sfx.right(); assert.equal(sources.length, quietSources)
  sound.setSoundVolume(.65); sound.setSoundOn(false)
  const soundCount = sources.length; sound.sfx.win()(); assert.equal(sources.length, soundCount)
  assert.equal(oscillatorCount, 0, 'rejected oscillator effects are removed')
  assert.equal(music.musicOn(), true, 'sound and music switches stay independent')
  doc.hidden = true; music.stopMusic(); await music.startMusic(); assert.equal(lastMusic().stopped, true)
  doc.hidden = false; Context.current.state = 'suspended'
  await music.startMusic(); await tick()
  assert.equal(Context.current.state, 'running')
  assert.ok(timers.size > 0, 'foreground playback re-arms song rotation')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Blocked') } })
  music.setMusicOn(false); assert.equal(music.musicOn(), false)
  console.log('✓ Selected playlists, rotation/crossfades, stale loads, result resume, focus/mute/volume, recorded win/loss, loading cancellation and sampled cue spans')
} finally {
  music.stopMusic(); sound.setSoundOn(false)
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) }
}
