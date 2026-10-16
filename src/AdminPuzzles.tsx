// Puzzles tab: the researchers review each level's puzzle, approve it, or generate another
// (same generator and checks as `npm run generate`). Approved puzzles reach every phone the next
// time it opens the app. Swapping a puzzle that learners already played asks first (§13, question 9).
import { useState } from 'react'
import { blanksOf, parse } from './puzzle.ts'
import { approvePuzzle, isCurrent, puzzleFor } from './puzzles.ts'
import { BATTLES, LEVELS, type Level } from './rules.ts'
import { Dialog } from './ui.tsx'

type Row = { level: string; puzzle?: string | null }

// A small read-only crossword, answers shown in the boxes for checking.
export function PuzzlePreview({ csv, answers }: { csv: string; answers: boolean }) {
  const grid = parse(csv)
  return (
    <div className="pz" style={{ gridTemplateColumns: `repeat(${grid[0].length}, var(--pz))` }} role="img" aria-label={describe(csv)}>
      {grid.flatMap((row, r) =>
        row.map((c, col) => (
          <span key={`${r},${col}`} className={!c ? 'pz-empty' : c.t === 'num' && c.hidden ? 'pz-blank' : 'pz-cell'}>
            {!c ? '' : c.t === 'eq' ? '=' : c.t === 'op' ? c.op : c.hidden && !answers ? '' : c.v < 0 ? `−${-c.v}` : c.v}
          </span>
        )),
      )}
    </div>
  )
}

// "9×11 · 11 boxes to fill · + − × ÷ · numbers −94 to 92"
function describe(csv: string) {
  const grid = parse(csv)
  const cells = grid.flat()
  const nums = cells.flatMap((c) => (c?.t === 'num' ? [c.v] : []))
  const ops = [...new Set(cells.flatMap((c) => (c?.t === 'op' ? [c.op] : [])))]
  const n = (v: number) => (v < 0 ? `−${-v}` : String(v))
  return `${grid[0].length}×${grid.length} · ${blanksOf(grid).length} boxes to fill · ${ops.join(' ')} · numbers ${n(Math.min(...nums))} to ${n(Math.max(...nums))}`
}

// One generator at a time per card, off the main thread (Expert 5 can take a few seconds).
function makeAnother(id: string) {
  return new Promise<{ csv: string } | null>((resolve) => {
    const w = new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => {
      resolve(e.data)
      w.terminate()
    }
    w.postMessage({ id, seed: crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000 })
  })
}

function LevelCard({ level, rows, answers, onChange }: { level: Level; rows: Row[]; answers: boolean; onChange: () => void }) {
  const current = puzzleFor(level.id)!
  const [next, setNext] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const played = rows.filter((r) => r.level === level.id && isCurrent(level.id, r.puzzle)).length
  const approved = 'approvedAt' in current
  const title = level.mode === 'battle' ? level.title : `${level.mode === 'relax' ? 'Relax' : 'Expert'} ${level.n} · ${level.title}`

  async function generate() {
    setBusy(true)
    setMsg('')
    const p = await makeAnother(level.id)
    setBusy(false)
    if (p) setNext(p.csv)
    else setMsg('No puzzle passed the checks this time. Try again.')
  }
  async function save(csv: string) {
    setConfirm(null)
    try {
      await approvePuzzle(level.id, csv)
      setNext(null)
      setMsg('Approved. Phones get it the next time they open the app.')
      onChange()
    } catch (e) {
      setMsg(/puzzles/.test(String((e as Error).message)) ? 'Saving needs the database update: paste all of supabase/schema.sql into Supabase’s SQL Editor and press Run.' : `Couldn’t save: ${(e as Error).message}`)
    }
  }
  const ask = (csv: string) => (played && csv !== current.csv ? setConfirm(csv) : save(csv))

  return (
    <section className="card pz-card" aria-labelledby={`pz-${level.id}`}>
      <header className="pz-head">
        <h3 id={`pz-${level.id}`}>{title}</h3>
        {approved ? (
          <span className="badge ok">✓ Approved {new Date(current.approvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        ) : (
          <span className="badge warn">{current.sample ? 'Sample: not approved yet' : 'From puzzles/ file'}</span>
        )}
      </header>
      <div className="pz-pair">
        <figure>
          <figcaption>{next ? 'Current puzzle' : 'Puzzle'}</figcaption>
          <PuzzlePreview csv={current.csv} answers={answers} />
          <p className="muted small">{describe(current.csv)}</p>
          <p className="muted small">{played ? `${played} result${played === 1 ? '' : 's'} played on this puzzle.` : 'No one has played this puzzle yet.'}</p>
        </figure>
        {next && (
          <figure className="pz-new">
            <figcaption>New puzzle</figcaption>
            <PuzzlePreview csv={next} answers={answers} />
            <p className="muted small">{describe(next)}</p>
          </figure>
        )}
      </div>
      <div className="row wrap">
        {next ? (
          <>
            <button className="big" onClick={() => ask(next)}>
              Use the new puzzle
            </button>
            <button className="big secondary" onClick={generate} disabled={busy}>
              {busy ? 'Making a puzzle…' : 'Generate another'}
            </button>
            <button className="big secondary" onClick={() => setNext(null)}>
              Keep the current one
            </button>
          </>
        ) : (
          <>
            {!approved && (
              <button className="big" onClick={() => ask(current.csv)}>
                Approve this puzzle
              </button>
            )}
            <button className="big secondary" onClick={generate} disabled={busy}>
              {busy ? 'Making a puzzle…' : 'Generate another'}
            </button>
          </>
        )}
      </div>
      <p className="note" role="status">
        {msg}
      </p>
      {confirm && (
        <Dialog title="Swap a puzzle learners already played?" onClose={() => setConfirm(null)}>
          <p>
            {played} result{played === 1 ? ' was' : 's were'} played on the current puzzle. They stay saved and tied to it, but this level’s ranking starts over, and
            learners who play again get the new puzzle.
          </p>
          <div className="row">
            <button className="big secondary" onClick={() => setConfirm(null)} autoFocus>
              Keep the current one
            </button>
            <button className="big" onClick={() => save(confirm)}>
              Swap the puzzle
            </button>
          </div>
        </Dialog>
      )}
    </section>
  )
}

export function Puzzles({ rows }: { rows: Row[] }) {
  const [answers, setAnswers] = useState(true)
  const [, setTick] = useState(0)
  const all = [...LEVELS, ...BATTLES].filter((l) => puzzleFor(l.id))
  const waiting = all.filter((l) => !('approvedAt' in puzzleFor(l.id)!)).length
  return (
    <>
      <section className="card">
        <h2>Puzzles</h2>
        <p>
          Every level already has a puzzle made by the generator: each one has exactly one answer, can be solved one equation at a time, and practices the sign rules. Your
          paper says the math problems are the researchers’ work, so <b>check each puzzle and approve it</b>, or generate another until you like one.
        </p>
        <p className="muted">{waiting ? `${waiting} of ${all.length} puzzles still need approval.` : `All ${all.length} puzzles are approved.`}</p>
        <label className="check">
          <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} /> Show the answers in the yellow boxes
        </label>
      </section>
      {all.map((l) => (
        <LevelCard key={l.id} level={l} rows={rows} answers={answers} onChange={() => setTick((n) => n + 1)} />
      ))}
    </>
  )
}
