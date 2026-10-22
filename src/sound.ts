// Web Audio effects; result clips are bundled and cached for offline play.
// Settings has the on/off switch; it's remembered per phone.
const KEY = 'integrid:sound'
let ctx: AudioContext | null = null
type Outcome = 'win' | 'lose'
const CLIPS: Record<Outcome, string> = { win: '/sounds/level-win.mp3', lose: '/sounds/game-over.mp3' }
const buffers = new Map<Outcome, Promise<AudioBuffer>>()
const tones = new Set<OscillatorNode>()
const resultListeners = new Set<(playing: boolean) => void>()
let stopResult: (() => void) | null = null
let warmed = false

export const resultSoundPlaying = () => stopResult !== null
export function onResultSound(listener: (playing: boolean) => void) {
  resultListeners.add(listener)
}

export function soundOn() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // blocked storage: the switch just won't be remembered
  }
  if (!on) stopResult?.()
}

// One note with a soft start and fade, so it never clicks. `to` slides the pitch.
function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, to?: number) {
  const t = ctx!.currentTime + start
  const o = ctx!.createOscillator()
  const g = ctx!.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx!.destination)
  tones.add(o)
  o.onended = () => { tones.delete(o) }
  o.start(t)
  o.stop(t + dur + 0.02)
}

// One audio context for effects and music. Made on the first tap: browsers only allow sound after one.
export function audio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended' && !document.hidden) void ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null // no audio on this device: the blinks still show what happened
  }
}

// App in the background (another app, screen off): silence everything until it's back.
export function pauseAudio(paused: boolean) {
  void (paused ? ctx?.suspend() : ctx?.resume())?.catch(() => {})
}

function play(notes: () => void) {
  if (!resultSoundPlaying() && soundOn() && audio()) notes()
}

function loadClip(kind: Outcome, context: AudioContext) {
  let buffer = buffers.get(kind)
  if (!buffer) {
    buffer = (async () => {
      const controller = new AbortController()
      let timeout: ReturnType<typeof setTimeout>
      const expired = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new Error('Sound timed out'))
        }, 5000)
      })
      try {
        return await Promise.race([expired, (async () => {
          const response = await fetch(CLIPS[kind], { signal: controller.signal })
          if (!response.ok) throw new Error('Sound unavailable')
          return await context.decodeAudioData(await response.arrayBuffer())
        })()])
      } finally {
        clearTimeout(timeout!)
      }
    })().catch((error: unknown) => {
      buffers.delete(kind) // the next result can retry a failed download
      throw error
    })
    buffers.set(kind, buffer)
  }
  return buffer
}

// Start loading on the first tap, before a level finishes. Failures are handled again at playback.
export function warmSoundEffects() {
  if (!soundOn()) return
  const context = audio()
  if (!context || warmed) return // a later tap can still unlock a suspended result sound
  warmed = true
  for (const kind of ['win', 'lose'] as const) void loadClip(kind, context).catch(() => {})
}

function playResult(kind: Outcome): () => void {
  stopResult?.()
  if (!soundOn() || !audio()) return () => {}
  const context = ctx!
  let source: AudioBufferSourceNode | null = null
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    if (stopResult !== stop) return
    stopResult = null
    clearTimeout(fallbackTimer)
    if (source) {
      source.onended = null
      try { source.stop() } catch { /* a source that failed to start is already silent */ }
    }
    for (const oscillator of tones) {
      try { oscillator.stop() } catch { /* an ended note is already silent */ }
    }
    tones.clear()
    for (const listener of resultListeners) listener(false)
  }
  stopResult = stop
  for (const oscillator of tones) {
    try { oscillator.stop() } catch { /* already ended */ }
  }
  tones.clear()
  for (const listener of resultListeners) listener(true)
  void loadClip(kind, context).then((buffer) => {
    if (stopResult !== stop) return // left or restarted while the sound was loading
    source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.onended = stop
    source.start()
  }).catch(() => {
    if (stopResult !== stop) return
    // Missing, offline or undecodable clip: a short generated effect keeps the game usable.
    const notes = kind === 'win' ? [523.25, 659.25, 783.99, 1046.5] : [392, 330, 262, 196]
    notes.forEach((note, i) => tone(note, i * 0.13, 0.3, 'triangle', 0.13))
    fallbackTimer = setTimeout(stop, 900)
  })
  return stop
}

export const sfx = {
  win: () => playResult('win'),
  lose: () => playResult('lose'),
  right: () => play(() => (tone(660, 0, 0.12, 'sine', 0.25), tone(990, 0.08, 0.2, 'sine', 0.25))), // rising "ding-ding"
  wrong: () => play(() => tone(220, 0, 0.28, 'triangle', 0.3, 140)), // short low "bwomp"
}
