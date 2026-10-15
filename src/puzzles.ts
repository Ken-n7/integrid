// Which puzzle each level uses: one the researchers approved on the admin page (saved in the
// database, cached on each phone for offline play), else a file in puzzles/ (relax-1.csv, or the
// generated relax-1.sample.csv until someone approves one).
import { db } from './store.ts'

const files = import.meta.glob('../puzzles/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
type Approved = { csv: string; version: string; at: string }
const CACHE = 'integrid:puzzles'

let approved: Record<string, Approved> = {}
try {
  approved = JSON.parse(localStorage.getItem(CACHE) || '{}')
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
export function versionOf(csv: string) {
  let h = 0x811c9dc5
  for (const ch of csv.trim()) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

export function builtIn(id: string) {
  const csv = files[`../puzzles/${id}.csv`] ?? files[`../puzzles/${id}.sample.csv`]
  return csv ? { csv, sample: !files[`../puzzles/${id}.csv`], version: versionOf(csv) } : null
}

export function puzzleFor(id: string) {
  const a = approved[id]
  return a ? { csv: a.csv, sample: false, version: a.version, approvedAt: a.at } : builtIn(id)
}

// A result counts for the current puzzle of its level. Results saved before versions existed
// were played on the built-in file.
export const isCurrent = (level: string, puzzle?: string | null) => (puzzle ?? builtIn(level)?.version) === puzzleFor(level)?.version

// Phones fetch the approved puzzles whenever they're online. Before supabase/update-1.sql has run
// there is no puzzles table: the built-in files are used.
export async function refreshPuzzles() {
  if (!db) return false
  const { data, error } = await db.from('puzzles').select('level, csv, version, approved_at')
  if (error || !data) return false
  approved = Object.fromEntries(data.map((p) => [p.level, { csv: p.csv, version: p.version, at: p.approved_at }]))
  keep()
  return true
}

// Admin page: use this puzzle for the level (dev mode: saved in this browser only).
export async function approvePuzzle(level: string, csv: string) {
  const entry = { csv: csv.trim(), version: versionOf(csv), at: new Date().toISOString() }
  if (db) {
    const { error } = await db.from('puzzles').upsert({ level, csv: entry.csv, version: entry.version, approved_at: entry.at })
    if (error) throw error
  }
  approved = { ...approved, [level]: entry }
  keep()
}
