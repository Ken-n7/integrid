// User-supplied recordings, converted without another lossy encode. See public/sounds/README.md.
export type RecordedResult = 'win' | 'lose'
export const RESULT_CLIPS: Record<RecordedResult, string> = {
  win: '/sounds/level-win.wav',
  lose: '/sounds/game-over.wav',
}
const buffers = new Map<RecordedResult, AudioBuffer>()
const pending = new Map<RecordedResult, Promise<AudioBuffer>>()
const retryAt = new Map<RecordedResult, number>()
export const resultClip = (cue: RecordedResult) => buffers.get(cue)
export function loadResultClip(ctx: BaseAudioContext, cue: RecordedResult): Promise<AudioBuffer> {
  const ready = buffers.get(cue)
  if (ready) return Promise.resolve(ready)
  const loading = pending.get(cue)
  if (loading) return loading
  if (Date.now() < (retryAt.get(cue) ?? 0)) return Promise.reject(new Error('Result retry cooldown'))
  const promise = (async () => {
    const response = await fetch(RESULT_CLIPS[cue], { signal: AbortSignal.timeout(6000) })
    if (!response.ok) throw new Error('Result sound unavailable')
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 15) throw new Error('Invalid result sound')
    buffers.set(cue, buffer)
    return buffer
  })().catch((error: unknown) => { retryAt.set(cue, Date.now() + 30000); throw error }).finally(() => { pending.delete(cue) })
  pending.set(cue, promise)
  return promise
}
export async function preloadResultClips(ctx: BaseAudioContext) {
  await Promise.allSettled((['win', 'lose'] as const).map((cue) => loadResultClip(ctx, cue)))
}
export function scheduleResultClip(ctx: BaseAudioContext, destination: AudioNode, buffer: AudioBuffer, onEnd: () => void) {
  const source = ctx.createBufferSource(), gain = ctx.createGain()
  source.buffer = buffer
  source.connect(gain).connect(destination)
  let stopped = false, ended = false
  source.onended = () => {
    if (ended) return
    ended = true
    source.disconnect(); gain.disconnect()
    if (!stopped) onEnd()
  }
  source.start()
  return () => {
    if (stopped || ended) return
    stopped = true
    gain.gain.cancelAndHoldAtTime(ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + .012)
    try { source.stop(ctx.currentTime + .015) } catch { /* already ended */ }
  }
}
