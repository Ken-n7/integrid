import { useState } from 'react'
import { Art } from './Art.tsx'
import { musicOn, setMusicOn } from './music.ts'
import { setSoundOn, sfx, soundOn } from './sound.ts'

// Both settings menus use the same saved preferences and accessible switch controls.
export function AudioSettings({ compact = false }: { compact?: boolean }) {
  const [sound, setSound] = useState(soundOn)
  const [music, setMusic] = useState(musicOn)
  return (
    <div className={`settings-list audio-settings${compact ? ' compact' : ''}`}>
      <button className="settings-row" role="switch" aria-label="Sound effects" aria-checked={sound} onClick={() => {
        const next = !soundOn()
        setSoundOn(next)
        setSound(next)
        if (next) sfx.right()
      }}>
        <span className="settings-row-art sound"><Art name={sound ? 'sound-on' : 'sound-off'} /></span>
        <span className="settings-row-copy"><b>Sound effects</b>{!compact && <small>Answer sounds and game feedback</small>}</span>
        <span className={`settings-switch${sound ? ' on' : ''}`} aria-hidden="true"><span>{sound ? 'On' : 'Off'}</span><i /></span>
      </button>
      <button className="settings-row" role="switch" aria-label="Music" aria-checked={music} onClick={() => {
        const next = !musicOn()
        setMusicOn(next)
        setMusic(next)
      }}>
        <span className="settings-row-art music"><Art name={music ? 'music-on' : 'music-off'} /></span>
        <span className="settings-row-copy"><b>Music</b>{!compact && <small>Background music while you play</small>}</span>
        <span className={`settings-switch${music ? ' on' : ''}`} aria-hidden="true"><span>{music ? 'On' : 'Off'}</span><i /></span>
      </button>
    </div>
  )
}
