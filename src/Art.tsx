const ASSETS = [
  'heart', 'broken-heart', 'book', 'magnifier', 'clock', 'trophy', 'leaf', 'flame',
  'sword', 'medal', 'star', 'target', 'sound-on', 'sound-off', 'music-on', 'music-off', 'error',
] as const

export type ArtName = typeof ASSETS[number] | 'battle' | 'coin'

// Decorative artwork: the nearby control label or labelled parent describes its purpose.
export function Art({ name, className = '' }: { name: ArtName; className?: string }) {
  if (name === 'battle') return (
    <span className={`art-icon art-battle ${className}`} aria-hidden="true">
      <img src="/art/sword.png" width="256" height="256" alt="" draggable={false} />
      <img src="/art/sword.png" width="256" height="256" alt="" draggable={false} />
    </span>
  )
  return <img className={`art-icon ${className}`} src={name === 'coin' ? '/coin.svg' : `/art/${name}.png`} width="256" height="256" alt="" aria-hidden="true" draggable={false} />
}
