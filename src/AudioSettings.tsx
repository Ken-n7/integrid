import { useState, useSyncExternalStore } from 'react'
import { Art } from './Art.tsx'
import { getMusicTrack, musicOn, musicVolume, nextMusicTrack, setMusicOn, setMusicVolume, subscribeMusic } from './music.ts'
import { MUSIC_TRACKS } from './musicPlaylists.ts'
import { setSoundOn, setSoundVolume, sfx, soundOn, soundVolume } from './sound.ts'

export function AudioSettings({ compact = false }: { compact?: boolean }) {
  const [sound, setSound] = useState(soundOn), [music, setMusic] = useState(musicOn)
  const [effectsLevel, setEffectsLevel] = useState(soundVolume), [musicLevel, setMusicLevel] = useState(musicVolume)
  const track = useSyncExternalStore(subscribeMusic, getMusicTrack)
  return (
    <div className={`settings-list audio-settings${compact ? ' compact' : ''}`}>
      <button className="settings-row" role="switch" aria-label="Sound effects" aria-checked={sound} onClick={() => {
        const next = !soundOn(); setSoundOn(next); setSound(next); if (next) sfx.right()
      }}>
        <span className="settings-row-art sound"><Art name={sound ? 'sound-on' : 'sound-off'} /></span>
        <span className="settings-row-copy"><b>Sound effects</b>{!compact && <small>Answer sounds and game feedback</small>}</span>
        <span className={`settings-switch${sound ? ' on' : ''}`} aria-hidden="true"><span>{sound ? 'On' : 'Off'}</span><i /></span>
      </button>
      <div className="audio-level">
        <label htmlFor="effects-volume">Volume <span>{Math.round(effectsLevel * 100)}%</span></label>
        <input id="effects-volume" aria-label="Sound effects volume" type="range" min="0" max="100" step="5" disabled={!sound} value={Math.round(effectsLevel * 100)} onChange={(e) => { const value = Number(e.target.value) / 100; setSoundVolume(value); setEffectsLevel(value) }} />
        <button className="audio-test" disabled={!sound || effectsLevel === 0} onClick={() => sfx.right()}>Test sound</button>
      </div>
      <button className="settings-row" role="switch" aria-label="Music" aria-checked={music} onClick={() => {
        const next = !musicOn(); setMusicOn(next); setMusic(next)
      }}>
        <span className="settings-row-art music"><Art name={music ? 'music-on' : 'music-off'} /></span>
        <span className="settings-row-copy"><b>Music</b>{!compact && <small>Automatically quieter while you solve</small>}</span>
        <span className={`settings-switch${music ? ' on' : ''}`} aria-hidden="true"><span>{music ? 'On' : 'Off'}</span><i /></span>
      </button>
      <div className="audio-level">
        <label htmlFor="music-volume">Volume <span>{Math.round(musicLevel * 100)}%</span></label>
        <input id="music-volume" aria-label="Music volume" type="range" min="0" max="100" step="5" disabled={!music} value={Math.round(musicLevel * 100)} onChange={(e) => { const value = Number(e.target.value) / 100; setMusicVolume(value); setMusicLevel(value) }} />
      </div>
      <div className="audio-track">
        <span><small>Selected music</small><b aria-live="polite">{MUSIC_TRACKS[track].title}</b></span>
        <button disabled={!music || musicLevel === 0} onClick={nextMusicTrack}>Next song</button>
      </div>
      <details className="audio-credits"><summary>Music credits</summary>
        <p>Music by Eric Matyas<br /><a href="https://soundimage.org/" target="_blank" rel="noreferrer">www.soundimage.org</a></p>
        <p>{Object.values(MUSIC_TRACKS).map((t) => t.title).join(' · ')}</p>
        <p>Volume adjusted and encoded for INTEGRID. Used under the <a href="https://soundimage.org/sample-page/" target="_blank" rel="noreferrer">Soundimage International Public License</a>.</p>
      </details>
    </div>
  )
}
