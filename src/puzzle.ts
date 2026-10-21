// Puzzle grids: read the researchers' CSV, check every equation, and make sure
// there is exactly one way to fill the blanks from the number bank.

export type Op = '+' | '−' | '×' | '÷'
export type Cell = { t: 'num'; v: number; hidden: boolean } | { t: 'op'; op: Op } | { t: 'eq' } | null
export type Grid = Cell[][]
export type Pos = [row: number, col: number]
type Side = { nums: Pos[]; ops: Op[] }
export type Eq = { cells: Pos[]; across: boolean; left: Side; right: Side }
type Lookup = (p: Pos) => number | undefined // undefined = blank not filled yet

// The biggest puzzle: 13 × 17, the researchers' pick (Oct 18) after seeing each size in the game on phones.
export const MAX_COLS = 13
export const MAX_ROWS = 17
const OPS: Record<string, Op> = { '+': '+', '-': '−', x: '×', '*': '×', '×': '×', '/': '÷', '÷': '÷' }

export const key = (p: Pos) => `${p[0]},${p[1]}`
export const fmt = (n: number) => (n < 0 ? `(−${-n})` : String(n))
export const lenOf = (n: number) => String(Math.abs(n)).length + (n < 0 ? 2 : 0) // for font sizing
const where = (p: Pos) => `row ${p[0] + 1}, column ${p[1] + 1}`
const label = (e: Eq) => `${where(e.cells[0])} ${e.across ? 'across' : 'down'}`

export function parse(csv: string): Grid {
  const rows = csv.replace(/^﻿/, '').split(/\r?\n/).map((line) => line.split(','))
  const used = (r: string[]) => r.findLastIndex((s) => s.trim()) + 1
  while (rows.length && !used(rows[rows.length - 1])) rows.pop()
  const width = Math.max(0, ...rows.map(used))
  return rows.map((r, i) => Array.from({ length: width }, (_, j) => readCell(r[j] ?? '', [i, j])))
}

function readCell(raw: string, p: Pos): Cell {
  // Sheets and Docs like to swap "-" for "−" or "–", and people type "(-7)" or "x"
  const s = raw.replace(/["\s]/g, '').replace(/[−–—]/g, '-').toLowerCase()
  if (!s) return null
  const sym = s.replace(/^\((.)\)$/, '$1') // "(+)" and "(=)": typed that way so Google Sheets doesn't start a formula
  if (sym === '=') return { t: 'eq' }
  if (Object.hasOwn(OPS, sym)) return { t: 'op', op: OPS[sym] }
  const m = /^(\?)?\(?([-+]?\d+)\)?$/.exec(s)
  if (!m) throw new Error(`${where(p)}: can't read "${raw.trim()}"`)
  const v = Number(m[2]) || 0
  if (!Number.isSafeInteger(v)) throw new Error(`${where(p)}: number is too large to calculate exactly`)
  return { t: 'num', v, hidden: !!m[1] }
}

// Every row/column run of 2+ filled squares is one equation, or a chain of them (below).
export function equations(grid: Grid) {
  const eqs: Eq[] = []
  const errors: string[] = []
  const h = grid.length
  const w = grid[0]?.length ?? 0
  for (const across of [true, false]) {
    for (let a = 0; a < (across ? h : w); a++) {
      let run: Pos[] = []
      for (let b = 0; b <= (across ? w : h); b++) {
        const p: Pos | null = b < (across ? w : h) ? (across ? [a, b] : [b, a]) : null
        if (p && grid[p[0]][p[1]]) {
          run.push(p)
          continue
        }
        if (run.length > 1) {
          const e = chain(grid, run, across) ?? compile(grid, run, across)
          if (typeof e === 'string') errors.push(e)
          else if (Array.isArray(e)) eqs.push(...e)
          else eqs.push(e)
        }
        run = []
      }
    }
  }
  return { eqs, errors }
}

// A chain, as in the researchers' drafts: -12 + (-7) = -19 + 14 = -5 is two equations, the second
// starting with the first one's answer (-12 + (-7) = -19, then -19 + 14 = -5). Only runs shaped
// N op N = N op N = N … count; anything else is checked as a single equation.
function chain(grid: Grid, cells: Pos[], across: boolean): Eq[] | null {
  const kind = (i: number) => grid[cells[i][0]][cells[i][1]]!.t
  if (cells.length < 9 || cells.length % 4 !== 1 || !cells.every((_, i) => kind(i) === (i % 4 === 3 ? 'eq' : i % 2 ? 'op' : 'num'))) return null
  return Array.from({ length: (cells.length - 1) / 4 }, (_, i) => compile(grid, cells.slice(4 * i, 4 * i + 5), across) as Eq)
}

function compile(grid: Grid, cells: Pos[], across: boolean): Eq | string {
  const sides: Side[] = [{ nums: [], ops: [] }]
  for (const [i, p] of cells.entries()) {
    const c = grid[p[0]][p[1]]!
    if ((i % 2 === 0) !== (c.t === 'num')) return `${where(p)}: expected ${i % 2 === 0 ? 'a number' : 'an operator or ='} here`
    if (c.t === 'num') sides[sides.length - 1].nums.push(p)
    else if (c.t === 'op') sides[sides.length - 1].ops.push(c.op)
    else sides.push({ nums: [], ops: [] })
  }
  const e: Eq = { cells, across, left: sides[0], right: sides[1] }
  if (cells.length % 2 === 0) return `${label(e)}: ends without a number`
  if (sides.length !== 2) return `${label(e)}: needs exactly one =`
  return e
}

function value(s: Side, val: Lookup): number | undefined | string {
  const nums = s.nums.map(val)
  return nums.includes(undefined) ? undefined : calc(nums as number[], s.ops)
}

// MDAS: × and ÷ first, then + and −, left to right. A string means the math breaks.
export function calc(nums: number[], ops: Op[]): number | string {
  if (!nums.every(Number.isSafeInteger)) return 'number is too large to calculate exactly'
  const terms = [nums[0]]
  const signs: Op[] = []
  for (const [i, op] of ops.entries()) {
    const n = nums[i + 1]
    if (op === '+' || op === '−') {
      terms.push(n)
      signs.push(op)
      continue
    }
    const a = terms.pop()!
    if (op === '÷' && n === 0) return 'divides by 0'
    if (op === '÷' && a % n !== 0) return `${fmt(a)} ÷ ${fmt(n)} is not a whole number`
    const product = (op === '×' ? a * n : a / n) || 0
    if (!Number.isSafeInteger(product)) return 'answer is too large to calculate exactly'
    terms.push(product)
  }
  let result = terms[0]
  for (let i = 1; i < terms.length; i++) {
    result = signs[i - 1] === '+' ? result + terms[i] : result - terms[i]
    if (!Number.isSafeInteger(result)) return 'answer is too large to calculate exactly'
  }
  return result
}

// One typed equation like "-12 + (-7) = -19" (the researchers' lists, the puzzle maker). Without
// "= …" the answer is worked out. null: not an equation; a string: what's wrong with it.
const EQUATION = /^\(?(-?\d+)\)?\s*([-+x×*/÷])\s*\(?(-?\d+)\)?\s*(?:=\s*\(?(-?\d+)\)?)?$/i
export function readEquation(text: string): { nums: number[]; ops: Op[]; result: number } | string | null {
  const m = EQUATION.exec(text.replace(/[−–—]/g, '-').trim())
  if (!m) return null
  const nums = [Number(m[1]), Number(m[3])]
  const ops = [OPS[m[2].toLowerCase()]]
  const result = calc(nums, ops)
  if (typeof result === 'string') return result
  if (m[4] !== undefined && Number(m[4]) !== result) return `${fmt(nums[0])} ${ops[0]} ${fmt(nums[1])} is ${fmt(result)}, not ${fmt(Number(m[4]))}`
  return { nums, ops, result }
}

// true / false, undefined while a blank in it is still empty, or a string when the math breaks
export function holds(e: Eq, val: Lookup): boolean | undefined | string {
  const l = value(e.left, val)
  const r = value(e.right, val)
  if (typeof l === 'string') return l
  if (typeof r === 'string') return r
  return l === undefined || r === undefined ? undefined : l === r
}

const answer = (grid: Grid): Lookup => (p) => (grid[p[0]][p[1]] as { v: number }).v

export const blanksOf = (grid: Grid): Pos[] =>
  grid.flatMap((row, r) => row.flatMap((c, col): Pos[] => (c?.t === 'num' && c.hidden ? [[r, col]] : [])))

// Client: the number bank holds the correct answers only, smallest first like the sketch.
export const bankOf = (grid: Grid) => blanksOf(grid).map(answer(grid)).map(Number).sort((a, b) => a - b)

export function text(grid: Grid, e: Eq) {
  return e.cells
    .map(([r, c]) => {
      const cell = grid[r][c]!
      return cell.t === 'num' ? (cell.hidden ? '?' : '') + fmt(cell.v) : cell.t === 'op' ? cell.op : '='
    })
    .join(' ')
}

// Everything wrong with a puzzle, in words the researchers can act on. Empty = good.
export function validate(grid: Grid, rules: { ops: Op[] }): string[] {
  const errors: string[] = []
  const width = grid[0]?.length ?? 0
  if (width > MAX_COLS) errors.push(`${width} columns wide; puzzles are at most ${MAX_COLS} × ${MAX_ROWS}`)
  if (grid.length > MAX_ROWS) errors.push(`${grid.length} rows tall; puzzles are at most ${MAX_COLS} × ${MAX_ROWS}`)
  const { eqs, errors: shape } = equations(grid)
  errors.push(...shape)
  const covered = new Set(eqs.flatMap((e) => e.cells.map(key)))
  grid.forEach((row, r) =>
    row.forEach((c, col) => {
      if (c && !covered.has(key([r, col]))) errors.push(`${where([r, col])}: not part of any equation`)
    }),
  )
  for (const e of eqs) {
    const ops = [...e.left.ops, ...e.right.ops]
    const stray = ops.filter((op) => !rules.ops.includes(op))
    if (stray.length) errors.push(`${label(e)}: uses ${stray.join(' ')}, but this level only allows ${rules.ops.join(' ')}`)
    // the client: two numbers and one operation only, N op N = N (Oct 17)
    if (ops.length !== 1) errors.push(`${label(e)}: use two numbers and one operation, like −3 + 5 = 2`)
    const ok = holds(e, answer(grid))
    if (ok !== true) errors.push(`${label(e)}: ${typeof ok === 'string' ? ok : 'is not true'}  →  ${text(grid, e)}`)
  }
  const bank = bankOf(grid)
  if (!bank.length) errors.push('no ? squares for students to fill')
  if (!errors.length && countSolutions(grid, eqs, bank) > 1)
    errors.push('more than one way to fill the ? squares with the number bank: show (un-hide) one more number')
  return errors
}

// Brute force over the bank, stopping at `limit`. Puzzles are small, so this is instant.
export function countSolutions(grid: Grid, eqs: Eq[], bank: number[], limit = 2) {
  const all = blanksOf(grid)
  // Fill the blanks of the emptiest equations first so wrong guesses fail early.
  const order: Pos[] = []
  const seen = new Set<string>()
  while (order.length < all.length) {
    let best: Pos[] | null = null
    for (const e of eqs) {
      const open = e.cells.filter((p) => all.some((b) => key(b) === key(p)) && !seen.has(key(p)))
      if (open.length && (!best || open.length < best.length)) best = open
    }
    if (!best) break // a blank outside every equation; validate() already reported it
    for (const p of best) {
      seen.add(key(p))
      order.push(p)
    }
  }
  const touching = order.map((b) => eqs.filter((e) => e.cells.some((p) => key(p) === key(b))))
  const left = new Map<number, number>()
  for (const v of bank) left.set(v, (left.get(v) ?? 0) + 1)
  const placed = new Map<string, number>()
  const val: Lookup = (p) => {
    const c = grid[p[0]][p[1]] as { v: number; hidden: boolean }
    return c.hidden ? placed.get(key(p)) : c.v
  }
  let found = 0
  const go = (i: number) => {
    if (found >= limit) return
    if (i === order.length) return void found++
    const k = key(order[i])
    for (const [v, n] of left) {
      if (!n) continue
      left.set(v, n - 1)
      placed.set(k, v)
      if (touching[i].every((e) => { const ok = holds(e, val); return ok === true || ok === undefined })) go(i + 1)
      placed.delete(k)
      left.set(v, n)
    }
  }
  go(0)
  return found
}
