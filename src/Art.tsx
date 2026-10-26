const ASSETS = [
  'heart', 'broken-heart', 'book', 'magnifier', 'clock', 'trophy', 'leaf', 'flame',
  'sword', 'medal', 'star', 'target', 'sound-on', 'sound-off', 'music-on', 'music-off', 'error',
  'settings', 'lock', 'info', 'profile', 'close', 'check', 'warning', 'coin',
] as const

const GENERATED = [
  'hint', 'puzzle', 'map', 'arrow-left', 'undo', 'restart', 'download', 'controller',
  'party', 'flag', 'thumbs-up', 'phone', 'printer', 'pie',
] as const

export type ArtName = typeof ASSETS[number] | typeof GENERATED[number] | 'battle' | 'arrow-right' | 'arrow-down'
const generatedNames: ReadonlySet<string> = new Set(GENERATED)

// Decorative artwork: the nearby control label or labelled parent describes its purpose.
export function Art({ name, className = '' }: { name: ArtName; className?: string }) {
  if (name === 'battle') return (
    <span className={`art-icon art-battle ${className}`} aria-hidden="true">
      <img src="/art/sword.png" width="256" height="256" alt="" draggable={false} />
      <img src="/art/sword.png" width="256" height="256" alt="" draggable={false} />
    </span>
  )
  const direction = name === 'arrow-right' ? ' art-arrow-right' : name === 'arrow-down' ? ' art-arrow-down' : ''
  const asset = direction ? 'arrow-left' : name
  const directory = generatedNames.has(asset) ? '/art/generated' : '/art'
  return <img className={`art-icon${direction} ${className}`} src={`${directory}/${asset}.png`} width="256" height="256" alt="" aria-hidden="true" draggable={false} />
}
