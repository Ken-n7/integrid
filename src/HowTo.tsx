import { useRef, useState, type Ref } from 'react'
import { HOW_TO, SIGN_RULES } from './content.ts'
import { Guide } from './Guide.tsx'
import { HEARTS, MODES, START_COINS } from './rules.ts'
import { Coins, Deco, Dialog, Num } from './ui.tsx'
import { Art } from './Art.tsx'

export function HowTo({ step, onStep, replay, preDone, onBack, onDone }: {
  step: number
  onStep: (step: number) => void
  replay: boolean
  preDone: boolean
  onBack: () => void
  onDone: () => void
}) {
  const card = HOW_TO[step]
  const last = step === HOW_TO.length - 1
  return (
    <Guide
      label="How to Play" steps={HOW_TO} step={step} onStep={onStep} onBack={onBack}
      backLabel={replay ? 'Back to settings' : 'Back to start'}
      className={`tutorial tutorial-${step}`} title={card.title}
      onNext={() => last ? onDone() : onStep(step + 1)}
      nextLabel={last && replay ? 'Back to settings' : card.action}
      nextNote={last ? replay ? 'Come back whenever you need a reminder.' : preDone ? 'Next: Choose Your Adventure' : 'Next: Pre-Assessment · 5 questions' : 'Go at your own pace. Try the examples!'}
    >
      <p className="tutorial-copy">{card.text.includes('🥧') ? <>{card.text.replace('🥧', '')}<Deco>🥧</Deco></> : card.text}</p>
      {step === 0 && <GridExample />}
      {step === 1 && <RulesExample />}
      {step === 2 && <BankPractice />}
      {step === 3 && <LivesExample />}
      {step === 4 && <HelpPractice />}
    </Guide>
  )
}

function GridExample() {
  const cells = [
    -3, '+', '?', '=', 2,
    null, null, '−', null, null,
    null, null, '?', null, null,
    null, null, '=', null, null,
    null, null, 8, null, null,
  ]
  return (
    <div className="tutorial-visual">
      <div className="tutorial-crossword" role="img" aria-label="Example crossword with two yellow answer boxes. Across: negative three plus the top box equals two. Down: the top box minus the lower box equals eight.">
        {cells.map((cell, i) => <span key={i} className={cell === null ? 'tutorial-gap' : `tutorial-cell${cell === '?' ? ' tutorial-yellow' : ''}`} aria-hidden="true">{typeof cell === 'number' ? <Num v={cell} /> : cell}</span>)}
      </div>
      <p className="tutorial-tip"><span className="tutorial-key" aria-hidden="true" /> Yellow boxes are yours to fill.</p>
    </div>
  )
}

function RulesExample() {
  return (
    <div className="tutorial-visual">
      <div className="tutorial-operations" aria-hidden="true">
        {['+', '−', '×', '÷'].map((op, i) => <span key={op} className={`intro-op op-${i}`}>{op}</span>)}
      </div>
      <section className="tutorial-rule">
        <h2>Addition with different signs</h2>
        <p className="tutorial-math" role="img" aria-label="Negative three plus five equals positive two."><span aria-hidden="true"><Num v={-3} /> + 5 = <b>2</b></span></p>
        <p>{SIGN_RULES[0].groups[1].text}</p>
      </section>
      <p className="tutorial-tip">Check the operation. Then check the signs.</p>
    </div>
  )
}

function Equation({ answer, selected = false, onSelect, hinted = false, boxRef }: { answer?: number; selected?: boolean; onSelect?: () => void; hinted?: boolean; boxRef?: Ref<HTMLButtonElement> }) {
  const label = answer === undefined ? 'Yellow box: negative three plus this box equals two' : `Answer box: ${answer}`
  const state = answer === undefined ? 'tutorial-yellow' : hinted ? 'tutorial-hinted' : 'tutorial-solved'
  return (
    <div className="tutorial-equation" role="group" aria-label="Negative three plus the answer box equals two">
      <span className="tutorial-cell" aria-hidden="true"><Num v={-3} /></span>
      <span className="tutorial-cell" aria-hidden="true">+</span>
      {onSelect ? (
        <button ref={boxRef} className={`tutorial-cell ${state}`} aria-label={label} aria-pressed={selected} disabled={answer !== undefined} onClick={onSelect}>{answer ?? '?'}</button>
      ) : (
        <span className={`tutorial-cell ${state}`} role="img" aria-label={label}>{answer ?? '?'}</span>
      )}
      <span className="tutorial-cell" aria-hidden="true">=</span>
      <span className="tutorial-cell" aria-hidden="true">2</span>
    </div>
  )
}

function BankPractice() {
  const [selected, setSelected] = useState(false)
  const [solved, setSolved] = useState(false)
  const [message, setMessage] = useState('1. Tap the yellow box.')
  const tile = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLButtonElement>(null)
  const reset = useRef<HTMLButtonElement>(null)
  return (
    <section className="tutorial-visual tutorial-practice" aria-label="Try the number bank">
      <p className="tutorial-badge">Your turn · practice only</p>
      <Equation boxRef={box} answer={solved ? 5 : undefined} selected={selected} onSelect={() => {
        setSelected(true)
        setMessage('2. Now tap 5 in the number bank.')
        tile.current?.focus()
      }} />
      <div className="tutorial-bank">
        <p className="eyebrow">Number bank</p>
        <button ref={tile} className="tutorial-tile" aria-label="Place 5" disabled={solved} onClick={() => {
          if (!selected) return setMessage('Tap the yellow box first. Then choose a number.')
          setSolved(true)
          setSelected(false)
          setMessage('You did it! The box turns green and the number is used up.')
          requestAnimationFrame(() => reset.current?.focus())
        }}>5{solved && <span className="tutorial-used" aria-hidden="true"><Art name="check" /></span>}</button>
      </div>
      <p className={`tutorial-feedback${solved ? ' tutorial-success' : ''}`} role="status">{message}</p>
      {solved && <button ref={reset} className="tutorial-reset" onClick={() => {
        setSolved(false)
        setSelected(false)
        setMessage('1. Tap the yellow box.')
        requestAnimationFrame(() => box.current?.focus())
      }}>Try again</button>}
    </section>
  )
}

function LivesExample() {
  const [mistake, setMistake] = useState(false)
  return (
    <section className="tutorial-visual tutorial-lives" aria-label="See how lives work">
      <div className="tutorial-hearts" role="img" aria-label={`${HEARTS - Number(mistake)} of ${HEARTS} lives left`}>
        {Array.from({ length: HEARTS }, (_, i) => <span key={i} aria-hidden="true" className={i === HEARTS - 1 && mistake ? 'art-lost' : undefined}><Art name="heart" /></span>)}
      </div>
      <p className="tutorial-life-count" aria-hidden="true">{HEARTS - Number(mistake)} <span>lives left</span></p>
      <p className="tutorial-feedback" role="status">{mistake ? 'One wrong answer = one heart lost. Keep trying!' : 'Every new try starts with 5 hearts.'}</p>
      <button className="big secondary" onClick={() => setMistake(!mistake)}>{mistake ? 'Reset the example' : 'Show a wrong answer'}</button>
      <p className="tutorial-tip">Run out? Try again with 5 fresh hearts.</p>
    </section>
  )
}

function HelpPractice() {
  const [hinted, setHinted] = useState(false)
  const [rules, setRules] = useState(false)
  const rulesButton = useRef<HTMLButtonElement>(null)
  const cost = MODES.relax.hintCost
  const balance = START_COINS - (hinted ? cost : 0)
  return (
    <section className="tutorial-visual tutorial-help" aria-label="Try Rules and Hint">
      <div className="tutorial-help-bar"><span className="tutorial-badge">Relax example</span><Coins n={balance} /></div>
      <Equation answer={hinted ? 5 : undefined} hinted={hinted} selected={!hinted} />
      <div className="tutorial-help-tools">
        <button ref={rulesButton} className="big secondary" onClick={() => setRules(true)}><Deco>📖</Deco> Rules <small>Free</small></button>
        <button className="big secondary" disabled={balance < cost} onClick={() => setHinted(true)}><Deco>💡</Deco> Hint <small>{cost} coins</small></button>
      </div>
      <p className={`tutorial-feedback${hinted ? ' tutorial-success' : ''}`} role="status">{hinted ? `The hint fills the box and uses ${cost} coins. Hinted boxes turn purple.` : 'Try the buttons: a clue helps you think; a hint fills a box.'}</p>
      {hinted && <button className="tutorial-reset" onClick={() => {
        setHinted(false)
        requestAnimationFrame(() => rulesButton.current?.focus())
      }}>Reset the example</button>}
      <p className="tutorial-tip">Practice only. Your game coins stay saved.</p>
      {rules && <Dialog title="Rules & a free clue" onClose={() => setRules(false)} className="rules-panel relax">
        <p className="tutorial-clue" role="img" aria-label="Negative plus positive equals positive."><span aria-hidden="true">(−) + (+) = (+)</span></p>
        <p>{SIGN_RULES[0].groups[1].text}</p>
        <p className="tutorial-dialog-note">This Relax clue is free. It helps with the signs without filling the box.</p>
        <button className="big" autoFocus onClick={() => setRules(false)}>Got it!</button>
      </Dialog>}
    </section>
  )
}
