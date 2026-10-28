import { SaveWarning } from './SaveWarning.tsx'
import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useBack } from './back.ts'
import { useAppUpdateBlocker } from './useAppUpdateBlocker.ts'
import { Celebration } from './Celebration.tsx'
import { BattleResults } from './BattleResults.tsx'
import { clue, guideFor, RELAX_WIN_MESSAGES, sayNum, sayPattern, SIGN_RULES, WIN_MESSAGES, type RuleSection, type WinMessage } from './content.ts'
import { bankOf, blanksOf, equations, key, lenOf, parse } from './puzzle.ts'
import { versionOf } from './puzzles.ts'
import { BATTLES, clock, HEARTS, MODES, reward, type Attempt, type Level, type Result } from './rules.ts'
import { sfx } from './sound.ts'
import { focusMusic } from './music.ts'
import { uuid, type Pending } from './store.ts'
import { Coins, Deco, Dialog, Icon, Num } from './ui.tsx'
import { Art } from './Art.tsx'
import { AudioSettings } from './AudioSettings.tsx'
import { SoloResults } from './SoloResults.tsx'

type Run = {
  id: string
  at: string
  start: number
  end?: number
  filled: Record<string, boolean> // cell → solved with a hint?
  hearts: number
  wrong: number
  hints: number
  earned: number // Fixed when the run finishes; recording the win changes reward eligibility.
  mistakes: [number, number][]
  status: 'play' | 'win' | 'lose'
}

// The (!) button and the pop-up it opens when a level starts: hidden Oct 17 (Ken: it repeated 📖 Rules,
// which now holds Relax's free clue). true brings both back.
const INFO = false
const RULE_TITLES = { '+': 'Addition', '−': 'Subtraction', '×': 'Multiplication', '÷': 'Division' } as const

const newRun = (): Run => ({ id: uuid(), at: new Date().toISOString(), start: Date.now(), filled: {}, hearts: HEARTS, wrong: 0, hints: 0, earned: 0, mistakes: [], status: 'play' })

// Battle Mode: the group's shared grid and live ranking, from the room (Battle.tsx).
export type BattleLink = {
  title: string // "Group 2"
  startedAt: number
  seconds: number // round time
  shared: Record<string, boolean> // boxes the group solved, teammates' too
  hearts: number // the group's shared hearts left: any member's wrong answer costs one
  over: boolean
  won: boolean
  bars: ReactNode
  result: ReactNode
  issue?: string
  onSolve: (k: string, hint: boolean, value: number) => void
  onWrong: (wrong: number, k: string, value: number) => void
}

type Props = {
  saveIssue?: boolean
  onRetrySave?: () => void
  level: Level
  csv: string
  sample: boolean
  coins: number // balance from finished attempts
  rewardEligible?: boolean // Only the student's first win on a solo level earns coins.
  rankOf: (seconds: number, wrong: number) => number | null // null = offline
  onProgress: (a: Attempt, filled: Record<string, boolean>) => void
  onFinish: (a: Attempt) => void
  resume?: Pending | null // this level, left open when the app closed: carry on from there
  onExit: () => void
  onNext: (() => void) | null
  battle?: BattleLink
}

export function Game({ saveIssue, onRetrySave, level, csv, sample, coins, rewardEligible = false, rankOf, onProgress, onFinish, onExit, onNext, resume, battle }: Props) {
  useAppUpdateBlocker(true)
  useEffect(() => focusMusic(), [])
  const battleMode = !!battle
  useEffect(() => { if (battleMode) sfx.start() }, [battleMode])
  const rules = MODES[level.mode]
  const { grid, eqs, blanks, bank, version } = useMemo(() => {
    const grid = parse(csv)
    return { grid, eqs: equations(grid).eqs, blanks: blanksOf(grid).map(key), bank: bankOf(grid), version: versionOf(csv) }
  }, [csv])
  const answerOf = (k: string) => {
    const [r, c] = k.split(',').map(Number)
    return (grid[r][c] as { v: number }).v
  }

  const [run, setRun] = useState((): Run => {
    if (battle) return { ...newRun(), start: battle.startedAt, at: new Date(battle.startedAt).toISOString() }
    if (!resume) return newRun()
    // Same try, same boxes, hearts and hints; the clock goes on from where it stopped.
    const filled = Object.fromEntries(Object.entries(resume.filled).filter(([k]) => blanks.includes(k)))
    const { id, at, wrong, hints, mistakes } = resume
    return { id, at, start: Date.now() - resume.seconds * 1000, filled, hearts: HEARTS - wrong, wrong, hints, earned: 0, mistakes, status: 'play' }
  })
  const [sel, setSel] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ k: string; v: number; ok: boolean; t: number } | null>(null) // the box that just got an answer: blinks green or red
  const [msg, setMsg] = useState<ReactNode>(resume ? 'Welcome back! Carry on where you left off.' : '')
  const [nudge, setNudge] = useState(false)
  const [dialog, setDialog] = useState<'rules' | 'settings' | 'leave' | 'restart' | null>(null)
  const [confirmReturn, setConfirmReturn] = useState<'settings' | null>(null)
  const [celebration, setCelebration] = useState<WinMessage | null>(null)
  const stopResultSound = useRef<() => void>(() => {})
  useEffect(() => () => stopResultSound.current(), [])
  const battleOver = !!battle?.over, battleWon = !!battle?.won
  useEffect(() => {
    if (battleOver) return battleWon ? sfx.win() : sfx.finish()
  }, [battleOver, battleWon])
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
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      clearTimeout(timer)
      if (document.hidden) return
      const time = Date.now()
      setNow(time)
      // The display changes once per second. Align to the run's start so Battle
      // deadlines stay accurate without redrawing the entire board four times a second.
      const intoSecond = ((time - run.start) % 1000 + 1000) % 1000
      timer = setTimeout(tick, 1005 - intoSecond)
    }
    tick()
    document.addEventListener('visibilitychange', tick)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', tick) }
  }, [ticking, run.start])
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

  const shared = battle?.shared
  const filled = useMemo(() => shared ? { ...shared, ...run.filled } : run.filled, [shared, run.filled])
  const filledCount = blanks.filter((k) => k in filled).length
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
  useBack(() => {
    if (!active) return onExit()
    setConfirmReturn(null)
    setDialog('leave')
  })

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
    seconds: result === 'win' && !battle ? Math.max(1, secs) : secs,
    wrong: r.wrong,
    hints: r.hints,
    coins: earned - r.hints * rules.hintCost,
    mistakes: r.mistakes,
    at: r.at,
    puzzle: version,
  })

  // Leaving the app (home button, closing the tab) saves the clock too, so the level continues at
  // this time. flushSync: the page may be gone before React's next frame.
  const saveTime = useEffectEvent(() => {
    if (battle || !active) return
    flushSync(() => onProgress(attemptOf(run, 'quit', 0, Math.floor((Date.now() - run.start) / 1000)), run.filled))
  })
  useEffect(() => {
    const away = () => document.hidden && saveTime()
    document.addEventListener('visibilitychange', away)
    const gone = () => saveTime()
    addEventListener('pagehide', gone)
    return () => {
      document.removeEventListener('visibilitychange', away)
      removeEventListener('pagehide', gone)
    }
  }, [])

  function commit(next: Run) {
    const end = Date.now()
    const secs = Math.floor((end - next.start) / 1000)
    const status = blanks.every((k) => k in next.filled || (battle && k in battle.shared)) ? 'win' : next.hearts <= 0 ? 'lose' : 'play'
    if (status === 'play' || battle) {
      // a battle's result is the group's: the room logs it when the round ends
      setRun(status === 'play' ? next : { ...next, status, end })
      if (status !== 'play') setSel(null)
      onProgress(attemptOf(next, 'quit', 0, secs), next.filled) // saved as "quit" until the level ends
      return
    }
    const earned = status === 'win' && rewardEligible ? reward(level.mode, secs) : 0
    setRun({ ...next, status, end, earned })
    setSel(null)
    if (status === 'win') {
      setCelebration(RELAX_WIN_MESSAGES[level.id] ?? {
        title: WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)],
        text: 'You completed this level.',
      })
      stopResultSound.current = sfx.win()
    } else {
      stopResultSound.current = sfx.lose()
    }
    onFinish(attemptOf(next, status, earned, secs))
  }

  // After choosing a box, keyboard focus jumps to the number bank (no visible change on touch screens).
  function select(k: string) {
    if (!playing || k in filled) return
    sfx.select()
    setSel(k === sel ? null : k)
    if (k !== sel) requestAnimationFrame(() => document.querySelector<HTMLElement>('.bank .tile:not(:disabled)')?.focus())
  }

  function place(i: number) {
    if (!playing || tiles[i].used) return
    if (!sel) {
      sfx.tap()
      setMsg('Tap a yellow box first!')
      setNudge(true)
      return
    }
    if (sel in filled) {
      sfx.tap()
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
      const mine = { ...run.filled, [sel]: false }
      if (battle || blanks.some((k) => !(k in mine))) sfx.right()
      commit({ ...run, filled: mine })
      battle?.onSolve(sel, false, v)
      const next = blanks.find((k) => !(k in mine) && !(k in filled))
      if (next) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cell="${next}"]`)?.focus())
      return
    }
    // The red blink and the falling heart say it; in Relax the (!) (or 📖 Rules) wiggles toward the free clue.
    setFlash({ k: sel, v, ok: false, t: (flash?.t ?? 0) + 1 }) // t restarts the animation
    setMsg('')
    sfx.wrong()
    if (rules.clue) setWiggle(true)
    battle?.onWrong(run.wrong + 1, sel, v)
    commit({ ...run, hearts: run.hearts - 1, wrong: run.wrong + 1, mistakes: [...run.mistakes, [want, v]] })
  }

  function hint() {
    if (!canHint) {
      sfx.tap()
      if (playing) setMsg(run.hints >= rules.hintLimit ? 'No hints left for this level.' : `A hint costs ${rules.hintCost} coins.`)
      return
    }
    const target = sel && !(sel in filled) ? sel : blanks.find((k) => !(k in filled))
    if (!target) return
    sfx.hint()
    setSel(null)
    battle?.onSolve(target, true, answerOf(target))
    commit({ ...run, hints: run.hints + 1, filled: { ...run.filled, [target]: true } })
  }

  // Undo takes back your last correct number (filled keeps placement order). Hints and lost hearts stay.
  const undoable = battle ? undefined : Object.keys(run.filled).findLast((k) => !run.filled[k])
  function undo() {
    if (!playing || !undoable) { sfx.tap(); return }
    const { [undoable]: _, ...rest } = run.filled
    setSel(undoable)
    sfx.undo()
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
    stopResultSound.current()
    quitRun()
    setRun(newRun())
    setNow(Date.now())
    setSel(null)
    setFlash(null)
    setDialog(null)
    setConfirmReturn(null)
    setCelebration(null)
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
      <h3><Art name="magnifier" /><span>Clue for your box</span><span className="clue-free">Free</span></h3>
      {clues.map((c, i) => (
        <div key={i} className="clue-direction">
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
  const actionTitle = dialog === 'settings' ? (
    <>
      <span className="game-menu-kicker"><Art name="settings" />Game settings</span>
      <span className="game-menu-title">{level.title}</span>
      <span className="game-menu-label">{battle ? battle.title : `${level.mode === 'expert' ? 'Expert' : 'Relax'} · Level ${level.n}`}</span>
    </>
  ) : dialog === 'leave' ? (battle ? 'Leave the battle?' : 'Leave this level?') : 'Start this level over?'

  return (
    <main className="screen game" data-mode={level.mode} tabIndex={-1}>
      <h1 className="sr">{heading}, {subheading}{sample ? ', sample puzzle' : ''}</h1>
      <header className="game-header" data-mode={level.mode} aria-label="Game status and settings">
        <span className="hearts" role="img" aria-label={`${hearts} of ${HEARTS} ${battle ? 'group lives' : 'lives'} left`}>
          {Array.from({ length: HEARTS }, (_, i) => (
            <span key={i} className="heart">
              {i < hearts ? <Art name="heart" /> : <span className="lost"><Art name="heart" /></span>}
              {drop?.i === i && (
                <span key={drop.t} className="drop">
                  <span className="fall"><Art name="heart" /></span>
                  <span className="minus">−1</span>
                </span>
              )}
            </span>
          ))}
        </span>
        <span className="timer">
          <span className="game-level">{level.mode === 'expert' ? 'Expert' : level.mode === 'battle' ? 'Battle' : 'Relax'} · Level {level.n}</span>
          <Icon name="clock" />
          <span className="sr">{battle ? 'Time left:' : 'Time:'}&nbsp;</span>
          {clock(battle ? left : seconds)}
        </span>
        <div className="game-header-actions">
          <span className="game-header-coins" title={`${balance} coins`}><Coins n={balance} /></span>
          <button
            className="icon"
            onClick={() => { setConfirmReturn(null); setDialog('settings') }}
            aria-label="Game settings"
            aria-haspopup="dialog"
            aria-expanded={dialog === 'settings'}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>

      {saveIssue && <SaveWarning onRetry={onRetrySave} />}
      {battle?.issue && <p className="error" role="alert">{battle.issue}</p>}
      {battle && !battle.over && battle.bars}

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

        <div className="bank-heading">
          <span className="bank-prompt">{allDone ? 'Puzzle complete' : sel ? 'Choose a number' : 'Tap a yellow box'}</span>
          <div className="puzzle-progress" role="progressbar" aria-label="Puzzle boxes filled" aria-valuemin={0} aria-valuemax={blanks.length} aria-valuenow={filledCount}>
            <span className="puzzle-progress-count">{filledCount} / {blanks.length} <span>filled</span></span>
            <span className="puzzle-progress-track" aria-hidden="true"><span style={{ width: `${filledCount / blanks.length * 100}%` }} /></span>
          </div>
        </div>
        <Bank tiles={tiles} disabled={!playing} onPick={place} />

        <div className="tools">
          <button
            className={!INFO && wiggle ? 'wiggle' : ''}
            onClick={() => { sfx.clue(); setDialog('rules') }}
            aria-label={!INFO && rules.clue ? 'Rules and a free clue' : undefined}
            aria-haspopup="dialog"
          >
            <span className="tool-title"><Deco>📖</Deco> Rules</span>
          </button>
          {!battle && (
            <button className={playing && undoable ? '' : 'off'} onClick={undo}>
              <span className="tool-title"><Deco>↩️</Deco> Undo</span>
            </button>
          )}
          <button className={canHint ? '' : 'off'} onClick={hint}>
            <span className="tool-title"><Deco>💡</Deco> Hint</span>
            <span className="hint-badge" aria-hidden="true">
              <Art name="coin" />{rules.hintCost}<span className="hint-badge-divider">·</span>{Number.isFinite(rules.hintLimit) ? `${Math.max(0, rules.hintLimit - run.hints)} left` : '∞'}
            </span>
            <span className="sr">
              &nbsp;costs {rules.hintCost} coins{Number.isFinite(rules.hintLimit) ? `, ${Math.max(0, rules.hintLimit - run.hints)} left` : ', unlimited hints per level'}
            </span>
          </button>
        </div>
      </div>

      {info && !battle?.over && (
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

      {dialog === 'rules' && !battle?.over && (
        <Dialog title={<><Art name="book" /> Integer Rules</>} onClose={() => setDialog(null)} className={`rules-panel ${level.mode}`}>
          <RulesHelp freeClue={rules.clue} clueBox={clueBox} initialRule={RULE_TITLES[level.ops[0]]} onClose={() => setDialog(null)} />
        </Dialog>
      )}

      {battle?.over ? <BattleResults battle={battle} finale={level.id === BATTLES.at(-1)?.id} onContinue={onExit} /> : (dialog === 'settings' || dialog === 'leave' || dialog === 'restart') && (
        <Dialog
          title={actionTitle}
          className={`game-actions-panel ${level.mode}`}
          onClose={() => setDialog(dialog === 'settings' ? null : confirmReturn)}
        >
          {dialog === 'settings' ? (
            <div className="game-menu">
              {sample && <span className="tag">SAMPLE</span>}
              <button className="big game-menu-return" onClick={() => setDialog(null)} autoFocus><Art name="controller" />Return to game<Icon name="next" /></button>
              <p className="game-menu-notice"><Icon name="clock" />The timer keeps running.</p>
              {!battle && !rewardEligible && <p className="game-menu-notice"><Art name="coin" className="utility-art" />Practice replay · no coin reward.</p>}
              <section className="game-menu-audio" aria-label="Sound"><h3>Sound</h3><AudioSettings compact /></section>
              <div className="game-menu-actions">
              {!battle && (
                <button className="game-menu-action" onClick={() => {
                  if (!active) return restart()
                  setConfirmReturn('settings')
                  setDialog('restart')
                }}>
                  <span className="game-menu-action-icon"><Icon name="restart" /></span><b>Restart level</b><Icon name="next" />
                </button>
              )}
              <button className="game-menu-action" onClick={() => {
                if (!active) return onExit()
                setConfirmReturn('settings')
                setDialog('leave')
              }}>
                <span className="game-menu-action-icon"><Icon name="back" /></span><b>{battle ? 'Exit battle' : 'Exit to levels'}</b><Icon name="next" />
              </button>
              </div>
            </div>
          ) : (
            <>
              <p>{battle ? 'Your group can keep playing without you.' : 'This try will end and your progress on it will be lost.'}</p>
              <div className="row">
                <button className="big secondary" onClick={() => setDialog(confirmReturn)} autoFocus>
                  {confirmReturn ? 'Back to settings' : 'Keep playing'}
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
            </>
          )}
        </Dialog>
      )}

      {celebration && <Celebration message={celebration} onDone={() => setCelebration(null)} />}

      {!battle && !playing && !celebration && (
        <SoloResults level={level} won={run.status === 'win'} seconds={seconds} wrong={run.wrong} hints={run.hints} earned={run.earned} ranked={rules.ranked} rank={rank} onNext={onNext} onRetry={restart} onLevels={onExit} />
      )}
    </main>
  )
}

const Pattern = ({ p }: { p: string }) => (
  <>
    <span className="pattern" aria-hidden="true">
      {p}
    </span>
    <span className="sr">{sayPattern(p)}</span>
  </>
)

// One rule at a time keeps the help readable; Relax starts with its selected-box clue.
function RulesHelp({ freeClue, clueBox, initialRule, onClose }: { freeClue: boolean; clueBox: ReactNode; initialRule: string; onClose: () => void }) {
  const [view, setView] = useState<'clue' | 'rules'>(freeClue ? 'clue' : 'rules')
  const [title, setTitle] = useState(initialRule)
  const help = useRef<HTMLDivElement>(null)
  useEffect(() => {
    help.current?.focus({ preventScroll: true })
    const panel = help.current?.closest<HTMLElement>('.panel')
    if (panel) panel.scrollTop = 0
  }, [])
  const selected = SIGN_RULES.find((rule) => rule.title === title) ?? SIGN_RULES[0]
  const symbols = ['+', '−', '×', '÷', 'MDAS']
  return (
    <>
      <div ref={help} className="rules-help-content" role="group" aria-label="Integer help" tabIndex={-1}>
      {freeClue && <div className="rules-view-switch" role="group" aria-label="Help views"><button aria-pressed={view === 'clue'} onClick={() => setView('clue')}><Art name="magnifier" />Free clue</button><button aria-pressed={view === 'rules'} onClick={() => setView('rules')}><Art name="book" />Sign rules</button></div>}
      {view === 'clue' ? clueBox || <section className="clue-empty"><Art name="magnifier" /><h3>Pick a yellow box first</h3><p>Tap a yellow box in the puzzle, then open Rules for a free clue about that box.</p><span className="clue-empty-grid" aria-hidden="true"><span>−3</span><span>+</span><span /></span></section> : <>
        <p className="rules-lead">Choose an operation to review its sign rules.</p>
        <div className="rules-operations" role="group" aria-label="Integer operations">{SIGN_RULES.map((rule, i) => <button key={rule.title} aria-label={`${rule.title} rules`} aria-pressed={selected.title === rule.title} onClick={() => setTitle(rule.title)}>{symbols[i]}</button>)}</div>
        <RuleCard s={selected} />
      </>}
      </div>
      <button className="big rules-done" onClick={onClose}>Got it! <Icon name="next" /></button>
    </>
  )
}

// One rule: each group of sign patterns, then its line in plain words.
const RuleCard = ({ s }: { s: RuleSection }) => (
  <section className="rule" aria-label={`${s.title} guide`}>
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

// Prefer two rows. Narrow banks wrap instead of making the numbers smaller than 36px.
function Bank({ tiles, disabled, onPick }: { tiles: { v: number; used: boolean }[]; disabled: boolean; onPick: (i: number) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(() => Math.max(1, Math.ceil(tiles.length / 2)))
  useEffect(() => {
    const el = wrap.current!
    const fit = () => {
      const gap = 5 // matches --bank-gap in the responsive tray
      const available = Math.max(1, Math.floor((el.clientWidth - 4 + gap) / (36 + gap)))
      setColumns(Math.max(1, Math.min(Math.ceil(tiles.length / 2), available)))
    }
    fit()
    const resize = new ResizeObserver(fit)
    resize.observe(el)
    return () => resize.disconnect()
  }, [tiles.length])

  return (
    <div className="bank-wrap" ref={wrap}>
      <div className="bank" role="group" aria-label="Number bank" style={{ '--bank-cols': columns } as CSSProperties}>
        {tiles.map((t, i) => (
          <button key={i} className={`tile${t.used ? ' used' : ''}`} data-digits={String(t.v).length} disabled={t.used || disabled} onClick={() => onPick(i)} aria-label={`${t.used ? 'Used' : 'Place'} ${sayNum(t.v)}`}>
            <span className="tile-value">{t.v < 0 ? `−${-t.v}` : t.v}</span>
            {t.used && <span className="tile-used" aria-hidden="true"><Art name="check" /></span>}
          </button>
        ))}
      </div>
    </div>
  )
}
