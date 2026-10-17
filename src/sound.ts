// Sound effects, made in the browser (Web Audio): no files to download, and they work offline.
// Settings has the on/off switch; it's remembered per phone.
const KEY = 'integrid:sound'
let ctx: AudioContext | null = null

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
  o.start(t)
  o.stop(t + dur + 0.02)
}

// One audio context for effects and music. Made on the first tap: browsers only allow sound after one.
export function audio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null // no audio on this device: the blinks still show what happened
  }
}

// App in the background (another app, screen off): silence everything until it's back.
export const pauseAudio = (paused: boolean) => void (paused ? ctx?.suspend() : ctx?.resume())

function play(notes: () => void) {
  if (soundOn() && audio()) notes()
}

export const sfx = {
  right: () => play(() => (tone(660, 0, 0.12, 'sine', 0.25), tone(990, 0.08, 0.2, 'sine', 0.25))), // rising "ding-ding"
  wrong: () => play(() => tone(220, 0, 0.28, 'triangle', 0.3, 140)), // short low "bwomp"
}
