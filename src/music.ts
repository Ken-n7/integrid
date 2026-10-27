import { audio, onResultSound, resultSoundPlaying } from './sound.ts'
import { audioPreference, audioVolume, saveAudioPreference } from './audioPreferences.ts'
import { MUSIC_PLAYLISTS, MUSIC_TRACKS, type MusicScene, type MusicTrack } from './musicPlaylists.ts'

const KEY = 'integrid:music', VOLUME_KEY = 'integrid:music-volume'
const VOLUME = .32, FADE = .65
let scene: MusicScene = 'menu'
let selected: MusicTrack = MUSIC_PLAYLISTS.menu[0]
let wanted = false, version = 0, offset = 0, focusHolds = 0
let loading: { id: MusicTrack; version: number } | null = null
let rotation: ReturnType<typeof setTimeout> | undefined
const buffers = new Map<MusicTrack, AudioBuffer>()
const pending = new Map<MusicTrack, Promise<AudioBuffer>>()
const failedUntil = new Map<MusicTrack, number>()
const listeners = new Set<() => void>()
type Voice = { id: MusicTrack; source: AudioBufferSourceNode; gain: GainNode; ctx: AudioContext; at: number; offset: number }
let playing: Voice | null = null
const retiring = new Set<Voice>()

export const musicOn = () => audioPreference(KEY) !== 'off'
export const musicVolume = () => audioVolume(VOLUME_KEY, .45)
export const getMusicTrack = () => selected
export function subscribeMusic(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
function notify() { for (const listener of listeners) listener() }
function level() { return VOLUME * musicVolume() * (focusHolds > 0 ? .32 : 1) }
function updateLevel() {
  if (!playing) return
  const param = playing.gain.gain, now = playing.ctx.currentTime
  param.cancelScheduledValues(now)
  param.setTargetAtTime(level(), now, .08)
}
export function focusMusic() {
  focusHolds++
  updateLevel()
  let held = true
  return () => { if (held) { held = false; focusHolds--; updateLevel() } }
}
export function setMusicVolume(value: number) {
  saveAudioPreference(VOLUME_KEY, String(Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .45))
  if (musicVolume() === 0) pausePlaying()
  else { updateLevel(); if (wanted) void startMusic() }
}
export function setMusicOn(on: boolean) {
  saveAudioPreference(KEY, on ? 'on' : 'off')
  if (on) void startMusic()
  else stopMusic()
}
export function setMusicScene(next: MusicScene) {
  const samePlaylist = MUSIC_PLAYLISTS[scene] === MUSIC_PLAYLISTS[next]
  scene = next
  if (samePlaylist) return // Expert and Battle share a playlist; carry on without restarting.
  choose(MUSIC_PLAYLISTS[next][0])
}
function choose(id: MusicTrack) {
  if (id === selected) return
  selected = id
  offset = 0
  version++
  clearTimeout(rotation)
  notify()
  if (wanted) void startMusic()
}
export function nextMusicTrack() {
  const list = MUSIC_PLAYLISTS[scene]
  choose(list[(list.indexOf(selected) + 1) % list.length])
}
async function loadTrack(id: MusicTrack, ctx: AudioContext): Promise<AudioBuffer> {
  const cached = buffers.get(id)
  if (cached) { buffers.delete(id); buffers.set(id, cached); return cached }
  const existing = pending.get(id)
  if (existing) return existing
  if ((failedUntil.get(id) ?? 0) > Date.now()) throw new Error('Music retry cooldown')
  const promise = (async () => {
    const response = await fetch(MUSIC_TRACKS[id].src, { signal: AbortSignal.timeout(12000) })
    if (!response.ok) throw new Error('Music unavailable')
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('Invalid music')
    buffers.set(id, buffer)
    // Three decoded songs at most. Compressed files remain available in the offline cache.
    while (buffers.size > 3) buffers.delete(buffers.keys().next().value!)
    return buffer
  })().catch((error: unknown) => { failedUntil.set(id, Date.now() + 30000); throw error }).finally(() => { pending.delete(id) })
  pending.set(id, promise)
  return promise
}
function destroy(voice: Voice) {
  voice.source.onended = null
  try { voice.source.stop() } catch { /* already ended */ }
  voice.source.disconnect()
  voice.gain.disconnect()
  retiring.delete(voice)
}
function pausePlaying() {
  version++
  clearTimeout(rotation)
  if (playing) {
    if (playing.id === selected) offset = (playing.offset + playing.ctx.currentTime - playing.at) % playing.source.buffer!.duration
    destroy(playing)
    playing = null
  }
  for (const voice of retiring) destroy(voice)
}
function armRotation(minimumDelay = 0) {
  clearTimeout(rotation)
  if (!playing || document.hidden || playing.ctx.state !== 'running') return
  const voice = playing
  const duration = voice.source.buffer!.duration
  const elapsed = (voice.offset + voice.ctx.currentTime - voice.at) % duration
  const remaining = Math.max(.05, duration - elapsed - FADE)
  rotation = setTimeout(() => {
    if (playing !== voice || document.hidden || voice.ctx.state !== 'running') return
    // A suspended AudioContext must never advance a playlist on wall-clock time.
    const actual = (voice.offset + voice.ctx.currentTime - voice.at) % duration
    if (actual < duration - FADE - .1) { armRotation(); return }
    nextMusicTrack()
  }, Math.max(minimumDelay, remaining) * 1000)
}
// Called after a user gesture, scene change, or result cue. Stale loads never start playback.
export async function startMusic() {
  if (!musicOn()) return
  wanted = true
  if (document.hidden || musicVolume() === 0 || resultSoundPlaying()) return
  const ctx = audio()
  if (!ctx) return
  if (playing?.id === selected) {
    if (ctx.state === 'suspended') void ctx.resume().then(() => { if (wanted) armRotation() }).catch(() => {})
    else armRotation()
    return
  }
  if (loading?.id === selected && loading.version === version) return
  const request = { id: selected, version }
  loading = request
  try {
    const buffer = await loadTrack(request.id, ctx)
    if (ctx.state === 'suspended' && !document.hidden) await ctx.resume()
    if (request.version !== version || request.id !== selected || !wanted || !musicOn() || musicVolume() === 0 || document.hidden || resultSoundPlaying()) return
    const source = ctx.createBufferSource(), gain = ctx.createGain()
    source.buffer = buffer
    source.loop = true // the current song keeps looping if the next download fails
    source.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(level(), ctx.currentTime + FADE)
    const previous = playing
    playing = { id: selected, source, gain, ctx, at: ctx.currentTime, offset }
    source.start(0, offset % buffer.duration)
    if (previous) {
      for (const voice of retiring) destroy(voice)
      retiring.add(previous)
      previous.gain.gain.cancelScheduledValues(ctx.currentTime)
      previous.gain.gain.setValueAtTime(previous.gain.gain.value, ctx.currentTime)
      previous.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE)
      previous.source.onended = () => destroy(previous)
      previous.source.stop(ctx.currentTime + FADE + .02)
    }
    armRotation()
    const list = MUSIC_PLAYLISTS[scene]
    void loadTrack(list[(list.indexOf(selected) + 1) % list.length], ctx).catch(() => {})
  } catch {
    // Continue the existing loop offline. A later gesture or loop boundary can retry.
    armRotation(30)
  } finally {
    if (loading === request) loading = null
  }
}
export function stopMusic() { wanted = false; pausePlaying(); offset = 0 }
onResultSound((active) => {
  if (active) pausePlaying()
  else if (wanted && musicOn()) void startMusic()
})
