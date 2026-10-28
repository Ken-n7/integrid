// Which puzzle each level uses: the researchers' file in puzzles/ (relax-1.csv), else one approved
// on the admin page (saved in the database, cached on each phone for offline play), else the
// generated sample (relax-1.sample.csv).
import { db } from './store.ts'
import { versionOf } from './puzzleVersion.ts'
import { parse, validate } from './puzzle.ts'
import { BATTLES, LEVELS } from './rules.ts'

const files = import.meta.glob('../puzzles/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
type Approved = { csv: string; version: string; at: string }
const CACHE = 'integrid:puzzles'

let approved: Record<string, Approved> = {}
try {
  approved = readApprovals(JSON.parse(localStorage.getItem(CACHE) || '{}'))
} catch {
  // blocked storage: the built-in files still work
}
const keep = () => {
  try {
    localStorage.setItem(CACHE, JSON.stringify(approved))
  } catch {
    // blocked storage: approvals still reach the phone next time it's online
  }
}

// A short fingerprint of a puzzle (FNV-1a), saved with every result: results from different
// puzzles for the same level are never mixed in a ranking.
export { versionOf } from './puzzleVersion.ts'

// Cached and downloaded approvals must pass the same checks as files shipped with the game.
function readApprovals(value: unknown): Record<string, Approved> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, Approved> = {}
  for (const [id, entry] of Object.entries(value)) {
    const level = [...LEVELS, ...BATTLES].find((l) => l.id === id)
    if (!level || !entry || typeof entry !== 'object') continue
    const { csv, version, at } = entry as Partial<Approved>
    if (typeof csv !== 'string' || csv.length > 4000 || version !== versionOf(csv) || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) continue
    try {
      if (!validate(parse(csv), level).length) out[id] = { csv, version, at }
    } catch {
      // A damaged approval falls back to the built-in puzzle.
    }
  }
  return out
}

export function builtIn(id: string) {
  const csv = files[`../puzzles/${id}.csv`] ?? files[`../puzzles/${id}.sample.csv`]
  return csv ? { csv, sample: !files[`../puzzles/${id}.csv`], version: versionOf(csv) } : null
}

// The researchers' own file (relax-1.csv) is final: it beats anything approved on the admin page,
// so it can't be swapped there (§13, question 9). Approvals only replace samples.
export function puzzleFor(id: string) {
  const a = approved[id]
  const file = builtIn(id)
  return a && file?.sample !== false ? { csv: a.csv, sample: false, version: a.version, approvedAt: a.at } : file
}

// A result counts for the current puzzle of its level. Results saved before versions existed
// were played on the built-in file.
export const isCurrent = (level: string, puzzle?: string | null) => (puzzle ?? builtIn(level)?.version) === puzzleFor(level)?.version

// Phones fetch the approved puzzles whenever they're online. Until the Oct 17 schema.sql has run
// there is no puzzles table: the built-in files are used.
export async function refreshPuzzles() {
  if (!db) return false
  const { data, error } = await db.from('puzzles').select('level, csv, version, approved_at')
  if (error || !data) return false
  approved = readApprovals(Object.fromEntries(data.map((p) => [p.level, { csv: p.csv, version: p.version, at: p.approved_at }])))
  keep()
  return true
}

// Admin page: use this puzzle for the level (dev mode: saved in this browser only).
export async function approvePuzzle(level: string, csv: string) {
  const entry = { csv: csv.trim(), version: versionOf(csv), at: new Date().toISOString() }
  if (db) {
    const { error } = await db.from('puzzles').upsert({ level, csv: entry.csv, version: entry.version, approved_at: entry.at })
    if (error) throw new Error(/puzzles/.test(error.message) ? 'the database needs its update first: paste all of supabase/schema.sql into Supabase’s SQL Editor and press Run.' : error.message)
  }
  approved = { ...approved, [level]: entry }
  keep()
}
