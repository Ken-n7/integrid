import { useEffect, useRef } from 'react'
import type { CreateTypes, Options } from 'canvas-confetti'

const COLORS = ['#ffd34e', '#edac29', '#49ad84', '#ef91a4', '#7caee8', '#b991dd']

export function WinConfetti() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = host.current
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    if (!node || motion.matches || document.hidden) return
    let cancelled = false
    let cannon: CreateTypes | undefined
    let canvas: HTMLCanvasElement | undefined
    const timers: ReturnType<typeof setTimeout>[] = []
    const stop = () => {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
      cannon?.reset()
      canvas?.remove()
    }
    const away = () => { if (document.hidden) stop() }
    const motionChanged = () => { if (motion.matches) stop() }
    document.addEventListener('visibilitychange', away)
    motion.addEventListener('change', motionChanged)

    // Load only for a win. A fresh canvas per effect also survives React StrictMode
    // without attempting to transfer an OffscreenCanvas twice.
    void import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled || motion.matches || document.hidden) return
      canvas = document.createElement('canvas')
      canvas.className = 'confetti-canvas'
      node.append(canvas)
      cannon = confetti.create(canvas, { resize: true, useWorker: true, disableForReducedMotion: true })
      const compact = node.clientWidth < 600
      const fire = (options: Options) => cannon?.({
        colors: COLORS,
        shapes: ['square', 'circle'],
        scalar: compact ? .8 : 1,
        decay: .93,
        gravity: 1.05,
        ticks: 190,
        ...options,
      })
      const sides = (count: number, velocity: number, spread: number) => {
        for (const side of [0, 1]) void fire({
          particleCount: count,
          origin: { x: side ? .98 : .02, y: .68 },
          angle: side ? 118 : 62,
          startVelocity: velocity,
          spread,
          drift: side ? -.2 : .2,
        })
      }
      const later = (delay: number, effect: () => void) => {
        timers.push(setTimeout(() => { if (!cancelled && !document.hidden) effect() }, delay))
      }
      // A finite 120-particle sequence on phones, 176 on larger screens.
      sides(compact ? 22 : 34, compact ? 48 : 60, 60)
      later(220, () => sides(compact ? 12 : 16, compact ? 43 : 54, 78))
      later(380, () => { void fire({
        particleCount: compact ? 26 : 36,
        origin: { x: .5, y: -.08 },
        angle: 270,
        spread: 150,
        startVelocity: 18,
        gravity: .8,
        ticks: 165,
        scalar: compact ? .65 : .8,
      }) })
      later(460, () => sides(compact ? 8 : 12, compact ? 36 : 46, 90))
      later(600, () => {
        const finished = fire({
          particleCount: compact ? 10 : 16,
          colors: ['#ffd34e', '#edac29', '#fff0af'],
          shapes: ['star'],
          origin: { x: .5, y: .08 },
          angle: 270,
          spread: 180,
          startVelocity: 12,
          gravity: .7,
          ticks: 145,
          scalar: compact ? .9 : 1.1,
        })
        void finished?.then(() => { if (!cancelled) { cannon?.reset(); canvas?.remove() } })
      })
    }).catch(stop) // A failed optional animation must not block the result screen.

    return () => {
      stop()
      document.removeEventListener('visibilitychange', away)
      motion.removeEventListener('change', motionChanged)
    }
  }, [])

  return <div ref={host} className="confetti" aria-hidden="true" />
}
