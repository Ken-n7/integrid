import { useEffect, useEffectEvent, type CSSProperties } from 'react'
import type { WinMessage } from './content.ts'
import { Deco, Dialog } from './ui.tsx'

const PIECES = Array.from({ length: 22 }, (_, i) => ({
  '--x': `${45 + (i * 43) % 155}px`,
  '--y': `${-95 - (i * 31) % 150}px`,
  '--spin': `${180 + i * 47}deg`,
  '--delay': `${(i % 6) * 0.07}s`,
  '--color': ['#f5bc32', '#2a8d69', '#de6b88', '#4b8ed5', '#ae75cc'][i % 5],
}) as CSSProperties)

export function Celebration({ message, onDone }: { message: WinMessage; onDone: () => void }) {
  const finish = useEffectEvent(onDone)
  useEffect(() => {
    if (message.detail) return // leave the longer achievement message open until the learner is ready
    const timer = setTimeout(() => finish(), 4000)
    return () => clearTimeout(timer)
  }, [message.detail])

  return (
    <div className="celebration">
      <div className="confetti" aria-hidden="true">
        {['left', 'right'].map((side) => (
          <div className={`confetti-side confetti-${side}`} key={side}>
            {PIECES.map((style, i) => <i key={i} style={style} />)}
          </div>
        ))}
      </div>
      <Dialog title={<>
        {message.level && <span className="celebration-level">{message.level}<span className="sr">: </span></span>}
        <span className="celebration-title">{message.title}</span>
      </>} onClose={onDone}>
        <div className="celebration-badge"><Deco>🏆</Deco></div>
        <p className="celebration-message">{message.text}</p>
        {message.detail && <p className="celebration-detail">{message.detail}</p>}
        <button className="big" onClick={onDone} autoFocus>View results</button>
      </Dialog>
    </div>
  )
}
