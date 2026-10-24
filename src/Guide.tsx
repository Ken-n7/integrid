import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useBack } from './back.ts'
import { focusScreen } from './focus.ts'
import { Deco, Icon } from './ui.tsx'

// The intro and instructions share pacing, navigation, focus and short-phone reading cues.
export function Guide({ label, steps, step, onStep, onBack, backLabel, title, art, children, onNext, nextLabel, nextNote, className = '', navLabel }: {
  label: string
  steps: readonly { label: string }[]
  step: number
  onStep: (step: number) => void
  onBack: () => void
  backLabel: string
  title: string
  art?: ReactNode
  children: ReactNode
  onNext: () => void
  nextLabel: string
  nextNote: string
  className?: string
  navLabel?: string
}) {
  const body = useRef<HTMLDivElement>(null)
  const footer = useRef<HTMLElement>(null)
  const [more, setMore] = useState(false)
  const back = () => step > 0 ? onStep(step - 1) : onBack()
  useBack(back)
  useEffect(() => {
    focusScreen()
    window.scrollTo(0, 0)
  }, [step])
  useEffect(() => {
    const measure = () => {
      if (body.current && footer.current) setMore(body.current.getBoundingClientRect().bottom > footer.current.getBoundingClientRect().top)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(body.current!)
    addEventListener('scroll', measure, { passive: true })
    addEventListener('resize', measure)
    measure()
    return () => {
      observer.disconnect()
      removeEventListener('scroll', measure)
      removeEventListener('resize', measure)
    }
  }, [step])

  return (
    <main className={`screen intro ${className}`} tabIndex={-1}>
      <header className="bar intro-bar">
        <button className="icon" onClick={back} aria-label={step > 0 ? `Previous ${label.toLowerCase()} card` : backLabel}>
          <Icon name="back" />
        </button>
        <span className="eyebrow">{label}</span>
        <span className="intro-count">{step + 1} of {steps.length}</span>
      </header>
      <nav className="intro-steps" aria-label={navLabel ?? `${label} steps`}>
        {steps.map((item, i) => (
          <button key={item.label} aria-current={step === i ? 'step' : undefined} onClick={() => onStep(i)}>
            <span className="intro-step-n" aria-hidden="true">{i + 1}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="intro-card" key={step} ref={body}>
        {art}
        <h1>{title}</h1>
        {children}
      </div>
      <footer className="intro-footer" ref={footer}>
        <button className="big" onClick={onNext}>{nextLabel} <Deco>→</Deco></button>
        <p className="note">{more ? <>Scroll to read more <Deco>↓</Deco></> : nextNote}</p>
      </footer>
    </main>
  )
}
