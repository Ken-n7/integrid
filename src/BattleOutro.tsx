import { useEffect } from 'react'
import { Art } from './Art.tsx'
import { useBack } from './back.ts'
import { BATTLE_OUTRO } from './content.ts'
import { focusScreen } from './focus.ts'
import { Icon } from './ui.tsx'
import './battleOutro.css'

export function BattleOutro({ onDone }: { onDone: () => void }) {
  useBack(onDone)
  useEffect(() => { window.scrollTo(0, 0); focusScreen() }, [])

  return <main className="screen battle-outro" tabIndex={-1}>
    <header className="outro-header"><span>INTEGRID <small>IN ACTION</small></span><span className="outro-complete"><Art name="check" />{BATTLE_OUTRO.badge}</span></header>
    <section className="outro-card" aria-labelledby="outro-title">
      <div className="outro-emblem" aria-hidden="true">
        <span className="outro-medal"><Art name="medal" size={88} /></span>
        <Art name="star" className="outro-star one" /><Art name="star" className="outro-star two" />
      </div>
      <h1 id="outro-title">{BATTLE_OUTRO.title}</h1>
      <p className="outro-lead">{BATTLE_OUTRO.lead}</p>
      <ol className="outro-journey" aria-label="Your integer adventure">
        <li><Art name="leaf" /><b>Relax</b><small>Explore</small></li>
        <li><Art name="flame" /><b>Expert</b><small>Challenge</small></li>
        <li><Art name="battle" /><b>Battle</b><small>Team up</small></li>
      </ol>
      <p className="outro-message"><Art name="book" /><span>{BATTLE_OUTRO.message}</span></p>
    </section>
    <footer className="outro-footer"><p>{BATTLE_OUTRO.closing}</p><button className="big" onClick={onDone}>{BATTLE_OUTRO.action}<Icon name="next" /></button></footer>
  </main>
}
