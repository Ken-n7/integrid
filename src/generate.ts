// Branching math crosswords like printable worksheets.
//  1. Grow: place one equation, then keep crossing a number already on the grid with a new
//     equation in the other direction. Crossword rules: equations only touch where they share
//     a number, so every row/column run stays exactly one equation.
//  2. Hide: blank out numbers one by one, keeping a blank only if the puzzle can still be solved
//     one equation at a time (some equation always has a single missing number). That makes the
//     answer unique and solvable by reasoning, never by guessing.
import { calc, equations, fmt, holds, key, MAX_COLS, parse, validate, type Cell, type Eq, type Grid, type Op, type Pos } from './puzzle.ts'
import { ALL_OPS, LEVELS } from './rules.ts'

export type GenOptions = {
  ops: Op[]
  width: number
  height: number
  equations: number // how many to try to place
  steps: number[] // operators per equation, picked at random: [1] = a + b = c, [2] = a + b × c = d
  max: number // largest absolute value anywhere
  factor: number // largest absolute factor in × and ÷
  hide: number // share of the numbers to blank out, 0–1
  perEquation: number // most blanks in one equation
}
export type Equation = { nums: number[]; ops: Op[]; result: number } // number slots: operands first, result last

// Seeded random numbers (mulberry32), so a seed always makes the same puzzle.
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleWith<T>(xs: T[], rand: () => number) {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const tokens = (e: Equation): Cell[] => [
  ...e.nums.flatMap((v, i): Cell[] => [...(i ? [{ t: 'op', op: e.ops[i - 1] } as Cell] : []), { t: 'num', v, hidden: false }]),
  { t: 'eq' },
  { t: 'num', v: e.result, hidden: false },
]
const step = (p: Pos, across: boolean, n: number): Pos => (across ? [p[0], p[1] + n] : [p[0] + n, p[1]])

// An empty board with crossword rules: equations only touch where they share a number,
// so every row/column run stays exactly one equation.
function board(width: number, height: number) {
  const grid: Grid = Array.from({ length: height }, () => Array<Cell>(width).fill(null))
  const dirs = new Map<string, Set<boolean>>() // number cell → directions it is used in (true = across)
  const placedEqs: Pos[][] = [] // number cells of each equation, oldest first
  const inside = ([r, c]: Pos) => r >= 0 && c >= 0 && r < height && c < width
  const at = (p: Pos) => (inside(p) ? grid[p[0]][p[1]] : null)

  function fits(cells: Cell[], start: Pos, across: boolean) {
    if (at(step(start, across, -1)) || at(step(start, across, cells.length))) return false // runs must not join
    return cells.every((cell, i) => {
      const p = step(start, across, i)
      if (!inside(p)) return false
      const old = at(p)
      if (old) return old.t === 'num' && cell!.t === 'num' && old.v === cell!.v && !dirs.get(key(p))?.has(across)
      const sides: Pos[] = across ? [[p[0] - 1, p[1]], [p[0] + 1, p[1]]] : [[p[0], p[1] - 1], [p[0], p[1] + 1]]
      return sides.every((s) => !at(s)) // touching neighbours would form a stray run
    })
  }
  function place(cells: Cell[], start: Pos, across: boolean) {
    const nums: Pos[] = []
    cells.forEach((cell, i) => {
      const p = step(start, across, i)
      grid[p[0]][p[1]] = cell
      if (cell!.t !== 'num') return
      nums.push(p)
      dirs.set(key(p), (dirs.get(key(p)) ?? new Set()).add(across))
    })
    placedEqs.push(nums)
  }
  return { grid, dirs, placedEqs, at, fits, place }
}

export const crop = (grid: Grid): Grid => {
  const rows = grid.flatMap((row, r) => (row.some(Boolean) ? [r] : []))
  const cols = [...Array(grid[0].length).keys()].filter((c) => grid.some((row) => row[c]))
  return grid.slice(rows[0], rows[rows.length - 1] + 1).map((row) => row.slice(cols[0], cols[cols.length - 1] + 1))
}

export function generate(o: GenOptions, rand: () => number) {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
  const signed = (lo: number, hi: number) => (rand() < 0.5 ? -1 : 1) * int(lo, hi)
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const shuffle = <T>(xs: T[]) => shuffleWith(xs, rand)
  const isMul = (op?: Op) => op === '×' || op === '÷'
  const divisors = (n: number) => {
    const ds: number[] = []
    for (let d = 2; d <= o.factor; d++) if (n % d === 0) ds.push(d, -d)
    return ds
  }

  // A random equation with `steps` operators; `fixed` pins one number slot to a value.
  function equation(steps: number, fixed?: { slot: number; v: number }): Equation | null {
    for (let attempt = 0; attempt < 200; attempt++) {
      const ops = Array.from({ length: steps }, () => pick(o.ops))
      // numbers beside × or ÷ stay small so products stay readable
      const nums = Array.from({ length: steps + 1 }, (_, i) =>
        isMul(ops[i - 1]) || isMul(ops[i]) ? signed(2, o.factor) : signed(1, Math.max(2, Math.floor(o.max / 2))),
      )
      if (fixed && fixed.slot <= steps) nums[fixed.slot] = fixed.v
      if (fixed && fixed.slot > steps && steps === 1) {
        // result pinned: work backwards from it
        const v = fixed.v
        if (ops[0] === '+') nums[1] = v - nums[0]
        if (ops[0] === '−') nums[1] = nums[0] - v
        if (ops[0] === '×') {
          const ds = divisors(v)
          if (!ds.length) continue
          nums[0] = pick(ds)
          nums[1] = v / nums[0]
        }
        if (ops[0] === '÷') nums[0] = v * nums[1]
      } else {
        // make every ÷ come out whole
        for (const [i, op] of ops.entries()) {
          if (op !== '÷') continue
          if (fixed?.slot !== i) nums[i] = nums[i + 1] * signed(2, o.factor)
          else if (fixed.slot !== i + 1) {
            const ds = divisors(nums[i])
            if (!ds.length) break
            nums[i + 1] = pick(ds)
          }
        }
      }
      const result = calc(nums, ops)
      if (typeof result === 'string') continue
      if (fixed && fixed.slot > steps && result !== fixed.v) continue
      const all = [...nums, result]
      // no zeros (sign rules need signs) and no ×1 / ÷1 freebies
      if (all.some((n) => n === 0 || Math.abs(n) > o.max)) continue
      if (nums.some((n, i) => Math.abs(n) === 1 && (isMul(ops[i - 1]) || isMul(ops[i])))) continue
      // partial products count too (7 × 78 ÷ (−6) hides a 546), and no x ÷ x = 1 freebies
      let chain = 0
      let bad = false
      for (const [i, op] of ops.entries()) {
        if (!isMul(op)) {
          chain = i + 1
          continue
        }
        const part = calc(nums.slice(chain, i + 2), ops.slice(chain, i + 1))
        if (typeof part === 'string' || Math.abs(part) > o.max || (op === '÷' && Math.abs(part) === 1)) bad = true
      }
      if (bad) continue
      return { nums, ops, result }
    }
    return null
  }

  // 1. Grow
  const { grid, dirs, placedEqs, at, fits, place } = board(o.width, o.height)
  const crossings = (i: number) => placedEqs[i].filter((p) => dirs.get(key(p))!.size === 2).length

  const first = equation(pick(o.steps))
  if (!first) return null
  const firstCells = tokens(first)
  place(firstCells, [int(0, Math.floor(o.height / 2)), int(0, o.width - firstCells.length)], true)
  let placed = 1
  for (let tries = 0; placed < o.equations && tries < 600; tries++) {
    // Branch mostly from the newest equations and from equations with few crossings,
    // so the puzzle grows like roots instead of a comb of parallel equations.
    const newest = placedEqs.length - 1
    const open = placedEqs.flatMap((nums, i) =>
      nums.filter((p) => dirs.get(key(p))!.size === 1).map((p) => ({ p, w: (i >= newest - 1 ? 3 : 1) * ([3, 2, 0.4][crossings(i)] ?? 0.1) })),
    )
    if (!open.length) break
    let roll = rand() * open.reduce((t, c) => t + c.w, 0)
    const { p } = open.find((c) => (roll -= c.w) <= 0) ?? open[open.length - 1]
    const across = !dirs.get(key(p))!.has(true)
    const steps = pick(o.steps)
    for (const slot of shuffle([...Array(steps + 2).keys()])) {
      const e = equation(steps, { slot, v: (at(p) as { v: number }).v })
      if (!e) continue
      const cells = tokens(e)
      const start = step(p, across, -2 * slot)
      if (fits(cells, start, across)) {
        place(cells, start, across)
        placed++
        break
      }
    }
  }

  // 2. Hide
  const out = crop(grid)
  const { eqs } = equations(out)
  const numbers = out.flatMap((row, r) => row.flatMap((c, col) => (c?.t === 'num' ? [key([r, col])] : [])))
  const hidden = new Set<string>()
  const eqsWith = (k: string) => eqs.filter((e) => e.cells.some((p) => key(p) === k))
  const tryHide = (k: string) => {
    if (hidden.has(k) || eqsWith(k).some((e) => e.cells.filter((p) => hidden.has(key(p))).length >= o.perEquation)) return false
    hidden.add(k)
    if (solvable(out, eqs, hidden)) return true
    hidden.delete(k)
    return false
  }
  // every equation gets at least one blank, then more up to the target
  for (const e of shuffle(eqs))
    if (!e.cells.some((p) => hidden.has(key(p))))
      for (const p of shuffle(e.cells.filter(([r, c]) => out[r][c]!.t === 'num'))) if (tryHide(key(p))) break
  for (const k of shuffle(numbers)) if (hidden.size < Math.round(numbers.length * o.hide)) tryHide(k)

  for (const k of hidden) {
    const [r, c] = k.split(',').map(Number)
    out[r][c] = { ...(out[r][c] as { t: 'num'; v: number }), hidden: true }
  }
  return { grid: out, equations: eqs.length, blanks: hidden.size }
}

// Can a student fill every blank one equation at a time, each time from an equation
// with a single blank that only one bank number fits?
function solvable(grid: Grid, eqs: Eq[], hidden: Set<string>) {
  const known = new Map<string, number>()
  const bank = new Map<number, number>()
  const valueOf = (k: string) => {
    const [r, c] = k.split(',').map(Number)
    return (grid[r][c] as { v: number }).v
  }
  for (const k of hidden) bank.set(valueOf(k), (bank.get(valueOf(k)) ?? 0) + 1)
  const val = (p: Pos) => (hidden.has(key(p)) ? known.get(key(p)) : valueOf(key(p)))
  for (let progress = true; progress; ) {
    progress = false
    for (const e of eqs) {
      const open = e.cells.filter((p) => hidden.has(key(p)) && !known.has(key(p)))
      if (open.length !== 1) continue
      const k = key(open[0])
      const fit = [...bank].filter(([v, n]) => {
        if (!n) return false
        known.set(k, v)
        const ok = holds(e, val) === true
        known.delete(k)
        return ok
      })
      if (fit.length !== 1) continue
      known.set(k, fit[0][0])
      bank.set(fit[0][0], fit[0][1] - 1)
      progress = true
    }
  }
  return known.size === hidden.size
}

const CSV_OP: Record<Op, string> = { '+': '+', '−': '-', '×': 'x', '÷': '/' }
export const toCsv = (g: Grid) =>
  g.map((row) => row.map((c) => (!c ? '' : c.t === 'eq' ? '=' : c.t === 'op' ? CSV_OP[c.op] : (c.hidden ? '?' : '') + c.v)).join(',')).join('\n') + '\n'

// ---------- one puzzle per level (npm run generate, and the admin page's Generate button) ----------

type Preset = Omit<GenOptions, 'ops'>
const relax: Preset = { width: 7, height: 11, equations: 7, steps: [1], max: 20, factor: 10, hide: 0.45, perEquation: 2 }
const expert: Preset = { width: 9, height: 11, equations: 11, steps: [1], max: 50, factor: 12, hide: 0.5, perEquation: 2 }
const PRESETS: Record<string, Preset> = {
  'relax-1': relax,
  'relax-2': relax,
  'relax-3': { ...relax, max: 100 },
  'relax-4': { ...relax, max: 100 },
  'expert-1': expert,
  'expert-2': { ...expert, max: 144 },
  'expert-3': { ...expert, max: 100, factor: 10 },
  // The client wants two numbers per equation only (Oct 17), so no steps: [2] (a + b × c = d) any more.
  'expert-4': { ...expert, max: 100, factor: 10 },
  'expert-5': { ...expert, equations: 12, max: 100, factor: 10, hide: 0.55 },
  battle: { ...expert, max: 100, factor: 10 },
}

// The lesson is sign rules: at least a third of the numbers negative, and in Relax every
// sign pair (+)(+) (+)(−) (−)(+) (−)(−) appears at least once.
function teachesSigns(grid: Grid, relax: boolean) {
  const nums = grid.flat().flatMap((c) => (c?.t === 'num' ? [c.v] : []))
  if (nums.filter((v) => v < 0).length < nums.length / 3) return false
  if (!relax) return true
  const pairs = equations(grid).eqs.map((e) =>
    (e.left.ops.length ? e.left : e.right).nums.map(([r, c]) => ((grid[r][c] as { v: number }).v > 0 ? '+' : '−')).join(''),
  )
  return new Set(pairs).size === 4
}

// From `seed` on, keep the most open layout (fewest filled squares for its size: the branching
// worksheet look, not a packed block) among the first 30 that pass every check, or whatever has
// been found when `budgetMs` runs out. Expert 5 is the slow one (~12 s for all 30).
export function makePuzzle(id: string, seed: number, budgetMs = Infinity) {
  const level = LEVELS.find((l) => l.id === id)
  const preset = PRESETS[id] ?? PRESETS.battle
  const opts = { ...preset, ops: level?.ops ?? ALL_OPS }
  const relax = level?.mode === 'relax'
  const until = Date.now() + budgetMs
  let best: { seed: number; csv: string; fill: number; info: string } | null = null
  for (let s = seed, found = 0; s < seed + 500 && found < 30 && !(best && Date.now() > until); s++) {
    const p = generate(opts, rng(s))
    if (!p || p.equations < preset.equations - 1) continue
    const csv = toCsv(p.grid)
    if (validate(parse(csv), { ops: opts.ops }).length || !teachesSigns(p.grid, relax)) continue
    found++
    const fill = p.grid.flat().filter(Boolean).length / (p.grid.length * p.grid[0].length)
    if (!best || fill < best.fill) best = { seed: s, csv, fill, info: `${p.grid[0].length}×${p.grid.length}  ${p.equations} equations  ${p.blanks} blanks` }
  }
  return best
}


// ---------- the researchers' own equations as a crossword (npm run layout) ----------

// Every link becomes a crossing: an equation crosses one already placed wherever they share a
// number, answers included (two problems with the same answer then share its box). Problems that
// can't connect go last, beside or below the connected part: those that share no number with any
// other, and those whose links got used up (one square holds only two equations). Each step takes
// the spot that adds the fewest rows: on a phone the rows decide the square size, and width is
// capped at 9 anyway. Of `tries` random layouts, keeps the one with the most crossings, then the
// fewest left alone among them, then the shortest longer side (the puzzle box is about square),
// then the smallest area. The blanks are the problems' answers, so learners solve the
// researchers' items as written.
export function layoutPuzzle(given: Equation[], seed: number, tries = 2000) {
  const nums = (cells: Cell[]) => cells.flatMap((c) => (c?.t === 'num' ? [c.v] : []))
  const shares = (a: Cell[], b: Cell[]) => a !== b && nums(a).some((v) => nums(b).includes(v))
  type Spot = { cells: Cell[]; start: Pos; across: boolean; score: number }
  let best: { grid: Grid; score: number[] } | null = null
  for (let s = seed; s < seed + tries; s++) {
    const rand = rng(s)
    const b = board(MAX_COLS, given.length * 6)
    let [top, bottom, left, right] = [Infinity, -Infinity, Infinity, -Infinity]
    const put = ({ cells, start, across }: Spot) => {
      b.place(cells, start, across)
      const end = step(start, across, cells.length - 1)
      ;[top, bottom, left, right] = [Math.min(top, start[0]), Math.max(bottom, end[0]), Math.min(left, start[1]), Math.max(right, end[1])]
    }
    const spot = (cells: Cell[], start: Pos, across: boolean, first = false): Spot => {
      const end = step(start, across, cells.length - 1)
      const rows = Math.max(bottom, end[0]) - Math.min(top, start[0]) + 1
      const cols = Math.max(right, end[1]) - Math.min(left, start[1]) + 1
      return { cells, start, across, score: rows + cols / 10 + rand() / 2 - (first ? 100 : 0) }
    }
    const alone = () => b.placedEqs.filter((ns) => ns.every((p) => b.dirs.get(key(p))!.size === 1))
    const first = (cells: Cell[]) => {
      const across = rand() < 0.5
      return spot(cells, [given.length * 3, Math.floor(rand() * (across ? MAX_COLS - cells.length + 1 : MAX_COLS))], across)
    }
    // crossing an equation that is still alone goes first, so a new group never stays a single equation
    const crossing = (todo: Cell[][], lonely = new Set(alone().flat().map(key))) =>
      todo.flatMap((cells) =>
        b.placedEqs.flat().flatMap((p) => {
          const ds = b.dirs.get(key(p))!
          const v = (b.at(p) as { v: number }).v
          const across = !ds.has(true)
          return ds.size === 2 ? [] : cells.flatMap((c, i) => (c?.t === 'num' && c.v === v && b.fits(cells, step(p, across, -i), across) ? [spot(cells, step(p, across, -i), across, lonely.has(key(p)))] : []))
        }),
      )
    const free = (todo: Cell[][], ok?: (ps: Pos[]) => boolean) =>
      todo.flatMap((cells) => {
        const found: Spot[] = []
        for (let y = top - cells.length - 1; y <= bottom + 2; y++)
          for (let x = 0; x < MAX_COLS; x++)
            for (const across of [true, false])
              if (b.fits(cells, [y, x], across) && (!ok || ok(cells.map((_, i) => step([y, x], across, i))))) found.push(spot(cells, [y, x], across))
        return found
      })
    const take = (todo: Cell[][], found: Spot[]) => {
      const sp = found.reduce((a, x) => (x.score < a.score ? x : a))
      put(sp)
      todo.splice(todo.indexOf(sp.cells), 1)
    }

    // 1. The connected part
    const todo = shuffleWith(given, rand).map(tokens)
    const loners: Cell[][] = []
    while (todo.length) {
      let found = crossing(todo)
      if (!found.length) {
        // nothing crosses: what shares no number with the rest can't connect any more; start a new group
        for (const cells of todo.filter((c) => !todo.some((o) => shares(o, c)))) loners.push(...todo.splice(todo.indexOf(cells), 1))
        if (!todo.length) break
        found = top === Infinity ? [first(todo[0])] : free(todo)
      }
      if (!found.length) break
      take(todo, found)
    }
    const stranded = alone().length // in the connected part but crossing nothing
    // 2. The loners, clear of it
    const [t, bt, l, r] = [top - 1, bottom + 1, left - 1, right + 1]
    while (loners.length) {
      const found = top === Infinity ? [first(loners[0])] : free(loners, (ps) => ps.every(([y, x]) => y < t || y > bt || x < l || x > r))
      if (!found.length) break
      take(loners, found)
    }
    if (b.placedEqs.length < given.length) continue

    const crossings = [...b.dirs.values()].filter((d) => d.size === 2).length
    const score = [-crossings, stranded, Math.max(bottom - top, right - left) + 1, (bottom - top + 1) * (right - left + 1)]
    if (!best || (score.map((x, i) => x - best!.score[i]).find(Boolean) ?? 0) < 0) best = { grid: crop(b.grid), score } // first difference decides
  }
  if (!best) return null
  const { grid } = best
  for (const { cells } of equations(grid).eqs) {
    const [r, c] = cells[cells.length - 1]
    grid[r][c] = { ...(grid[r][c] as { t: 'num'; v: number }), hidden: true }
  }
  return { grid, info: `${grid[0].length}×${grid.length}  ${-best.score[0]} crossings` }
}

// For the command line: blanks in [brackets].
export const preview = (csv: string) =>
  parse(csv)
    .map((row) => '    ' + row.map((c) => (!c ? '·' : c.t === 'eq' ? '=' : c.t === 'op' ? c.op : c.hidden ? `[${fmt(c.v)}]` : fmt(c.v)).padStart(6)).join(''))
    .join('\n')
