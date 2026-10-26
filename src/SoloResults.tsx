import { useEffect, useRef } from 'react'
import { Art } from './Art.tsx'
import { clock, HEARTS, type Level } from './rules.ts'
import { Dialog, Icon } from './ui.tsx'

export function SoloResults({ level, won, seconds, wrong, hints, earned, ranked, rank, onNext, onRetry, onLevels }: {
  level: Level; won: boolean; seconds: number; wrong: number; hints: number; earned: number; ranked: boolean; rank?: number | null
  onNext: (() => void) | null; onRetry: () => void; onLevels: () => void
}) {
  const summary = useRef<HTMLDivElement>(null)
  useEffect(() => {
    summary.current?.focus({ preventScroll: true })
    const panel = summary.current?.closest<HTMLElement>('.panel')
    if (panel) panel.scrollTop = 0
  }, [])
  return (
    <Dialog title={won ? 'Level complete!' : 'Game over'} className={`solo-results-panel ${level.mode} ${won ? 'won' : 'lost'}`}>
      <div ref={summary} className="solo-result-summary" role="group" aria-label="Your level result" tabIndex={-1}>
        <span className="solo-result-emblem" aria-hidden="true"><Art name={won ? 'trophy' : 'broken-heart'} /></span>
        <p className="solo-result-mode">{level.mode === 'expert' ? 'Expert' : 'Relax'} · Level {level.n}</p>
        <p className="solo-result-level">{level.title}</p>
        {!won && <p className="solo-retry-copy">You ran out of lives. Start a new try with {HEARTS} fresh hearts.</p>}
        <dl className="solo-result-stats">
          <div><dt>Time</dt><dd>{clock(seconds)}</dd></div>
          <div><dt>Wrong answers</dt><dd>{wrong}</dd></div>
          <div><dt>Hints used</dt><dd>{hints}</dd></div>
        </dl>
        {won ? <div className="solo-reward"><Art name="coin" /><span><small>Coins earned</small><b>+{earned}</b></span></div> : <div className="solo-fresh-try"><span>Your next try</span><div role="img" aria-label={`${HEARTS} fresh lives`}>{Array.from({ length: HEARTS }, (_, i) => <Art key={i} name="heart" />)}</div></div>}
        {won && earned === 0 && <p className="solo-retry-copy">You already earned this level’s coin reward. Replays are for practice and improving your best time.</p>}
        {won && ranked && <div className="solo-ranking"><Art name="medal" /><span><small>Expert ranking</small><b>{rank ? `#${rank} on this level` : 'Updates when you’re online'}</b></span></div>}
      </div>
      <div className="solo-result-actions">
        {won && onNext && <button className="big" onClick={onNext}>Next level <Icon name="next" /></button>}
        <div className="solo-secondary-actions"><button className={won && onNext ? 'big secondary' : 'big'} onClick={onRetry}><Icon name="restart" />Try again</button><button className="big secondary" onClick={onLevels}>Levels</button></div>
      </div>
    </Dialog>
  )
}
