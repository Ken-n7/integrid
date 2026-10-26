// Puzzle maker tab: the researchers build a level's puzzle on the biggest grid they chose for the
// game (13 × 17, every level), checked live by the same checker as every build.
// "Use this puzzle" saves it like an approval on the Puzzles tab: phones get it the next time they
// open the app. Unsaved work stays on this computer, one draft per level, until it's used.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { crop, toCsv } from './generate.ts'
import { bankOf, equations, fmt, key, lenOf, MAX_COLS, MAX_ROWS, parse, readEquation, validate, type Cell, type Grid, type Op, type Pos } from './puzzle.ts'
import { approvePuzzle, builtIn, isCurrent, puzzleFor } from './puzzles.ts'
import { BATTLES, LEVELS, type Level } from './rules.ts'
import { Deco, Dialog, Num } from './ui.tsx'

type Row = { level: string; puzzle?: string | null }
type History = { past: Grid[]; grid: Grid; future: Grid[] }

const ALL = [...LEVELS, ...BATTLES]
const LAST = 'integrid:maker-level'
const DRAFT = (id: string) => `integrid:maker:${id}`
const OP_NAME: Record<Op, string> = { '+': 'plus', '−': 'minus', '×': 'times', '÷': 'divided by' }
const EXAMPLE: Record<Op, string> = { '+': '-12 + (-7) = -19', '−': '-18 - 27 = -45', '×': '-6 x (-4) = 24', '÷': '-10 / 2 = -5' }

const titleOf = (l: Level) => (l.mode === 'battle' ? l.title : `${l.mode === 'relax' ? 'Relax' : 'Expert'} ${l.n} · ${l.title}`)
const empty = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<Cell>(w).fill(null))
const textOf = (c: Cell) => (!c ? '' : c.t === 'eq' ? '=' : c.t === 'op' ? c.op : String(c.v))
const where = ([r, c]: Pos) => `row ${r + 1}, column ${c + 1}`
const spoken = (c: Cell) =>
  !c ? 'empty' : c.t === 'eq' ? 'equals' : c.t === 'op' ? OP_NAME[c.op] : `${c.v < 0 ? `negative ${-c.v}` : c.v}${c.hidden ? ', answer box' : ''}`

// A puzzle on the level's grid from the top left; null if it's bigger than the grid.
function onGrid(csv: string, w: number, h: number): Grid | null {
  const g = parse(csv)
  if (g.length > h || (g[0]?.length ?? 0) > w) return null
  const out = empty(w, h)
  g.forEach((row, r) => row.forEach((c, col) => (out[r][col] = c)))
  return out
}

// What a level opens with: the draft left here, else its current puzzle, else an empty grid.
function opening(id: string): { grid: Grid; note: string } {
  const [w, h] = [MAX_COLS, MAX_ROWS]
  try {
    const draft = localStorage.getItem(DRAFT(id))
    const g = draft && onGrid(draft, w, h)
    if (g) return { grid: g, note: 'Your unsaved draft for this level is back.' }
  } catch {
    // blocked storage or a broken draft: start from the current puzzle
  }
  const current = puzzleFor(id)
  const g = current && onGrid(current.csv, w, h)
  return g ? { grid: g, note: '' } : { grid: empty(w, h), note: current ? `The current puzzle is bigger than ${w} × ${h}, so the grid starts empty.` : '' }
}

function remember(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    // blocked storage: nothing is kept between visits
  }
}

export function PuzzleMaker({ rows, level }: { rows: Row[]; level?: string }) {
  const [boot] = useState(() => {
    let id = level
    try {
      id ??= localStorage.getItem(LAST) ?? undefined
    } catch {
      // blocked storage
    }
    id = ALL.some((l) => l.id === id) ? id! : LEVELS[0].id
    return { id, ...opening(id) }
  })
  const [id, setId] = useState(boot.id)
  const [h, setH] = useState<History>({ past: [], grid: boot.grid, future: [] })
  const [dirty, setDirty] = useState(false) // changed since it was opened or used
  const [sel, setSel] = useState<Pos>([0, 0])
  const [draft, setDraft] = useState<string | null>(null) // what's being typed into the selected square
  const [across, setAcross] = useState(true)
  const [learner, setLearner] = useState(false)
  const [eq, setEq] = useState('')
  const [eqBox, setEqBox] = useState(true)
  const [eqError, setEqError] = useState('')
  const [squareError, setSquareError] = useState('')
  const [msg, setMsg] = useState(boot.note)
  const [confirm, setConfirm] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const lv = ALL.find((l) => l.id === id)!
  const [w, ht] = [MAX_COLS, MAX_ROWS]
  const grid = h.grid
  const at = ([r, c]: Pos): Cell => grid[r]?.[c] ?? null
  const here = at(sel)
  const filled = grid.some((row) => row.some(Boolean))
  const errors = useMemo(() => (filled ? validate(grid, { ops: lv.ops }) : []), [grid, lv, filled])
  const { eqs } = useMemo(() => equations(grid), [grid])
  const bank = bankOf(grid)
  const ready = filled && !errors.length
  const current = puzzleFor(id)
  const locked = builtIn(id)?.sample === false
  const played = rows.filter((r) => r.level === id && isCurrent(id, r.puzzle)).length
  const csv = filled ? toCsv(crop(grid)) : ''

  // The squares each problem points at: a whole equation for "row 3, column 1 across: …".
  const bad = useMemo(() => {
    const out = new Set<string>()
    for (const e of errors) {
      const m = /row (\d+), column (\d+)( across| down)?/.exec(e)
      if (!m) continue
      const k = `${+m[1] - 1},${+m[2] - 1}`
      const whole = m[3] && eqs.find((q) => key(q.cells[0]) === k && q.across === (m[3] === ' across'))
      for (const p of whole ? whole.cells : [k.split(',').map(Number) as Pos]) out.add(key(p))
    }
    return out
  }, [errors, eqs])

  useEffect(() => {
    if (dirty) remember(DRAFT(id), toCsv(grid))
  }, [dirty, grid, id])

  // Arrow keys move the focus along with the selection, but only while it's in the grid.
  useEffect(() => {
    const g = gridRef.current
    if (g?.contains(document.activeElement)) g.querySelector<HTMLElement>(`[data-pos="${key(sel)}"]`)?.focus()
  }, [sel])

  function change(next: Grid) {
    setH((x) => ({ past: [...x.past.slice(-99), x.grid], grid: next, future: [] }))
    setDirty(true)
  }
  const put = (cells: [Pos, Cell][]) => {
    const next = grid.map((row) => [...row])
    for (const [[r, c], v] of cells) next[r][c] = v
    change(next)
  }
  function undo() {
    setDraft(null)
    setSquareError('')
    setH((x) => (x.past.length ? { past: x.past.slice(0, -1), grid: x.past[x.past.length - 1], future: [x.grid, ...x.future] } : x))
    setDirty(true)
  }
  function redo() {
    setDraft(null)
    setSquareError('')
    setH((x) => (x.future.length ? { past: [...x.past, x.grid], grid: x.future[0], future: x.future.slice(1) } : x))
    setDirty(true)
  }

  function switchTo(next: string) {
    const o = opening(next)
    setId(next)
    setH({ past: [], grid: o.grid, future: [] })
    setDirty(false)
    setSel([0, 0])
    setDraft(null)
    setEqError('')
    setSquareError('')
    setMsg(o.note)
    remember(LAST, next)
  }

  // The selected square as it will be once what's being typed goes in; undefined if it can't be read.
  function typedCell(): Cell | undefined {
    if (draft === null) return here
    const text = draft.replace(/,/g, '').trim()
    try {
      const c = text ? parse(text)[0][0] : null
      // a new number in an answer box stays an answer box
      return c?.t === 'num' && here?.t === 'num' && here.hidden && !text.startsWith('?') ? { ...c, hidden: true } : c
    } catch {
      return undefined
    }
  }
  const unreadable = () => setSquareError(`Can’t read “${(draft ?? '').trim()}”. Type a number like −7, or one of + − × ÷ =.`)
  const now = typedCell()

  // The typed text goes into the selected square. False (and a message) if it can't be read.
  function commit() {
    if (draft === null) return true
    const c = typedCell()
    if (c === undefined) {
      unreadable()
      return false
    }
    setDraft(null)
    setSquareError('')
    if (textOf(c) !== textOf(here) || (c?.t === 'num' && here?.t === 'num' && c.hidden !== here.hidden)) put([[sel, c]])
    return true
  }
  const clamp = ([r, c]: Pos): Pos => [Math.min(ht - 1, Math.max(0, r)), Math.min(w - 1, Math.max(0, c))]
  const move = (dr: number, dc: number) => setSel(([r, c]) => clamp([r + dr, c + dc]))
  const advance = () => (across ? move(0, 1) : move(1, 0))
  function select(p: Pos) {
    if (key(p) !== key(sel) && !commit()) return
    setSel(p)
  }
  function focusSquare(p: Pos) {
    if (!commit()) return
    setSel(p)
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-pos="${key(p)}"]`)?.focus())
  }

  function setSymbol(c: Cell) {
    setDraft(null)
    setSquareError('')
    put([[sel, c]])
    advance()
  }
  // These act on what's typed in the square too, not only what's saved there.
  function toggleBox() {
    if (now === undefined) return unreadable()
    if (now?.t !== 'num') return setSquareError('Only a number can be an answer box.')
    setDraft(null)
    setSquareError('')
    put([[sel, { ...now, hidden: !now.hidden }]])
  }
  function flipSign() {
    if (now === undefined) return unreadable()
    if (now?.t !== 'num') return setSquareError('Select a number to make it negative or positive.')
    setDraft(null)
    setSquareError('')
    put([[sel, { ...now, v: -now.v }]])
  }

  function onGridKey(e: KeyboardEvent) {
    const k = e.key
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z' || k === 'y')) {
      e.preventDefault()
      return k === 'y' || e.shiftKey ? redo() : undo()
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const arrow = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, [number, number]>)[k]
    if (arrow) {
      e.preventDefault()
      if (commit()) move(...arrow)
    } else if (k === 'Enter') {
      e.preventDefault()
      if (commit()) advance()
    } else if (k === 'Escape') {
      setDraft(null)
      setSquareError('')
    } else if (k === 'Backspace') {
      e.preventDefault()
      if (draft !== null) setDraft(draft.slice(0, -1))
      else if (here) put([[sel, null]])
    } else if (k === 'Delete') {
      setDraft(null)
      if (here) put([[sel, null]])
    } else if (k === '?' && draft === null && now?.t === 'num') {
      e.preventDefault()
      toggleBox()
    } else if (k.length === 1 && k !== ' ') {
      e.preventDefault()
      setDraft((draft ?? '') + k)
      setSquareError('')
    }
  }

  // Write an equation: it goes across or down from the selected square, or, if that square holds
  // a number the equation uses, crosses it there.
  function place() {
    const e = readEquation(eq)
    if (e === null) return setEqError(`Write it like ${EXAMPLE[lv.ops[0]]}: two numbers, one of ${lv.ops.join(' ')}, then = and the answer.`)
    if (typeof e === 'string') return setEqError(`That isn’t right: ${e}.`)
    if (!lv.ops.includes(e.ops[0])) return setEqError(`${titleOf(lv)} uses only ${lv.ops.join(' ')}.`)
    const cells: Cell[] = [
      { t: 'num', v: e.nums[0], hidden: false },
      { t: 'op', op: e.ops[0] },
      { t: 'num', v: e.nums[1], hidden: false },
      { t: 'eq' },
      { t: 'num', v: e.result, hidden: eqBox },
    ]
    if (now === undefined) return unreadable()
    const step = (p: Pos, n: number): Pos => (across ? [p[0], p[1] + n] : [p[0] + n, p[1]])
    const before = at(step(sel, -1))
    const after = at(step(sel, 1))
    const slot = now?.t === 'num'
      ? !before && after?.t === 'op' && now.v === e.result ? 2 : [e.nums[0], e.nums[1], e.result].indexOf(now.v)
      : -1
    if (now && slot < 0)
      return setEqError(`The square at ${where(sel)} has ${textOf(now)}, which isn’t in this equation. Select an empty square to start from, or a number the equation uses.`)
    // continuing a chain (-12 + (-7) = -19 + 14 = -5): start from the answer that ends an equation,
    // or end on the number that starts one
    const chains = (slot === 0 && before?.t === 'eq' && !after) || (slot === 2 && after?.t === 'op' && !before)
    if (slot >= 0 && (before || after) && !chains)
      return setEqError(`The ${fmt((now as { v: number }).v)} at ${where(sel)} already has an equation going ${across ? 'across' : 'down'}. Choose ${across ? 'Down' : 'Across'} to cross it.`)
    const start = step(sel, -2 * Math.max(0, slot))
    const out: [Pos, Cell][] = []
    for (const [i, c] of cells.entries()) {
      const p = step(start, i)
      if (p[0] < 0 || p[1] < 0 || p[0] >= ht || p[1] >= w)
        return setEqError(`It doesn’t fit: it needs 5 squares going ${across ? 'right' : 'down'} from ${where(start)}. Select a square further ${across ? 'left' : 'up'}, or choose ${across ? 'Down' : 'Across'}.`)
      const old = key(p) === key(sel) ? now : at(p)
      if (old && textOf(old) !== textOf(c)) return setEqError(`There’s already ${textOf(old)} at ${where(p)}. Clear it or start somewhere else.`)
      out.push([p, old?.t === 'num' && c?.t === 'num' ? { ...c, hidden: old.hidden || c.hidden } : c])
    }
    setEqError('')
    setDraft(null)
    put(out)
    setEq('')
    setMsg(`Placed ${eq.trim()} going ${across ? 'across' : 'down'} from ${where(start)}.`)
  }

  async function open(f: File) {
    try {
      const text = await f.text()
      const g = onGrid(text, w, ht)
      if (!g) {
        const p = parse(text)
        return setMsg(`${f.name} is ${p[0]?.length ?? 0} × ${p.length}; ${titleOf(lv)} fits in ${w} × ${ht}.`)
      }
      change(g)
      setMsg(`Opened ${f.name}. Undo brings back what was on the grid.`)
    } catch (e) {
      setMsg(`Couldn’t read ${f.name}: ${(e as Error).message}`)
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: `${id}.csv` }).click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function loadCurrent() {
    const g = current && onGrid(current.csv, w, ht)
    if (!g) return setMsg(`The current puzzle doesn’t fit in ${w} × ${ht}.`)
    change(g)
    setMsg('Loaded the current puzzle. Undo brings back what was on the grid.')
  }
  function clear() {
    change(empty(w, ht))
    setMsg('Cleared. Undo brings it back.')
  }

  async function save() {
    setConfirm(false)
    try {
      await approvePuzzle(id, csv)
      remember(DRAFT(id), null)
      setDirty(false)
      setMsg(`Saved. ${titleOf(lv)} now uses this puzzle; phones get it the next time they open the app.`)
    } catch (e) {
      setMsg(`Couldn’t save: ${(e as Error).message}`)
    }
  }
  const use = () => (played && csv.trim() !== current?.csv.trim() ? setConfirm(true) : save())
  const why = locked
    ? 'Locked: this level has the researchers’ own puzzle file.'
    : !filled
      ? 'Build a puzzle first.'
      : errors.length
        ? `Fix ${errors.length === 1 ? 'the problem' : `the ${errors.length} problems`} in Check first.`
        : played
          ? `${played} result${played === 1 ? ' was' : 's were'} played on the current puzzle; you’ll be asked first.`
          : 'Learners get it the next time they open the app.'
  const status = locked ? 'Researchers’ file · locked' : current && 'approvedAt' in current ? 'Approved puzzle' : 'Sample puzzle'

  return (
    <div className="mk">
      <section className="card mk-top" aria-labelledby="mk-title">
        <h2 id="mk-title">Puzzle maker</h2>
        <div className="mk-top-row">
          <label className="mk-level">
            Level
            <select value={id} onChange={(e) => switchTo(e.target.value)}>
              {(['relax', 'expert', 'battle'] as const).map((mode) => (
                <optgroup key={mode} label={mode[0].toUpperCase() + mode.slice(1)}>
                  {ALL.filter((l) => l.mode === mode).map((l) => (
                    <option key={l.id} value={l.id}>
                      {titleOf(l)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="mk-use">
            <button className="big" onClick={use} disabled={!ready || locked} aria-describedby="mk-why">
              Use this puzzle
            </button>
            <p id="mk-why" className="muted small">
              {why}
            </p>
          </div>
        </div>
        <p className="muted small">
          {w} × {ht} grid · uses {lv.ops.join(' ')} · now playing: {status}
          {dirty && ' · unsaved changes are kept on this computer'}
        </p>
        <p className="mk-msg" role="status">
          {msg}
        </p>
      </section>

      <section className="card mk-board" aria-label="Grid">
        <div className="mk-tools">
          <button className="mk-btn" onClick={undo} disabled={!h.past.length}>
            Undo
          </button>
          <button className="mk-btn" onClick={redo} disabled={!h.future.length}>
            Redo
          </button>
          <div className="mk-seg" role="group" aria-label="Direction for Enter and new equations">
            <button className="mk-btn" aria-pressed={across} onClick={() => setAcross(true)}>
              <Deco>→</Deco> Across
            </button>
            <button className="mk-btn" aria-pressed={!across} onClick={() => setAcross(false)}>
              <Deco>↓</Deco> Down
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={learner} onChange={(e) => setLearner(e.target.checked)} /> Learner view
          </label>
        </div>

        <div className="mk-scroll">
          <div
            ref={gridRef}
            className="mk-grid"
            role="group"
            aria-label={`Puzzle grid, ${w} columns by ${ht} rows`}
            aria-describedby="mk-keys"
            style={{ '--w': w } as CSSProperties}
            onKeyDown={onGridKey}
          >
            <span aria-hidden="true" />
            {grid[0].map((_, c) => (
              <span key={c} className="mk-label" aria-hidden="true">
                {c + 1}
              </span>
            ))}
            {grid.map((row, r) => [
              <span key={`r${r}`} className="mk-label" aria-hidden="true">
                {r + 1}
              </span>,
              ...row.map((c, col) => {
                const k = `${r},${col}`
                const isSel = k === key(sel)
                const typing = isSel && draft !== null
                const cls = `mk-cell${c ? (c.t === 'num' && c.hidden ? ' box' : ' on') : ''}${isSel ? ' sel' : ''}${bad.has(k) ? ' bad' : ''}`
                return (
                  <button
                    key={k}
                    data-pos={k}
                    data-len={c?.t === 'num' && !typing ? lenOf(c.v) : undefined}
                    className={cls}
                    tabIndex={isSel ? 0 : -1}
                    aria-pressed={isSel}
                    aria-label={`${where([r, col])}: ${typing ? `typing ${draft}` : spoken(c)}${bad.has(k) ? ', has a problem' : ''}`}
                    onClick={() => select([r, col])}
                  >
                    {typing ? (
                      <span className="mk-typing">{draft || ' '}</span>
                    ) : !c ? (
                      ''
                    ) : c.t === 'num' ? (
                      c.hidden && learner ? '' : <Num v={c.v} />
                    ) : c.t === 'op' ? (
                      c.op
                    ) : (
                      '='
                    )}
                  </button>
                )
              }),
            ])}
          </div>
        </div>

        <div className="mk-square">
          <label htmlFor="mk-sq">Square: {where(sel)}</label>
          <input
            id="mk-sq"
            autoComplete="off"
            value={draft ?? textOf(here)}
            placeholder="empty"
            aria-invalid={!!squareError}
            aria-describedby="mk-sq-error"
            onChange={(e) => {
              setDraft(e.target.value)
              setSquareError('')
            }}
            onBlur={() => commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && commit()) advance()
              if (e.key === 'Escape') setDraft(null)
            }}
          />
          <div className="mk-keys" role="group" aria-label="Put in the selected square">
            {[...lv.ops, '='].map((s) => (
              <button key={s} className="mk-btn sym" aria-label={s === '=' ? 'equals' : OP_NAME[s as Op]} onClick={() => setSymbol(s === '=' ? { t: 'eq' } : { t: 'op', op: s as Op })}>
                {s}
              </button>
            ))}
            <button className="mk-btn" onClick={flipSign} disabled={now?.t !== 'num'}>
              ± Sign
            </button>
            <button className="mk-btn" aria-pressed={now?.t === 'num' && now.hidden} onClick={toggleBox} disabled={now?.t !== 'num'}>
              Answer box
            </button>
            <button className="mk-btn" onClick={() => setSymbol(null)} disabled={!now && draft === null}>
              Clear
            </button>
          </div>
          <p id="mk-sq-error" className="error" role="alert">
            {squareError}
          </p>
        </div>
        <details className="mk-help">
          <summary>Keyboard shortcuts</summary>
          <p id="mk-keys">
            Arrow keys move between squares. Type a number like −7, or + − × ÷ =, then Enter: it moves on {across ? 'across' : 'down'}. ? makes a number an answer box.
            Delete clears a square. Ctrl+Z undoes, Ctrl+Y redoes.
          </p>
        </details>
      </section>

      <section className="card mk-eq" aria-labelledby="mk-eq-title">
        <h3 id="mk-eq-title">Write an equation</h3>
        <label htmlFor="mk-eq">Equation</label>
        <input
          id="mk-eq"
          autoComplete="off"
          value={eq}
          placeholder={`e.g. ${EXAMPLE[lv.ops[0]]}`}
          aria-invalid={!!eqError}
          aria-describedby="mk-eq-help mk-eq-error"
          onChange={(e) => {
            setEq(e.target.value)
            setEqError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') place()
          }}
        />
        <p id="mk-eq-help" className="muted small">
          It goes {across ? 'across' : 'down'} from the selected square ({where(sel)}). Select a number already on the grid to cross it there. Leave out “= …” and the
          answer is worked out.
        </p>
        <label className="check">
          <input type="checkbox" checked={eqBox} onChange={(e) => setEqBox(e.target.checked)} /> Make its answer a yellow box
        </label>
        <button className="big" onClick={place} disabled={!eq.trim()}>
          Place it {across ? 'across' : 'down'}
        </button>
        <p id="mk-eq-error" className="error" role="alert">
          {eqError}
        </p>
      </section>

      <section className="card mk-check" aria-labelledby="mk-check-title">
        <div className="pz-head">
          <h3 id="mk-check-title">Check</h3>
          <span className={`badge ${ready ? 'ok' : 'warn'}`} role="status">
            {!filled ? 'Empty grid' : ready ? <><Deco>✓</Deco> Ready to use</> : `${errors.length} to fix`}
          </span>
        </div>
        {!filled && <p className="muted">Write an equation, or select a square and type.</p>}
        {errors.length > 0 && (
          <ul className="mk-errors">
            {errors.map((e, i) => {
              const m = /row (\d+), column (\d+)/.exec(e)
              return (
                <li key={i}>
                  {m ? (
                    <button className="link" onClick={() => focusSquare([+m[1] - 1, +m[2] - 1])}>
                      {e}
                    </button>
                  ) : (
                    e
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {filled && (
          <>
            <p className="muted small">
              {eqs.length} equation{eqs.length === 1 ? '' : 's'} · {bank.length} answer box{bank.length === 1 ? '' : 'es'}
            </p>
            <div>
              <p className="mk-sub">Number bank</p>
              <div className="mk-bank">
                {bank.length ? bank.map((v, i) => <span key={i}>{v < 0 ? `−${-v}` : v}</span>) : <span className="muted small">No answer boxes yet.</span>}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="card mk-files" aria-labelledby="mk-files-title">
        <h3 id="mk-files-title">Files</h3>
        <div className="mk-keys">
          <button className="mk-btn" onClick={() => fileRef.current!.click()}>
            Open a CSV…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void open(f)
            }}
          />
          <button className="mk-btn" onClick={download} disabled={!filled}>
            Download CSV
          </button>
          <button className="mk-btn" onClick={loadCurrent} disabled={!current}>
            Load the current puzzle
          </button>
          <button className="mk-btn" onClick={clear} disabled={!filled}>
            Clear the grid
          </button>
        </div>
        <p className="muted small">Made a puzzle in Google Sheets with the guide? Open its CSV here to check it and use it. Opening, loading and clearing can be undone.</p>
      </section>

      {confirm && (
        <Dialog title="Swap a puzzle learners already played?" onClose={() => setConfirm(false)}>
          <p>
            {played} result{played === 1 ? ' was' : 's were'} played on the current puzzle. They stay saved and tied to it, but this level’s ranking starts over, and
            learners who play again get the new puzzle.
          </p>
          <div className="row">
            <button className="big secondary" onClick={() => setConfirm(false)} autoFocus>
              Keep the current one
            </button>
            <button className="big" onClick={save}>
              Swap the puzzle
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
