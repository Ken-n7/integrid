// Offline-rendered sampled instruments: FluidSynth + Spotify Pedalboard.
// Source, pinned recipes and license: scripts/audio/ and public/sounds/README.md.
import { SOUND_BANK, TAP_PCM, TAP_SAMPLE_RATE } from './soundBank.generated.ts'
export type SoundCue = keyof typeof SOUND_BANK
export const SOUND_PALETTE = SOUND_BANK
export const cueDuration = (cue: SoundCue) => SOUND_BANK[cue].duration
let bank: AudioBuffer | null = null, tap: AudioBuffer | null = null
let loading: Promise<void> | null = null, retryAt = 0

export function preloadSoundPalette(ctx: BaseAudioContext) {
  if (bank || Date.now() < retryAt) return Promise.resolve()
  if (loading) return loading
  loading = (async () => {
    const response = await fetch('/sounds/puzzle-kit.wav', { signal: AbortSignal.timeout(6000) })
    if (!response.ok) throw new Error('Sound bank unavailable')
    const decoded = await ctx.decodeAudioData(await response.arrayBuffer())
    const last = SOUND_BANK.finish
    if (decoded.duration < last.offset + last.duration - .001) throw new Error('Incomplete sound bank')
    bank = decoded
  })().catch(() => { retryAt = Date.now() + 30000 }).finally(() => { loading = null })
  return loading
}
function immediateTap(ctx: BaseAudioContext) {
  if (tap) return tap
  // Same rendered click as the bank. Available on the very first gesture, even offline
  // before a fetch/decode finishes. Never schedule a delayed click after a download.
  const bytes = Uint8Array.from(atob(TAP_PCM), (c) => c.charCodeAt(0)), pcm = new DataView(bytes.buffer)
  tap = ctx.createBuffer(1, bytes.length / 2, TAP_SAMPLE_RATE)
  const samples = tap.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.getInt16(i * 2, true) / 32768
  return tap
}
export function scheduleCue(ctx: BaseAudioContext, destination: AudioNode, cue: SoundCue, onEnd: () => void = () => {}) {
  const source = ctx.createBufferSource(), gain = ctx.createGain()
  const span = bank ? SOUND_BANK[cue] : { offset: 0, duration: SOUND_BANK.tap.duration }
  source.buffer = bank ?? immediateTap(ctx)
  source.connect(gain).connect(destination)
  let stopped = false, ended = false
  source.onended = () => {
    if (ended) return
    ended = true
    source.disconnect(); gain.disconnect()
    if (!stopped) onEnd()
  }
  source.start(0, span.offset, span.duration)
  return () => {
    if (stopped || ended) return
    stopped = true
    gain.gain.cancelAndHoldAtTime(ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + .012)
    try { source.stop(ctx.currentTime + .015) } catch { /* already ended */ }
  }
}
