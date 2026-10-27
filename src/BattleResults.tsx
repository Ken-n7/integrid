import { useEffect, useRef } from 'react'
import type { BattleLink } from './Game.tsx'
import { Deco, Dialog, Icon } from './ui.tsx'
import { WinConfetti } from './WinConfetti.tsx'

export function BattleResults({ battle, finale, onContinue }: { battle: BattleLink; finale: boolean; onContinue: () => void }) {
  const summary = useRef<HTMLDivElement>(null)
  useEffect(() => {
    summary.current?.focus({ preventScroll: true })
    const panel = summary.current?.closest<HTMLElement>('.panel')
    if (panel) panel.scrollTop = 0
  }, [])

  return <div className={`battle-end${battle.won ? ' celebration' : ''}`}>
    {battle.won && <WinConfetti />}
    <Dialog title={<><Deco>🏁</Deco> Battle over!</>} className="battle-results-panel" onBack={onContinue}>
      <div ref={summary} className="battle-final-summary" role="group" aria-label="Your Battle result" tabIndex={-1}>{battle.result}</div>
      {battle.bars}
      <button className="big" onClick={onContinue}>{finale ? <>Continue adventure <Icon name="next" /></> : 'Back to modes'}</button>
    </Dialog>
  </div>
}
