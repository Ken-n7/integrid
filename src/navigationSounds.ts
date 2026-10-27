import { pauseAudio, sfx, warmSoundEffects } from './sound.ts'
export function installNavigationSounds() {
  const warm = () => { void warmSoundEffects() }
  warm() // begin decoding before the first click; the context remains suspended until a gesture
  const click = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest('button,a') : null
    if (!target || target.matches(':disabled,[aria-disabled="true"]') || target.matches('.game .cell.blank,.game .bank .tile,.game .tools button,.assessment-screen .choices button,.audio-test,[data-sfx="handled"]')) return
    sfx.tap()
  }
  const away = () => pauseAudio(document.hidden)
  document.addEventListener('pointerdown', warm)
  document.addEventListener('keydown', warm)
  document.addEventListener('click', click, true)
  document.addEventListener('visibilitychange', away)
  return () => {
    document.removeEventListener('pointerdown', warm)
    document.removeEventListener('keydown', warm)
    document.removeEventListener('click', click, true)
    document.removeEventListener('visibilitychange', away)
  }
}
