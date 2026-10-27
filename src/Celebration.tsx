import { useEffect, useEffectEvent } from 'react'
import type { WinMessage } from './content.ts'
import { Dialog, Icon } from './ui.tsx'
import { Art } from './Art.tsx'
import { WinConfetti } from './WinConfetti.tsx'

export function Celebration({ message, onDone }: { message: WinMessage; onDone: () => void }) {
  const finish = useEffectEvent(onDone)
  useEffect(() => {
    if (message.detail) return // leave the longer achievement message open until the learner is ready
    const timer = setTimeout(() => finish(), 4000)
    return () => clearTimeout(timer)
  }, [message.detail])

  return (
    <div className="celebration">
      <WinConfetti />
      <Dialog className="achievement-panel" title={<>
        <span className="achievement-kicker">Achievement unlocked</span>
        <span className="achievement-emblem" aria-hidden="true">
          <Art name="medal" size={88} />
          <span className="achievement-spark spark-one"><Art name="star" /></span>
          <span className="achievement-spark spark-two"><Art name="star" /></span>
          <span className="achievement-spark spark-three"><Art name="star" /></span>
        </span>
        {message.level && <span className="celebration-level">{message.level}<span className="sr">: </span></span>}
        <span className="celebration-title">{message.title}</span>
      </>} onClose={onDone}>
        <p className="celebration-message">{message.text}</p>
        {message.detail && <p className="celebration-detail">{message.detail}</p>}
        <button className="big achievement-continue" onClick={onDone} autoFocus>View results <Icon name="next" /></button>
      </Dialog>
    </div>
  )
}
