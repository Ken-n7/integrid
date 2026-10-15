// Every game number in one place (dev plan §6). Change here, nothing else.
import type { Op } from './puzzle.ts'

export type Mode = 'relax' | 'expert'
export type Result = 'win' | 'lose' | 'quit'
export type Attempt = {
  id: string
  level: string
  result: Result
  seconds: number
  wrong: number
  hints: number
  coins: number // reward minus hint costs
  mistakes: [answer: number, placed: number][]
  at: string // ISO start time
  synced?: boolean
}
export type Level = { id: string; mode: Mode; n: number; title: string; ops: Op[] }
export type Rank = { level: string; code: string; seconds: number; wrong: number }

export const START_COINS = 60
export const HEARTS = 5

// rewards: [finished within N seconds, coins]. Slower than the last step still earns the last step.
export const MODES: Record<Mode, { hintCost: number; hintLimit: number; clue: boolean; ranked: boolean; rewards: [number, number][] }> = {
  relax: { hintCost: 60, hintLimit: Infinity, clue: true, ranked: false, rewards: [[60, 60], [120, 40], [180, 30], [240, 20], [300, 10]] },
  expert: { hintCost: 120, hintLimit: 2, clue: false, ranked: true, rewards: [[120, 120], [180, 100], [240, 80], [300, 60]] },
}

export function reward(mode: Mode, seconds: number) {
  const steps = MODES[mode].rewards
  return (steps.find(([s]) => seconds <= s) ?? steps[steps.length - 1])[1]
}

export const ALL_OPS: Op[] = ['+', '−', '×', '÷']
export const LEVELS: Level[] = [
  { id: 'relax-1', mode: 'relax', n: 1, title: 'Addition of Integers', ops: ['+'] },
  { id: 'relax-2', mode: 'relax', n: 2, title: 'Subtraction of Integers', ops: ['−'] },
  { id: 'relax-3', mode: 'relax', n: 3, title: 'Multiplication of Integers', ops: ['×'] },
  { id: 'relax-4', mode: 'relax', n: 4, title: 'Division of Integers', ops: ['÷'] },
  { id: 'expert-1', mode: 'expert', n: 1, title: 'Mixed Addition and Subtraction', ops: ['+', '−'] },
  { id: 'expert-2', mode: 'expert', n: 2, title: 'Mixed Multiplication and Division', ops: ['×', '÷'] },
  { id: 'expert-3', mode: 'expert', n: 3, title: 'Four Fundamental Operations', ops: ALL_OPS },
  { id: 'expert-4', mode: 'expert', n: 4, title: 'Multi-Step Integer Problems', ops: ALL_OPS },
  { id: 'expert-5', mode: 'expert', n: 5, title: 'Advanced Crossword Challenges', ops: ALL_OPS },
]

// Coins and unlocks are worked out from the attempts, so they can never disagree with the data.
export const wonLevels = (attempts: Attempt[]) => new Set(attempts.filter((a) => a.result === 'win').map((a) => a.level))
export const isUnlocked = (id: string, won: Set<string>) => {
  const i = LEVELS.findIndex((l) => l.id === id)
  return i === 0 || won.has(LEVELS[i - 1].id)
}
export const coinsOf = (attempts: Attempt[]) => START_COINS + attempts.reduce((sum, a) => sum + a.coins, 0)
export const bestWin = (attempts: Attempt[], level: string) =>
  attempts.filter((a) => a.level === level && a.result === 'win').sort(byTime)[0]

const byTime = (a: { seconds: number; wrong: number }, b: { seconds: number; wrong: number }) => a.seconds - b.seconds || a.wrong - b.wrong

// Expert ranking: everyone's best win on a level, fastest first, fewer mistakes breaks ties.
// `mine` (the run just finished) replaces the student's row if it is better.
export function rankingFor(rows: Rank[], level: string, mine?: Rank) {
  const best = new Map<string, Rank>()
  for (const r of [...rows, ...(mine ? [mine] : [])]) {
    if (r.level !== level) continue
    const old = best.get(r.code)
    if (!old || byTime(r, old) < 0) best.set(r.code, r)
  }
  return [...best.values()].sort(byTime)
}

export const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
