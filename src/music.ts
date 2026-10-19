// Background music: "Swinging Sweet" by hernandack (CC0, opengameart.org/content/short-loops-background-music-pack).
// To change the track, drop another loop in public/music/ and change SRC.
// Played with Web Audio, which loops without a gap. Settings has the on/off switch.
import { audio } from './sound.ts'

const SRC = '/music/swinging-sweet.ogg'
const VOLUME = 0.18 // the file is mastered loud (−11 LUFS): this sits it under the sound effects
const KEY = 'integrid:music'
let buffer: Promise<AudioBuffer> | null = null
let playing: AudioBufferSourceNode | null = null
let starting = false
let wanted = false // false once stopMusic() runs, even while the file is still loading

export function musicOn() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}
export function setMusicOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // blocked storage: the switch just won't be remembered
  }
  if (on) void startMusic()
  else stopMusic()
}

// Safe to call on every tap: does nothing if it's already playing or switched off.
export async function startMusic() {
  if (playing || starting || !musicOn()) return
  const ctx = audio()
  if (!ctx) return
  starting = true
  wanted = true
  try {
    buffer ??= fetch(SRC)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
    const buf = await buffer
    if (!musicOn() || !wanted) return // switched off, or the student app closed (admin page), while it loaded
    const gain = ctx.createGain()
    gain.gain.value = VOLUME
    gain.connect(ctx.destination)
    playing = ctx.createBufferSource()
    playing.buffer = buf
    playing.loop = true
    playing.connect(gain)
    playing.start()
  } catch {
    buffer = null // offline before it was saved, or the phone can't play it: no music, the game still works
  } finally {
    starting = false
  }
}

export function stopMusic() {
  wanted = false
  playing?.stop()
  playing = null
}
