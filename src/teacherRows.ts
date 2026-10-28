import { LEVELS, BATTLES } from './rules.ts'
export type TeacherRow = {
  id: string; student: string; level: string; result: string
  seconds: number; wrong: number; hints: number; coins: number
  mistakes: [number, number][]; played_at: string; puzzle?: string | null
}
export type AttemptIssue = { id: string; student: string; reason: string }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
export function readTeacherRow(value: unknown): { row: TeacherRow; issue?: never } | { row?: never; issue: AttemptIssue } {
  const r = object(value) ? value : {}
  const reject = (reason: string) => ({ issue: { id: typeof r.id === 'string' ? r.id.slice(0, 80) : 'Unknown ID', student: typeof r.student === 'string' ? r.student.slice(0, 12) : 'Unknown student', reason } })
  if (typeof r.id !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(r.id)) return reject('Invalid record ID')
  if (typeof r.student !== 'string' || !/^[A-Z0-9-]{1,12}$/.test(r.student)) return reject('Invalid student code')
  if (typeof r.level !== 'string' || ![...LEVELS, ...BATTLES].some(l => l.id === r.level) || typeof r.result !== 'string' || !['win', 'lose', 'quit'].includes(r.result)) return reject('Invalid level or result')
  if (!integer(r.seconds, 0, 2_147_483_647) || !integer(r.wrong, 0, 5) || !integer(r.hints, 0, 1000) || !integer(r.coins, -2_147_483_648, 2_147_483_647)) return reject('Invalid game counters')
  if (typeof r.played_at !== 'string' || !Number.isFinite(Date.parse(r.played_at)) || (r.puzzle !== undefined && r.puzzle !== null && (typeof r.puzzle !== 'string' || r.puzzle.length > 16))) return reject('Invalid timestamp or puzzle version')
  if (!Array.isArray(r.mistakes) || r.mistakes.length !== r.wrong || !r.mistakes.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isSafeInteger) && pair[0] !== pair[1])) return reject('Invalid mistake pairs')
  return { row: { id: r.id, student: r.student, level: r.level, result: r.result, seconds: r.seconds, wrong: r.wrong, hints: r.hints, coins: r.coins, mistakes: r.mistakes.map(pair => [pair[0], pair[1]]), played_at: r.played_at, puzzle: r.puzzle as string | null | undefined } }
}
