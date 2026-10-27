import { audioPreference, audioVolume, saveAudioPreference } from './audioPreferences.ts'
import { preloadSoundPalette, scheduleCue, type SoundCue } from './soundPalette.ts'
const KEY = 'integrid:sound', VOLUME_KEY = 'integrid:sound-volume'
let ctx: AudioContext | null = null, effects: GainNode | null = null
let feedback: (() => void) | null = null, feedbackCue: SoundCue | null = null
let stopResult: (() => void) | null = null, lastQuiet = -Infinity
const resultListeners = new Set<(playing: boolean) => void>()
export const resultSoundPlaying = () => stopResult !== null
export function onResultSound(listener: (playing: boolean) => void) { resultListeners.add(listener); return () => { resultListeners.delete(listener) } }
export const soundOn = () => audioPreference(KEY) !== 'off'
export const soundVolume = () => audioVolume(VOLUME_KEY, .65)
function cancelFeedback() { feedback?.(); feedback = null; feedbackCue = null }
export function setSoundOn(on: boolean) {
  saveAudioPreference(KEY, on ? 'on' : 'off')
  if (!on) { cancelFeedback(); stopResult?.() }
}
export function setSoundVolume(value: number) {
  saveAudioPreference(VOLUME_KEY, String(Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .65))
  if (effects && ctx) effects.gain.setTargetAtTime(soundVolume(), ctx.currentTime, .02)
  if (soundVolume() === 0) { cancelFeedback(); stopResult?.() }
}
export function audio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended' && !document.hidden) void ctx.resume().catch(() => {})
    return ctx
  } catch { return null }
}
export function pauseAudio(paused: boolean) {
  if (paused) cancelFeedback()
  void (paused ? ctx?.suspend() : ctx?.resume())?.catch(() => {})
}
// Preload once; a small embedded sample covers the first click while decoding.
export function warmSoundEffects() {
  const context = audio()
  if (context) return preloadSoundPalette(context)
}
function output(context: AudioContext) {
  if (!effects) { effects = context.createGain(); effects.gain.value = soundVolume(); effects.connect(context.destination) }
  return effects
}
function play(cue: SoundCue) {
  if (!soundOn() || soundVolume() === 0 || resultSoundPlaying() || document.hidden) return
  const context = audio()
  if (!context) return
  const quiet = cue === 'tap' || cue === 'select'
  if (quiet && (context.currentTime - lastQuiet < .04 || (feedbackCue && feedbackCue !== 'tap' && feedbackCue !== 'select'))) return
  if (quiet) lastQuiet = context.currentTime
  cancelFeedback()
  feedbackCue = cue
  const stop = scheduleCue(context, output(context), cue, () => { if (feedback === stop) { feedback = null; feedbackCue = null } })
  feedback = stop
}
function playResult(cue: 'win' | 'lose' | 'finish') {
  stopResult?.()
  if (!soundOn() || soundVolume() === 0 || document.hidden) return () => {}
  const context = audio()
  if (!context) return () => {}
  cancelFeedback()
  let cancel: (() => void) | null = null
  const stop = () => {
    if (stopResult !== stop) return
    stopResult = null
    cancel?.()
    for (const listener of resultListeners) listener(false)
  }
  stopResult = stop
  for (const listener of resultListeners) listener(true)
  cancel = scheduleCue(context, output(context), cue, stop)
  return stop
}
export const sfx = {
  tap: () => play('tap'), select: () => play('select'), right: () => play('right'), wrong: () => play('wrong'),
  hint: () => play('hint'), undo: () => play('undo'), clue: () => play('clue'), start: () => play('start'),
  win: () => playResult('win'), lose: () => playResult('lose'), finish: () => playResult('finish'),
}
