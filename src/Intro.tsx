import { INTRO } from './content.ts'
import { Guide } from './Guide.tsx'
import { Deco } from './ui.tsx'
import { Art } from './Art.tsx'

// No timers or reading gates: students choose when to move on or revisit a card.
export function Intro({ step, onStep, replay, onBack, onDone }: {
  step: number
  onStep: (step: number) => void
  replay: boolean
  onBack: () => void
  onDone: () => void
}) {
  const card = INTRO[step]
  const last = step === INTRO.length - 1
  return (
    <Guide
      label="Adventure Intro" steps={INTRO} step={step} onStep={onStep} onBack={onBack}
      backLabel={replay ? 'Back to settings' : 'Back to start'} navLabel="Intro cards"
      className={`intro-${step}`} title={card.title} art={<IntroArt step={step} />}
      onNext={() => last ? onDone() : onStep(step + 1)}
      nextLabel={last && replay ? 'Back to settings' : card.action}
      nextNote={last ? replay ? 'Your adventure is always here to revisit.' : 'Next: How to Play' : 'Take your time. Go at your own pace.'}
    >
      <p className="intro-lead">{card.lead}</p>
      {card.text && <p className={step === 1 ? 'intro-mission' : 'intro-copy'}>{card.text}</p>}
      {last && replay && <p className="intro-replay-finale">{card.action}</p>}
    </Guide>
  )
}

function IntroArt({ step }: { step: number }) {
  if (step === 0) return (
    <div className="intro-art intro-crossword" role="img" aria-label="Integer crossword: negative three plus five equals two.">
      <div className="intro-operations" aria-hidden="true">
        {['+', '−', '×', '÷'].map((op, i) => <span key={op} className={`intro-op op-${i}`}>{op}</span>)}
      </div>
      <div className="intro-equation" aria-hidden="true">
        {['−3', '+', '5', '=', '2'].map((cell, i) => <span key={i} className={i === 4 ? 'intro-answer' : ''}>{cell}</span>)}
      </div>
    </div>
  )
  if (step === 1) return (
    <ol className="intro-art intro-route" aria-label="Your adventure path">
      {[
        { icon: '🧩', text: 'Solve puzzles' },
        { icon: '🗺️', text: 'Unlock levels' },
        { icon: '🏅', text: 'Earn titles' },
      ].map((item) => <li key={item.text}><Deco>{item.icon}</Deco><b>{item.text}</b></li>)}
    </ol>
  )
  return (
    <div className="intro-art intro-goal">
      <span className="intro-star" aria-hidden="true"><Art name="star" /></span>
      <p className="eyebrow">Your goal</p>
      <p className="intro-legend">INTEGRID Legend</p>
    </div>
  )
}
