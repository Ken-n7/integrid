import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useBack } from './back.ts'
import { clue, guideFor, sayNum, sayPattern, SIGN_RULES, type RuleSection } from './content.ts'
import { bankOf, blanksOf, equations, key, lenOf, parse } from './puzzle.ts'
import { versionOf } from './puzzles.ts'
import { clock, HEARTS, MODES, reward, type Attempt, type Level, type Result } from './rules.ts'
import { sfx } from './sound.ts'
import { uuid } from './store.ts'
import { Coins, Deco, Dialog, Icon, Num } from './ui.tsx'

type Run = {
  id: string
  at: string
  start: number
  end?: number
  filled: Record<string, boolean> // cell → solved with a hint?
  hearts: number
  wrong: number
  hints: number
  mistakes: [number, number][]
  status: 'play' | 'win' | 'lose'
}

// The (!) button and the pop-up it opens when a level starts: hidden Oct 17 (Ken: it repeated 📖 Rules,
// which now holds Relax's free clue). true brings both back.
const INFO = false

const newRun = (): Run => ({ id: uuid(), at: new Date().toISOString(), start: Date.now(), filled: {}, hearts: HEARTS, wrong: 0, hints: 0, mistakes: [], status: 'play' })

// Battle Mode: the group's shared grid and live ranking, from the room (Battle.tsx).
export type BattleLink = {
  title: string // "Group 2"
  startedAt: number
  seconds: number // round time
  shared: Record<string, boolean> // boxes the group solved, teammates' too
  hearts: number // the group's shared hearts left: any member's wrong answer costs one
  over: boolean
  bars: ReactNode
  result: ReactNode
  onSolve: (k: string, hint: boolean) => void
  onWrong: (wrong: number) => void
}

type Props = {
  level: Level
  csv: string
  sample: boolean
  coins: number // balance from finished attempts
  rankOf: (seconds: number, wrong: number) => number | null // null = offline
  onProgress: (a: Attempt) => void
  onFinish: (a: Attempt) => void
  onExit: () => void
  onNext: (() => void) | null
  battle?: BattleLink
}

export function Game({ level, csv, sample, coins, rankOf, onProgress, onFinish, onExit, onNext, battle }: Props) {
  const rules = MODES[level.mode]
  const { grid, eqs, blanks, bank, version } = useMemo(() => {
    const grid = parse(csv)
    return { grid, eqs: equations(grid).eqs, blanks: blanksOf(grid).map(key), bank: bankOf(grid), version: versionOf(csv) }
  }, [csv])
  const answerOf = (k: string) => {
    const [r, c] = k.split(',').map(Number)
    return (grid[r][c] as { v: number }).v
  }

  const [run, setRun] = useState(() => (battle ? { ...newRun(), start: battle.startedAt, at: new Date(battle.startedAt).toISOString() } : newRun()))
  const [sel, setSel] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ k: string; v: number; ok: boolean; t: number } | null>(null) // the box that just got an answer: blinks green or red
  const [msg, setMsg] = useState<ReactNode>('')
  const [nudge, setNudge] = useState(false)
  const [dialog, setDialog] = useState<'rules' | 'leave' | 'restart' | null>(null)
  const [info, setInfo] = useState(INFO && !battle) // the (!) popup opens when the level starts…
  const [started, setStarted] = useState(!!battle || !INFO) // …and the clock starts when it closes, so reading costs no coins
  const [wiggle, setWiggle] = useState(false)
  const board = useRef<HTMLDivElement>(null)
  const [clear, setClear] = useState<'top' | 'left' | null>(null) // side kept clear for the (!) corner
  const [more, setMore] = useState({ up: false, down: false }) // squares scrolled out of sight above / below
  const [now, setNow] = useState(Date.now)

  const ticking = battle ? !battle.over : run.status === 'play' // a battle's clock runs until the round ends
  useEffect(() => {
    if (!ticking) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [ticking])
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 700)
    return () => clearTimeout(t)
  }, [flash])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 2500)
    return () => clearTimeout(t)
  }, [msg])
  useEffect(() => {
    if (!nudge) return
    const t = setTimeout(() => setNudge(false), 900)
    return () => clearTimeout(t)
  }, [nudge])
  useEffect(() => {
    if (!wiggle) return
    const t = setTimeout(() => setWiggle(false), 1600)
    return () => clearTimeout(t)
  }, [wiggle])

  // The (!) sits in the puzzle box's top-left corner. If the grid would put a square under it,
  // the box keeps a strip clear on whichever side (top or left) shrinks the squares less.
  // Decided from the box's full size, so adding the strip can't flip the answer back.
  useEffect(() => {
    if (!INFO) return
    const el = board.current!
    const ICON = 44
    const check = () => {
      const w = el.clientWidth - 4 // minus the box's 2px padding
      const h = el.clientHeight - 4
      const fit = (w: number, h: number) => Math.min(44, w / grid[0].length, Math.max(30, h / grid.length)) // same sizing as the CSS
      const box = fit(w, h)
      const left = (w - box * grid[0].length) / 2
      const top = (h - box * grid.length) / 2
      const covered = grid.some((row, r) => top + r * box < ICON && row.some((c, col) => c && left + col * box < ICON))
      setClear(!covered ? null : fit(w - ICON, h) >= fit(w, h - ICON) ? 'left' : 'top')
    }
    check()
    const resize = new ResizeObserver(check)
    resize.observe(el)
    return () => resize.disconnect()
  }, [grid])

  // A puzzle taller than the box scrolls inside it (squares never go below 30px): show which edge
  // has more squares past it, since phones hide the scrollbar until you scroll.
  useEffect(() => {
    const el = board.current!
    const check = () => {
      const up = el.scrollTop > 2
      const down = el.scrollTop + el.clientHeight < el.scrollHeight - 2
      setMore((m) => (m.up === up && m.down === down ? m : { up, down }))
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    const resize = new ResizeObserver(check)
    resize.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      resize.disconnect()
    }
  }, [grid])

  const filled = battle ? { ...battle.shared, ...run.filled } : run.filled
  const allDone = blanks.every((k) => k in filled)
  const seconds = started ? Math.max(0, Math.floor(((run.end ?? now) - run.start) / 1000)) : 0
  const left = battle ? Math.max(0, battle.seconds - Math.floor((now - run.start) / 1000)) : 0
  const hearts = battle ? battle.hearts : run.hearts
  // When hearts go down (a teammate's mistake too, in Battle), the heart that broke falls with a −1.
  const [prevHearts, setPrevHearts] = useState(hearts)
  const [drop, setDrop] = useState<{ i: number; t: number } | null>(null)
  if (hearts !== prevHearts) {
    setPrevHearts(hearts)
    if (hearts < prevHearts) setDrop({ i: hearts, t: (drop?.t ?? 0) + 1 })
  }
  useEffect(() => {
    if (!drop) return
    const t = setTimeout(() => setDrop(null), 900)
    return () => clearTimeout(t)
  }, [drop])
  const playing = run.status === 'play' && !(battle && (allDone || battle.over || hearts <= 0))
  // after a finish, the app's balance already includes this run's coins
  const balance = playing ? coins - run.hints * rules.hintCost : coins
  const canHint = playing && run.hints < rules.hintLimit && balance >= rules.hintCost
  const active = battle ? !battle.over : playing && (Object.keys(run.filled).length > 0 || run.wrong > 0 || run.hints > 0)
  useBack(() => (active ? setDialog('leave') : onExit())) // same as the back button

  // Each correct cell uses up one bank tile with its value.
  const used = new Map<number, number>()
  for (const k of Object.keys(filled)) used.set(answerOf(k), (used.get(answerOf(k)) ?? 0) + 1)
  const seen = new Map<number, number>()
  const tiles = bank.map((v) => {
    const n = (seen.get(v) ?? 0) + 1
    seen.set(v, n)
    return { v, used: n <= (used.get(v) ?? 0) }
  })

  const attemptOf = (r: Run, result: Result, earned: number, secs: number): Attempt => ({
    id: r.id,
    level: level.id,
    result,
    seconds: secs,
    wrong: r.wrong,
    hints: r.hints,
    coins: earned - r.hints * rules.hintCost,
    mistakes: r.mistakes,
    at: r.at,
    puzzle: version,
  })

  function commit(next: Run) {
    const end = Date.now()
    const secs = Math.floor((end - next.start) / 1000)
    const status = blanks.every((k) => k in next.filled || (battle && k in battle.shared)) ? 'win' : next.hearts <= 0 ? 'lose' : 'play'
    if (status === 'play' || battle) {
      // a battle's result is the group's: the room logs it when the round ends
      setRun(status === 'play' ? next : { ...next, status, end })
      if (status !== 'play') setSel(null)
      onProgress(attemptOf(next, 'quit', 0, secs)) // saved as "quit" until the level ends
      return
    }
    setRun({ ...next, status, end })
    setSel(null)
    onFinish(attemptOf(next, status, status === 'win' ? reward(level.mode, secs) : 0, secs))
  }

  // After choosing a box, keyboard focus jumps to the number bank (no visible change on touch screens).
  function select(k: string) {
    if (!playing || k in filled) return
    setSel(k === sel ? null : k)
    if (k !== sel) requestAnimationFrame(() => document.querySelector<HTMLElement>('.bank .tile:not(:disabled)')?.focus())
  }

  function place(i: number) {
    if (!playing || tiles[i].used) return
    if (!sel) {
      setMsg('Tap a yellow box first!')
      setNudge(true)
      return
    }
    if (sel in filled) {
      setSel(null) // a teammate solved it a moment ago
      setMsg('A teammate just solved that box!')
      return
    }
    const want = answerOf(sel)
    const v = tiles[i].v
    if (v === want) {
      setSel(null)
      setMsg('') // the green blink says it; a screen reader hears "Correct!" below
      setFlash({ k: sel, v, ok: true, t: (flash?.t ?? 0) + 1 })
      sfx.right()
      const mine = { ...run.filled, [sel]: false }
      commit({ ...run, filled: mine })
      battle?.onSolve(sel, false)
      const next = blanks.find((k) => !(k in mine) && !(k in filled))
      if (next) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus())
      return
    }
    // The red blink and the falling heart say it; in Relax the (!) (or 📖 Rules) wiggles toward the free clue.
    setFlash({ k: sel, v, ok: false, t: (flash?.t ?? 0) + 1 }) // t restarts the animation
    setMsg('')
    sfx.wrong()
    if (rules.clue) setWiggle(true)
    battle?.onWrong(run.wrong + 1)
    commit({ ...run, hearts: run.hearts - 1, wrong: run.wrong + 1, mistakes: [...run.mistakes, [want, v]] })
  }

  function hint() {
    if (!canHint) {
      if (playing) setMsg(run.hints >= rules.hintLimit ? 'No hints left for this level.' : `A hint costs ${rules.hintCost} coins.`)
      return
    }
    const target = sel && !(sel in filled) ? sel : blanks.find((k) => !(k in filled))
    if (!target) return
    setSel(null)
    battle?.onSolve(target, true)
    commit({ ...run, hints: run.hints + 1, filled: { ...run.filled, [target]: true } })
  }

  // Undo takes back your last correct number (filled keeps placement order). Hints and lost hearts stay.
  const undoable = battle ? undefined : Object.keys(run.filled).findLast((k) => !run.filled[k])
  function undo() {
    if (!playing || !undoable) return
    const { [undoable]: _, ...rest } = run.filled
    setSel(undoable)
    setMsg('Number taken back.')
    commit({ ...run, filled: rest })
  }

  function closeInfo() {
    setInfo(false)
    if (started) return
    const t = Date.now()
    setStarted(true)
    setRun((r) => ({ ...r, start: t, at: new Date(t).toISOString() }))
    setNow(t)
  }

  function quitRun() {
    if (active) onFinish(attemptOf(run, 'quit', 0, seconds))
  }
  function restart() {
    quitRun()
    setRun(newRun())
    setNow(Date.now())
    setSel(null)
    setFlash(null)
    setDialog(null)
  }

  // Relax's free clue for the selected box (the client's "guided practice"), shown in the (!) popup or 📖 Rules
  // What a screen reader says about a yellow box: each equation it's in, as words.
  const SAY = { '+': 'plus', '−': 'minus', '×': 'times', '÷': 'divided by' }
  const describe = (k: string) =>
    eqs
      .filter((e) => e.cells.some((p) => key(p) === k))
      .map(
        (e) =>
          `${e.across ? 'Across' : 'Down'}: ` +
          e.cells
            .map((p) => {
              const c = grid[p[0]][p[1]]!
              if (c.t === 'op') return SAY[c.op]
              if (c.t === 'eq') return 'equals'
              if (key(p) === k) return 'this box'
              return c.hidden && !(key(p) in filled) ? 'blank' : sayNum(c.v)
            })
            .join(' '),
      )
      .join('. ')
  const clues =
    rules.clue && sel
      ? eqs.flatMap((e) => {
          const c = e.cells.some((p) => key(p) === sel) ? clue(grid, e) : null
          return c ? [{ dir: e.across ? 'Across' : 'Down', ...c }] : []
        })
      : []
  const guide = guideFor(level.ops, eqs.some((e) => e.left.ops.length + e.right.ops.length > 1))
  const sharedRule = clues.every((c) => c.pat === clues[0].pat && c.text === clues[0].text) // Across and Down often share one: say it once
  const clueBox = clues.length > 0 && (
    <section className="clue">
      <h3>
        <Deco>🔎</Deco> Clue for your box
      </h3>
      {clues.map((c, i) => (
        <div key={i}>
          <p>
            <b>{c.dir}:</b> <Pattern p={c.pattern} />
          </p>
          {!sharedRule && <Why pat={c.pat} text={c.text} />}
        </div>
      ))}
      {sharedRule && <Why pat={clues[0].pat} text={clues[0].text} />}
    </section>
  )
  const rank = playing || run.status === 'lose' || !rules.ranked ? undefined : rankOf(seconds, run.wrong)
  const [heading, subheading] = battle ? [level.title, battle.title] : [`Level ${level.n}`, level.title]

  return (
    <main className="screen game" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={() => (active ? setDialog('leave') : onExit())} aria-label={battle ? 'Leave the battle' : 'Back to levels'}>
          <Icon name="back" />
        </button>
        {!battle && (
          <button className="icon" onClick={() => (active ? setDialog('restart') : restart())} aria-label="Restart level">
            <Icon name="restart" />
          </button>
        )}
        <h1 aria-label={`${heading}, ${subheading}${sample ? ', sample puzzle' : ''}`}>
          {heading}
          <small>
            {sample && <span className="tag">SAMPLE</span>}
            <span className="clip" title={subheading}>{subheading}</span>
          </small>
        </h1>
        <Coins n={balance} />
      </header>

      <div className="stats">
        <span className="hearts" role="img" aria-label={`${hearts} of ${HEARTS} ${battle ? 'group lives' : 'lives'} left`}>
          {Array.from({ length: HEARTS }, (_, i) => (
            <span key={i} className="heart">
              {i < hearts ? '💗' : <span className="lost">🤍</span>}
              {drop?.i === i && (
                <span key={drop.t} className="drop">
                  <span className="fall">💗</span>
                  <span className="minus">−1</span>
                </span>
              )}
            </span>
          ))}
        </span>
        <span className="clock">
          <span className="timer">
            <Icon name="clock" />
            <span className="sr">{battle ? 'Time left:' : 'Time:'}&nbsp;</span>
            {clock(battle ? left : seconds)}
          </span>
          {playing && !battle && (
            <span className="next" title="Finish now to earn this many coins">
              +{reward(level.mode, seconds)}
              <span className="sr">&nbsp;coins if you finish now</span>
            </span>
          )}
        </span>
      </div>

      {battle?.bars}

      {/* the puzzle box: fills the space between the header and the tray, and the grid scales to fit it */}
      <div className="board-wrap">
        <div ref={board} className={`board${clear ? ` clear-${clear}` : ''}`} role="group" aria-label="Puzzle grid" tabIndex={0}>
          {INFO && (
            <button
              className={`info${wiggle ? ' wiggle' : ''}`}
              onClick={() => setInfo(true)}
              aria-label={rules.clue ? 'Rules and a free clue' : 'Rules for this level'}
              aria-haspopup="dialog"
            >
              <Icon name="info" />
            </button>
          )}
          <div className={`grid${nudge ? ' nudge' : ''}`} style={{ '--cols': grid[0].length, '--rows': grid.length } as CSSProperties}>
            {grid.flatMap((row, r) =>
              row.map((c, col) => {
                const k = key([r, col])
                if (!c) return <span key={k} className="cell empty" aria-hidden="true" />
                if (c.t !== 'num')
                  return (
                    <span key={k} className="cell sym" aria-hidden="true">
                      {c.t === 'eq' ? '=' : c.op}
                    </span>
                  )
                if (!c.hidden)
                  return (
                    <span key={k} className="cell given" data-len={lenOf(c.v)} aria-hidden="true">
                      <Num v={c.v} />
                    </span>
                  )
                const done = k in filled
                const flashHere = flash?.k === k
                const shown = done ? c.v : flashHere ? flash.v : null
                const cls = `cell blank${done ? (filled[k] ? ' hinted' : ' solved') : ''}${sel === k ? ' sel' : ''}${flashHere ? (flash.ok ? ' good' : ' bad') : ''}`
                return (
                  <button
                    key={flashHere ? `${k}-${flash.t}` : k}
                    className={cls}
                    data-len={shown === null ? 1 : lenOf(shown)}
                    onClick={() => select(k)}
                    disabled={done || !playing}
                    aria-pressed={sel === k}
                    data-cell={k}
                    aria-label={`Row ${r + 1}, column ${col + 1}: ${done ? sayNum(c.v) : 'empty'}. ${describe(k)}`}
                  >
                    {shown !== null && <Num v={shown} />}
                  </button>
                )
              }),
            )}
          </div>
        </div>
        {more.up && <span className="board-more up" aria-hidden="true" />}
        {more.down && <span className="board-more down" aria-hidden="true" />}
      </div>

      {/* pinned to the bottom like a keyboard, so the bank stays in reach on tall grids */}
      <div className="tray">
        <p className="sr" role="status">
          {flash &&
            (flash.ok
              ? 'Correct!'
              : `Wrong. ${battle ? 'Your group' : 'You'} lost a heart.${rules.clue ? ' For a free clue, use the Rules and a free clue button.' : ''}`)}
        </p>
        <p className="msg" role="status">
          {battle && !battle.over && !playing ? (allDone ? 'Your group finished! Waiting for the other groups…' : 'Your group is out of hearts! Wait for the final ranking.') : msg}
        </p>

        <Bank tiles={tiles} disabled={!playing} onPick={place} />

        <div className="tools">
          <button
            className={!INFO && wiggle ? 'wiggle' : ''}
            onClick={() => setDialog('rules')}
            aria-label={!INFO && rules.clue ? 'Rules and a free clue' : undefined}
            aria-haspopup="dialog"
          >
            <Deco>📖</Deco> Rules
          </button>
          {!battle && (
            <button className={playing && undoable ? '' : 'off'} onClick={undo}>
              <Deco>↩️</Deco> Undo
            </button>
          )}
          <button className={canHint ? '' : 'off'} onClick={hint}>
            <Deco>💡</Deco> Hint{' '}
            <small aria-hidden="true">
              −{rules.hintCost}
              {Number.isFinite(rules.hintLimit) && ` · ${rules.hintLimit - run.hints} left`}
            </small>
            <span className="sr">
              &nbsp;costs {rules.hintCost} coins{Number.isFinite(rules.hintLimit) && `, ${rules.hintLimit - run.hints} left`}
            </span>
          </button>
        </div>
      </div>

      {info && (
        <Dialog title={battle ? level.title : `Level ${level.n} · ${level.title}`} onClose={closeInfo} onBack={started ? closeInfo : onExit}>
          {clueBox}
          {guide.map((s) => (
            <RuleCard key={s.title} s={s} />
          ))}
          {rules.clue && !clues.length && (
            <p className="note">
              Tip: tap a yellow box, then tap <Deco>(!)</Deco>
              <span className="sr">the Rules and a free clue button</span> for a free clue about that box.
            </p>
          )}
          <button className="big" onClick={closeInfo} autoFocus>
            {started ? 'Got it!' : 'Let’s play!'}
          </button>
        </Dialog>
      )}

      {dialog === 'rules' && (
        <Dialog
          title={
            <>
              <Deco>📖</Deco> Integer Rules
            </>
          }
          onClose={() => setDialog(null)}
        >
          {SIGN_RULES.map((s) => (
            <RuleCard key={s.title} s={s} />
          ))}
          {/* last, beside the button the pop-up scrolls to */}
          {!INFO && clueBox}
          {!INFO && rules.clue && !clues.length && <p className="note">Tip: tap a yellow box, then tap Rules for a free clue about that box.</p>}
          <button className="big" onClick={() => setDialog(null)} autoFocus>
            Got it!
          </button>
        </Dialog>
      )}

      {(dialog === 'leave' || dialog === 'restart') && (
        <Dialog title={dialog === 'leave' ? (battle ? 'Leave the battle?' : 'Leave this level?') : 'Start this level over?'} onClose={() => setDialog(null)}>
          <p>{battle ? 'Your group can keep playing without you.' : 'This try will end and your progress on it will be lost.'}</p>
          <div className="row">
            <button className="big secondary" onClick={() => setDialog(null)} autoFocus>
              Keep playing
            </button>
            <button
              className="big"
              onClick={() => {
                if (dialog === 'restart') return restart()
                quitRun()
                onExit()
              }}
            >
              {dialog === 'leave' ? 'Leave' : 'Start over'}
            </button>
          </div>
        </Dialog>
      )}

      {battle?.over && (
        <Dialog
          title={
            <>
              <Deco>🏁</Deco> Battle over!
            </>
          }
          onBack={onExit}
        >
          {battle.result}
          {battle.bars}
          <button className="big" onClick={onExit} autoFocus>
            Back to modes
          </button>
        </Dialog>
      )}

      {!battle && !playing && (
        <Dialog title={<>{run.status === 'win' ? <><Deco>🎉</Deco> Level complete!</> : <><Deco>💔</Deco> Game over</>}</>}>
          {run.status === 'win' && <p>Job well done!</p>}
          {run.status === 'win' ? (
            <Summary>
              <dt>
                <Deco>⏱</Deco> Time
              </dt>
              <dd>{clock(seconds)}</dd>
              <dt>
                <Deco>❌</Deco> Wrong answers
              </dt>
              <dd>{run.wrong}</dd>
              <dt>
                <Deco>💡</Deco> Hints used
              </dt>
              <dd>{run.hints}</dd>
              <dt>
                <Deco>💰</Deco> Coins earned
              </dt>
              <dd>+{reward(level.mode, seconds)}</dd>
              {rules.ranked && (
                <>
                  <dt>
                    <Deco>🏆</Deco> Ranking
                  </dt>
                  <dd>{rank ? `#${rank} on this level` : 'Updates when you’re online'}</dd>
                </>
              )}
            </Summary>
          ) : (
            <p>You ran out of lives. Every try starts with {HEARTS} fresh hearts. You can do it!</p>
          )}
          <div className="row">
            {run.status === 'win' && onNext && (
              <button className="big" onClick={onNext} autoFocus>
                Next level <Deco>▶</Deco>
              </button>
            )}
            <button className={run.status === 'win' && onNext ? 'big secondary' : 'big'} onClick={restart} autoFocus={!(run.status === 'win' && onNext)}>
              Try again
            </button>
            <button className="big secondary" onClick={onExit}>
              Levels
            </button>
          </div>
        </Dialog>
      )}
    </main>
  )
}

const Summary = ({ children }: { children: ReactNode }) => <dl className="summary">{children}</dl>

const Pattern = ({ p }: { p: string }) => (
  <>
    <span className="pattern" aria-hidden="true">
      {p}
    </span>
    <span className="sr">{sayPattern(p)}</span>
  </>
)

// One rule: each group of sign patterns, then its line in plain words.
const RuleCard = ({ s }: { s: RuleSection }) => (
  <section className="rule">
    <h3>{s.title}</h3>
    {s.groups.map((g) => (
      <div key={g.text} className="rule-group">
        <p className="pats">
          {g.pats.map((l) => (
            <span key={l} className="pat">
              <Pattern p={l} />
            </span>
          ))}
        </p>
        <p className="rule-text">{g.text}</p>
      </div>
    ))}
  </section>
)

// The clue's rule: the add-the-opposite pattern for subtraction, then the plain-words line.
const Why = ({ pat, text }: { pat: string | null; text: string }) => (
  <>
    {pat && (
      <p>
        <span className="pat">
          <Pattern p={pat} />
        </span>
      </p>
    )}
    <p className="rule-text">{text}</p>
  </>
)

// Number bank: always two rows (smaller half on top), swiped sideways when it doesn't fit.
// An arrow shows on each side that still has numbers hidden past the edge.
function Bank({ tiles, disabled, onPick }: { tiles: { v: number; used: boolean }[]; disabled: boolean; onPick: (i: number) => void }) {
  const row = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  useEffect(() => {
    const el = row.current!
    const check = () => setMore({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
    check()
    el.addEventListener('scroll', check, { passive: true })
    const resize = new ResizeObserver(check)
    resize.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      resize.disconnect()
    }
  }, [tiles.length])
  const slide = (dir: number) => row.current!.scrollBy({ left: dir * row.current!.clientWidth * 0.8 })

  return (
    <div className="bank-wrap">
      {more.left && (
        <button className="bank-arrow left" onClick={() => slide(-1)} aria-label="More numbers on the left">
          <Icon name="back" />
        </button>
      )}
      <div ref={row} className="bank" role="group" aria-label="Number bank" style={{ '--bank-cols': Math.ceil(tiles.length / 2) } as CSSProperties}>
        {tiles.map((t, i) => (
          <button key={i} className="tile" disabled={t.used || disabled} onClick={() => onPick(i)} aria-label={`Place ${sayNum(t.v)}`}>
            {t.v < 0 ? `−${-t.v}` : t.v}
          </button>
        ))}
      </div>
      {more.right && (
        <button className="bank-arrow right" onClick={() => slide(1)} aria-label="More numbers on the right">
          <Icon name="next" />
        </button>
      )}
    </div>
  )
}
