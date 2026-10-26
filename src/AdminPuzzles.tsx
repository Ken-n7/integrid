// Puzzles tab: each level's puzzle. Puzzle files from the researchers (puzzles/<level>.csv) are
// locked for the whole study (§13, question 9). Otherwise a level's puzzle is built in the Puzzle
// maker (AdminMaker.tsx), or a sample is approved or regenerated (same generator and checks as
// `npm run generate`); either reaches every phone the next time it opens the app, and swapping one
// that learners already played asks first.
import { useState, type CSSProperties } from 'react'
import { blanksOf, parse } from './puzzle.ts'
import { approvePuzzle, builtIn, isCurrent, puzzleFor } from './puzzles.ts'
import { BATTLES, LEVELS, type Level } from './rules.ts'
import { Deco, Dialog } from './ui.tsx'

type Row = { level: string; puzzle?: string | null }

// A small read-only crossword, answers shown in the boxes for checking.
export function PuzzlePreview({ csv, answers }: { csv: string; answers: boolean }) {
  const grid = parse(csv)
  return (
    <div className="pz" style={{ gridTemplateColumns: `repeat(${grid[0].length}, var(--pz))`, '--cols': grid[0].length } as CSSProperties} role="img" aria-label={describe(csv)}>
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
    w.onerror = () => {
      resolve(null)
      w.terminate()
    }
    w.postMessage({ id, seed: crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000 })
  })
}

function LevelCard({ level, rows, answers, onChange, onEdit }: { level: Level; rows: Row[]; answers: boolean; onChange: () => void; onEdit: () => void }) {
  const current = puzzleFor(level.id)!
  const [next, setNext] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const played = rows.filter((r) => r.level === level.id && isCurrent(level.id, r.puzzle)).length
  const approved = 'approvedAt' in current
  const final = builtIn(level.id)?.sample === false
  const title = level.mode === 'battle' ? level.title : `${level.mode === 'relax' ? 'Relax' : 'Expert'} ${level.n} · ${level.title}`

  async function generate() {
    setBusy(true)
    setMsg('')
    try {
      const p = await makeAnother(level.id)
      if (p) setNext(p.csv)
      else setMsg('No puzzle passed the checks this time. Try again.')
    } catch {
      setMsg('Couldn’t start the puzzle maker. Reload the page and try again.')
    } finally {
      setBusy(false)
    }
  }
  async function save(csv: string) {
    setConfirm(null)
    try {
      await approvePuzzle(level.id, csv)
      setNext(null)
      setMsg('Approved. Phones get it the next time they open the app.')
      onChange()
    } catch (e) {
      setMsg(`Couldn’t save: ${(e as Error).message}`)
    }
  }
  const ask = (csv: string) => (played && csv !== current.csv ? setConfirm(csv) : save(csv))

  return (
    <section className="card pz-card" aria-labelledby={`pz-${level.id}`}>
      <header className="pz-head">
        <h3 id={`pz-${level.id}`}>{title}</h3>
        {final ? (
          <span className="badge ok"><Deco>✓</Deco> Researchers’ puzzle · locked</span>
        ) : approved ? (
          <span className="badge ok"><Deco>✓</Deco> Approved {new Date(current.approvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        ) : (
          <span className="badge warn">Sample</span>
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
      {!final && (
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
              <button className="big secondary" onClick={onEdit}>
                Edit in the puzzle maker
              </button>
            </>
          )}
        </div>
      )}
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

export function Puzzles({ rows, onEdit }: { rows: Row[]; onEdit: (level: string) => void }) {
  const [answers, setAnswers] = useState(true)
  const [, setTick] = useState(0)
  const all = [...LEVELS, ...BATTLES].filter((l) => puzzleFor(l.id))
  const own = all.filter((l) => !puzzleFor(l.id)!.sample).length
  return (
    <>
      <section className="card">
        <h2>Puzzles</h2>
        <details className="teacher-explainer"><summary>About puzzle sources and updates</summary><p>
          The study uses <b>the researchers’ own problems</b>. Build each level’s puzzle in the <b>Puzzle maker</b>; until then it has a <b>sample</b> from the generator,
          which you can approve or swap for another. Learners get a new puzzle the next time they open the app. Swapping one they already played asks first, so everyone
          solves the same problems.
        </p></details>
        <p className="muted">{own === all.length ? `All ${all.length} levels have their own puzzle.` : `${own} of ${all.length} levels have their own puzzle; the rest use a sample.`}</p>
        <label className="check">
          <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} /> Show the answers in the yellow boxes
        </label>
      </section>
      <div className="puzzle-library">{all.map((l) => (
        <LevelCard key={l.id} level={l} rows={rows} answers={answers} onChange={() => setTick((n) => n + 1)} onEdit={() => onEdit(l.id)} />
      ))}</div>
    </>
  )
}
