import { standings, sum, type Host } from './battleState.ts'
import { BATTLES } from './rules.ts'

export type BattleOutcome = 'completed' | 'time_up' | 'ended' | 'cancelled'
export type HistoryGroup = { group: number; rank: number | null; members: string[]; filled: number; wrong: number; completed_seconds: number | null }
export type BattleRecord = {
  id: string; room: string; puzzle: string; puzzle_title: string; puzzle_version: string
  created_at: string; started_at: string | null; ended_at: string
  time_limit_seconds: number; elapsed_seconds: number; total_boxes: number
  outcome: BattleOutcome; groups: HistoryGroup[]
}
export type HistoryCache = { version: 1; records: BattleRecord[]; pending: string[] }
export const HISTORY_COLUMNS = 'id, room, puzzle, puzzle_title, puzzle_version, created_at, started_at, ended_at, time_limit_seconds, elapsed_seconds, total_boxes, outcome, groups'
export const OUTCOME_LABEL: Record<BattleOutcome, string> = { completed: 'Completed', time_up: 'Time up', ended: 'Ended by teacher', cancelled: 'Cancelled' }
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v)
const whole = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function readBattleRecord(value: unknown): BattleRecord | null {
  if (!object(value)) return null
  const r = value
  if (!uuid(r.id) || typeof r.room !== 'string' || !/^\d{4}$/.test(r.room) || !BATTLES.some((l) => l.id === r.puzzle)) return null
  if (typeof r.puzzle_title !== 'string' || !r.puzzle_title.length || r.puzzle_title.length > 160 || typeof r.puzzle_version !== 'string' || r.puzzle_version.length > 16) return null
  if (!date(r.created_at) || !date(r.ended_at) || (r.started_at !== null && !date(r.started_at))) return null
  if (!whole(r.time_limit_seconds, 60, 3600) || !whole(r.elapsed_seconds, 0, r.time_limit_seconds) || !whole(r.total_boxes, 1, 1000)) return null
  if ((typeof r.outcome !== 'string' || !['completed', 'time_up', 'ended', 'cancelled'].includes(r.outcome)) || !Array.isArray(r.groups) || r.groups.length < 2 || r.groups.length > 8) return null
  const groups: HistoryGroup[] = []
  for (const g of r.groups) {
    if (!object(g) || !whole(g.group, 1, r.groups.length) || (g.rank !== null && !whole(g.rank, 1, r.groups.length))) return null
    if (!Array.isArray(g.members) || g.members.length > 1000 || !g.members.every((c) => typeof c === 'string' && /^[A-Z0-9-]{1,12}$/.test(c)) || new Set(g.members).size !== g.members.length) return null
    if (!whole(g.filled, 0, r.total_boxes) || !whole(g.wrong, 0, 1_000_000) || (g.completed_seconds !== null && !whole(g.completed_seconds, 0, r.time_limit_seconds))) return null
    groups.push({ group: g.group, rank: g.rank, members: [...g.members] as string[], filled: g.filled, wrong: g.wrong, completed_seconds: g.completed_seconds })
  }
  if (new Set(groups.map((g) => g.group)).size !== groups.length) return null
  const ranked = groups.flatMap((g) => g.rank === null ? [] : [g.rank])
  if (new Set(ranked).size !== ranked.length) return null
  return { id: r.id, room: r.room, puzzle: r.puzzle as string, puzzle_title: r.puzzle_title, puzzle_version: r.puzzle_version, created_at: r.created_at, started_at: r.started_at, ended_at: r.ended_at, time_limit_seconds: r.time_limit_seconds, elapsed_seconds: r.elapsed_seconds, total_boxes: r.total_boxes, outcome: r.outcome as BattleOutcome, groups }
}

export function mergeBattleRecords(...lists: BattleRecord[][]): BattleRecord[] {
  const records = new Map<string, BattleRecord>()
  for (const list of lists) for (const r of list) records.set(r.id, r)
  return [...records.values()].sort((a, b) => Date.parse(b.ended_at) - Date.parse(a.ended_at) || a.id.localeCompare(b.id))
}
export function readHistoryCache(raw: string | null): HistoryCache {
  const empty: HistoryCache = { version: 1, records: [], pending: [] }
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!object(value) || value.version !== 1 || !Array.isArray(value.records)) return empty
    const records = mergeBattleRecords(value.records.flatMap((v) => { const record = readBattleRecord(v); return record ? [record] : [] }))
    const ids = new Set(records.map((r) => r.id))
    const pending = Array.isArray(value.pending) ? [...new Set(value.pending.filter((v): v is string => typeof v === 'string' && ids.has(v)))].sort() : []
    return { version: 1, records, pending }
  } catch { return empty }
}

export function archiveBattle(h: Host, meta: { id: string; created_at: string; puzzle_version: string; roster: string[][] }, outcome: BattleOutcome, now = Date.now()): BattleRecord {
  const ended = Math.max(now, Date.parse(meta.created_at), h.startedAt ?? 0)
  const elapsed = outcome === 'cancelled' ? 0 : Math.max(0, Math.min(h.seconds, Math.floor((ended - (h.startedAt ?? ended)) / 1000)))
  const roster = h.members.map((members, g) => [...new Set([...(meta.roster[g] ?? []), ...members])].sort())
  const groups = standings(h.cells.map((cells, g) => ({ cells, wrong: sum(h.wrongs[g]), done: h.done[g] })), h.members).map((b, place) => ({
    group: b.g + 1,
    rank: outcome === 'cancelled' || !(h.members[b.g].length || b.cells.length || b.wrong) ? null : place + 1,
    members: roster[b.g], filled: b.cells.length, wrong: b.wrong,
    completed_seconds: outcome === 'cancelled' || b.done === null ? null : Math.max(0, Math.min(h.seconds, b.done)),
  }))
  return { id: meta.id, room: h.room, puzzle: h.puzzle, puzzle_title: BATTLES.find((l) => l.id === h.puzzle)!.title, puzzle_version: meta.puzzle_version, created_at: meta.created_at, started_at: outcome === 'cancelled' || h.startedAt === null ? null : new Date(h.startedAt).toISOString(), ended_at: new Date(ended).toISOString(), time_limit_seconds: h.seconds, elapsed_seconds: elapsed, total_boxes: h.total, outcome, groups }
}

export function historyCsv(records: BattleRecord[]) {
  const rows: (string | number)[][] = [['battle_id', 'ended_at', 'room', 'puzzle', 'puzzle_version', 'outcome', 'time_limit_seconds', 'elapsed_seconds', 'group', 'rank', 'players', 'boxes_filled', 'total_boxes', 'wrong', 'completion_seconds']]
  for (const r of records) for (const g of r.groups) rows.push([r.id, r.ended_at, r.room, r.puzzle, r.puzzle_version, r.outcome, r.time_limit_seconds, r.elapsed_seconds, g.group, g.rank ?? '', g.members.join(' '), g.filled, r.total_boxes, g.wrong, g.completed_seconds ?? ''])
  return rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n')
}
