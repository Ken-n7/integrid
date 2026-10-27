import { Art } from './Art.tsx'
import { Icon } from './ui.tsx'
import { OfflineStatus } from './LoadingScreen.tsx'

export function Landing({ onStart, onIntent }: { onStart: () => void; onIntent?: () => void }) {
  const sample = ['−3', '+', '?', '=', '2', null, null, '×', null, null, null, null, '2', null, null, null, null, '=', null, null, null, null, '10', null, null]
  return (
    <main className="screen landing start-screen" tabIndex={-1}>
      <p className="start-brand"><Art name="puzzle" size={24} />YOUR INTEGER ADVENTURE</p>
      <div className="start-illustration" aria-hidden="true">
        <span className="start-spark one"><Art name="star" /></span><span className="start-spark two"><Art name="leaf" /></span>
        <div className="start-grid">{sample.map((value, i) => <span key={i} className={value === null ? 'empty' : value === '?' ? 'answer' : ''}>{value}</span>)}</div>
        <span className="start-award"><Art name="medal" /></span>
      </div>
      <div className="start-copy"><h1>INTEGRID <span>IN ACTION</span></h1><p>A Math Crossword Adventure!</p><small>Learn the signs. Solve the grid. Build your skills.</small></div>
      <div className="start-operations" aria-label="Addition, subtraction, multiplication and division"><span>+</span><span>−</span><span>×</span><span>÷</span></div>
      <button className="start" onPointerEnter={onIntent} onFocus={onIntent} onClick={onStart}><Art name="controller" size={28} />LET’S START!<Icon name="next" /></button>
      <p className="start-note">Your next challenge starts with one box.</p>
      <OfflineStatus />
    </main>
  )
}

