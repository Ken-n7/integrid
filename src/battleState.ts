// Battle state shared by the host and phones. Repeated and late messages are harmless.
import { blanksOf, key, parse, validate } from './puzzle.ts'
import { BATTLES, HEARTS } from './rules.ts'

export type Bar = { cells: string[]; wrong: number; done: number | null }
export type Room = { puzzle: string; csv: string; seconds: number; state: 'lobby' | 'live' | 'done'; startedAt: number | null; sentAt: number; members: string[][]; bars: Bar[] }
export type GroupMsg = { t: 'join'; code: string } | { t: 'leave'; code: string } | { t: 'cell'; k: string; hint: boolean } | { t: 'wrong'; code: string; wrong: number; run?: string }
export type Host = Omit<Room, 'bars' | 'sentAt'> & { room: string; total: number; cells: string[][]; wrongs: Record<string, number>[]; done: (number | null)[] }

export const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0)
export const countWrong = (w: Record<string, number>, code: string, n: number, run?: string) => {
  const id = run ? `${code}:${run}` : code
  return { ...w, [id]: Math.max(w[id] ?? 0, n) }
}

export function isRoom(value: unknown): value is Room {
  if (!value || typeof value !== 'object') return false
  const r = value as Room
  const level = BATTLES.find((l) => l.id === r.puzzle)
  if (!level || typeof r.csv !== 'string' || r.csv.length > 4000 || !['lobby', 'live', 'done'].includes(r.state)) return false
  if (!Number.isInteger(r.seconds) || r.seconds < 60 || r.seconds > 3600 || !Number.isFinite(r.sentAt)) return false
  if (r.state === 'lobby' ? r.startedAt !== null : !Number.isFinite(r.startedAt)) return false
  if (!Array.isArray(r.members) || r.members.length < 2 || r.members.length > 8 || !r.members.every((m) => Array.isArray(m) && m.every((c) => typeof c === 'string' && /^[A-Z0-9-]{1,12}$/.test(c)))) return false
  if (!Array.isArray(r.bars) || r.bars.length !== r.members.length) return false
  try {
    const grid = parse(r.csv)
    if (validate(grid, level).length) return false
    const boxes = new Set(blanksOf(grid).map(key))
    return r.bars.every((b) => b && Array.isArray(b.cells) && b.cells.every((k) => boxes.has(k)) && new Set(b.cells).size === b.cells.length &&
      Number.isSafeInteger(b.wrong) && b.wrong >= 0 && (b.done === null || (Number.isSafeInteger(b.done) && b.done >= 0)))
  } catch {
    return false
  }
}

export function isGroupMsg(value: unknown): value is GroupMsg {
  if (!value || typeof value !== 'object') return false
  const m = value as Partial<GroupMsg> & { code?: unknown; wrong?: unknown; k?: unknown; hint?: unknown; run?: unknown }
  if (m.t === 'cell') return typeof m.k === 'string' && /^\d+,\d+$/.test(m.k) && typeof m.hint === 'boolean'
  if (typeof m.code !== 'string' || !/^[A-Z0-9-]{1,12}$/.test(m.code)) return false
  return m.t === 'join' || m.t === 'leave' || (m.t === 'wrong' && Number.isInteger(m.wrong) && Number(m.wrong) >= 0 && Number(m.wrong) <= HEARTS &&
    (m.run === undefined || (typeof m.run === 'string' && /^[a-f0-9-]{36}$/i.test(m.run))))
}

// Empty groups come last, followed by finish time, solved boxes and wrong answers.
export function standings(bars: Bar[], members: string[][]) {
  const empty = (g: number) => !members[g]?.length && !bars[g].cells.length && !bars[g].wrong
  return bars.map((b, g) => ({ ...b, g }))
    .sort((a, b) => +empty(a.g) - +empty(b.g) || (a.done ?? Infinity) - (b.done ?? Infinity) || b.cells.length - a.cells.length || a.wrong - b.wrong)
}

export function apply(h: Host, g: number, m: unknown): Host {
  if (h.state === 'done' || !Number.isInteger(g) || g < 0 || g >= h.members.length || !isGroupMsg(m)) return h
  if (m.t === 'leave') {
    // A late leave from the old group must not remove someone who already joined a new group.
    return { ...h, members: h.members.map((list, i) => i === g ? list.filter((c) => c !== m.code) : list) }
  }
  if (m.t === 'join') {
    const members = h.members.map((list) => list.filter((c) => c !== m.code))
    members[g] = [...members[g], m.code].sort()
    return { ...h, members }
  }
  if (h.state !== 'live' || h.done[g] !== null || sum(h.wrongs[g]) >= HEARTS) return h
  if (m.t === 'wrong') {
    if (!h.members[g].includes(m.code)) return h
    return { ...h, wrongs: h.wrongs.map((w, i) => i === g ? countWrong(w, m.code, m.wrong, m.run) : w) }
  }
  if (h.cells[g].includes(m.k) || !blanksOf(parse(h.csv)).some((p) => key(p) === m.k)) return h
  const cells = h.cells.map((c, i) => i === g ? [...c, m.k] : c)
  const done = h.done.map((d, i) => i === g && d === null && cells[g].length >= h.total ? Math.floor((Date.now() - h.startedAt!) / 1000) : d)
  return { ...h, cells, done }
}

export function roundFinished(h: Host, now = Date.now()) {
  if (h.state !== 'live') return false
  if (now - h.startedAt! >= h.seconds * 1000) return true
  const active = h.members.flatMap((m, g) => m.length || h.cells[g].length || sum(h.wrongs[g]) ? [g] : [])
  return active.length > 0 && active.every((g) => h.done[g] !== null || sum(h.wrongs[g]) >= HEARTS)
}
