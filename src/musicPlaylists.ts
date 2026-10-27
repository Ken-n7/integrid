export const MUSIC_TRACKS = {
  'sky-puzzle': { title: 'Sky Puzzle', src: '/music/sky-puzzle.mp3' },
  'puzzle-dreams': { title: 'Puzzle Dreams', src: '/music/puzzle-dreams.mp3' },
  'puzzle-game-3': { title: 'Puzzle Game 3', src: '/music/puzzle-game-3.mp3' },
  'cool-puzzler': { title: 'Cool Puzzler', src: '/music/cool-puzzler.mp3' },
  'hypnotic-puzzle-3': { title: 'Hypnotic Puzzle 3', src: '/music/hypnotic-puzzle-3.mp3' },
  'mind-bender': { title: 'Mind Bender', src: '/music/mind-bender.mp3' },
} as const
export type MusicTrack = keyof typeof MUSIC_TRACKS
export type MusicScene = 'menu' | 'relax' | 'expert' | 'battle'
const challenge: readonly MusicTrack[] = ['hypnotic-puzzle-3', 'mind-bender']
export const MUSIC_PLAYLISTS: Record<MusicScene, readonly MusicTrack[]> = {
  menu: ['sky-puzzle', 'puzzle-dreams'],
  relax: ['puzzle-game-3', 'cool-puzzler'],
  expert: challenge,
  battle: challenge,
}
export function musicSceneForScreen(screen: string | { level: string }): MusicScene {
  const mode = typeof screen === 'string' ? screen : screen.level.split('-')[0]
  return mode === 'relax' || mode === 'expert' || mode === 'battle' ? mode : 'menu'
}
