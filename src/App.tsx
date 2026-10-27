import { lazy, Suspense, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { PRE_ASSESSMENT } from './content.ts'
import { Game } from './Game.tsx'
import { BATTLES, bestWin, clock, coinsOf, isUnlocked, LEVELS, rankingFor, wonLevels, type Attempt, type Mode, type Rank } from './rules.ts'
import { abandon, db, load, merge, newSave, persist, startScreen, sync, type Save, type Store } from './store.ts'
import { useBack } from './back.ts'
import { focusScreen } from './focus.ts'
import { focusMusic, setMusicScene, startMusic, stopMusic } from './music.ts'
import { musicSceneForScreen } from './musicPlaylists.ts'
import { installNavigationSounds } from './navigationSounds.ts'
import { sfx } from './sound.ts'
import { isCurrent, puzzleFor, refreshPuzzles } from './puzzles.ts'
import { Coins, Deco, Dialog, Icon } from './ui.tsx'
import { Art } from './Art.tsx'
import { AudioSettings } from './AudioSettings.tsx'
import { ConfirmDialog } from './ConfirmDialog.tsx'
import { startAppUpdates } from './appUpdates.ts'
import { useAppUpdateBlocker } from './useAppUpdateBlocker.ts'

type Screen = 'landing' | 'login' | 'intro' | 'howto' | 'pre' | 'modes' | 'settings' | Mode | 'ranking' | { level: string }
type HowToFrom = 'landing' | 'settings'
type IntroFrom = 'landing' | 'settings'

const Admin = lazy(() => import('./Admin.tsx').then(({ Admin }) => ({ default: Admin })))
const BattleRoom = lazy(() => import('./Battle.tsx').then(({ BattleRoom }) => ({ default: BattleRoom })))
const Intro = lazy(() => import('./Intro.tsx').then(({ Intro }) => ({ default: Intro })))
const HowTo = lazy(() => import('./HowTo.tsx').then(({ HowTo }) => ({ default: HowTo })))

export default function App() {
  useEffect(installNavigationSounds, [])
  useEffect(() => { if (import.meta.env.PROD) startAppUpdates() }, [])
  const [admin, setAdmin] = useState(() => location.hash === '#admin')
  useEffect(() => {
    const onHash = () => setAdmin(location.hash === '#admin')
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  return (
    <Suspense fallback={<main className="screen center" role="status">Loading…</main>}>
      {admin ? (
        <Admin />
      ) : (
        <>
          <Student />
          {/* covers the game on a sideways phone (CSS decides when): the grid and bank only fit upright */}
          <div className="upright" role="alert">
            <Deco>📱</Deco>
            <b>Turn your phone upright</b>
            <span>INTEGRID plays standing up.</span>
          </div>
        </>
      )}
    </Suspense>
  )
}

function Student() {
  const [store, setStore] = useState(load)
  const [screen, setScreen] = useState<Screen>('landing')
  useAppUpdateBlocker(screen === 'pre' || screen === 'intro' || screen === 'howto')
  const [ranking, setRanking] = useState<Rank[] | null>(null) // null = not fetched yet (offline)
  const [howtoFrom, setHowtoFrom] = useState<HowToFrom>('landing')
  const [howtoStep, setHowtoStep] = useState(0)
  const [introFrom, setIntroFrom] = useState<IntroFrom>('landing')
  const [introStep, setIntroStep] = useState(0)
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [playingPuzzle, setPlayingPuzzle] = useState<ReturnType<typeof puzzleFor>>(null)
  const [, setPuzzles] = useState(0) // bumped when the researchers' approved puzzles arrive
  const latest = useRef(store)
  const busy = useRef(false)
  const save = store.who ? store.saves[store.who] : null
  const saveBeforeUpdate = useEffectEvent(() => persist(store))
  useLayoutEffect(() => {
    const save = () => saveBeforeUpdate()
    addEventListener('integrid:before-update', save)
    return () => removeEventListener('integrid:before-update', save)
  }, [])

  useEffect(() => {
    latest.current = store
    persist(store)
  }, [store])
  // Music starts on the first tap (browsers allow sound only after one), pauses while the app is in
  // the background, and stops on the admin page.
  useEffect(() => {
    const tap = () => { void startMusic() }
    const away = () => { if (!document.hidden) void startMusic() }
    addEventListener('pointerup', tap)
    addEventListener('keydown', tap)
    document.addEventListener('visibilitychange', away)
    return () => {
      removeEventListener('pointerup', tap)
      removeEventListener('keydown', tap)
      document.removeEventListener('visibilitychange', away)
      stopMusic()
    }
  }, [])
  useEffect(() => { setMusicScene(musicSceneForScreen(screen)) }, [screen])
  useEffect(() => { if (screen === 'pre') return focusMusic() }, [screen])
  useEffect(() => {
    void navigator.storage?.persist?.() // ask the browser not to clear unsynced results
    void refreshPuzzles().then((changed) => changed && setPuzzles((n) => n + 1))
  }, [])

  const update = (fn: (s: Save) => Save) => setStore((st) => (st.who ? { ...st, saves: { ...st.saves, [st.who]: fn(st.saves[st.who]) } } : st))
  const completeOnboarding = (flags: Partial<Pick<Save, 'introDone' | 'howtoDone' | 'preDone'>>) => {
    if (!save) return
    // Save before navigating: the next lazy screen can suspend, or the app can close
    // before React's normal persistence effect runs. Keep the state update functional
    // so any concurrent background sync is preserved when the next screen renders.
    persist({ ...store, saves: { ...store.saves, [save.code]: { ...save, ...flags } } })
    update((s) => ({ ...s, ...flags }))
  }

  async function syncNow() {
    const st = latest.current
    if (!st.who || busy.current) return
    busy.current = true
    // Everyone who played on this phone, not only whoever is signed in now: on a shared phone,
    // results of a student who signed out still reach the teacher.
    const codes = [st.who, ...Object.keys(st.saves).filter((c) => c !== st.who && st.saves[c].attempts.some((a) => !a.synced))]
    try {
      for (const code of codes) {
        const r = await sync(st.saves[code])
        if (r === 'bad-login') continue // code removed on the server: keep everything on the device
        setStore((cur) => (cur.saves[code] ? { ...cur, saves: { ...cur.saves, [code]: merge(cur.saves[code], r.attempts) } } : cur))
        if (code === st.who) setRanking(r.ranking)
      }
    } catch {
      // offline: the next finished level, app open or 'online' event tries again
    } finally {
      busy.current = false
    }
  }

  const unsent = save ? save.attempts.filter((a) => !a.synced).length : 0
  useEffect(() => {
    if (!store.who) return
    void syncNow()
    addEventListener('online', syncNow)
    return () => removeEventListener('online', syncNow)
  }, [store.who]) // syncNow reads refs, so it isn't a dependency
  useEffect(() => {
    if (unsent) void syncNow()
  }, [unsent])

  // A new screen replaces the button that had focus; move focus to the new screen so keyboards
  // and screen readers aren't left on an empty page (unless something, like a pop-up, took it).
  useEffect(() => {
    if (document.activeElement === document.body) {
      window.scrollTo(0, 0)
      focusScreen()
    }
  }, [screen])

  const go = setScreen
  // The level left open when the app closed, if it can still be continued (same puzzle).
  const open = save?.current && puzzleFor(save.current.level)?.version === save.current.puzzle ? save.current : null
  const play = (id: string) => {
    const puzzle = puzzleFor(id)
    if (!puzzle) return
    if (save?.current && open?.level !== id) update(abandon) // starting something else gives up the open level
    setPlayingPuzzle(puzzle) // an approval arriving online must not replace a run already in progress
    go({ level: id })
  }
  const hasSavedWork = !!save?.current && (Object.keys(save.current.filled).length > 0 || save.current.wrong > 0 || save.current.hints > 0)
  const askPlay = (id: string) => {
    if (hasSavedWork && open?.level !== id) { setPendingStart(id); return }
    play(id)
  }
  const confirmStart = pendingStart && <ConfirmDialog title="End your saved try?" confirmLabel={pendingStart === 'battle' ? 'End try and join Battle' : 'End try and start level'} cancelLabel="Keep saved try" onCancel={() => setPendingStart(null)} onConfirm={() => {
    const next = pendingStart
    setPendingStart(null)
    if (next === 'battle') { update(abandon); go('battle') }
    else play(next)
  }}>
    <p>You have an unfinished try in {[...LEVELS, ...BATTLES].find((l) => l.id === save?.current?.level)?.title ?? 'another level'}. Starting something else will end it and clear its filled boxes. Spent hint coins stay spent.</p>
  </ConfirmDialog>

  const howTo = (from: HowToFrom) => {
    setHowtoFrom(from)
    setHowtoStep(0)
    go('howto')
  }
  const intro = (from: IntroFrom) => {
    setIntroFrom(from)
    setIntroStep(0)
    go('intro')
  }
  const enter = (student: Save) => {
    const next = startScreen(student)
    if (next === 'intro') intro('landing')
    else if (next === 'howto') howTo('landing')
    else go(next)
  }
  if (screen === 'landing') return <Landing onStart={() => (save ? enter(save) : go('login'))} />
  if (screen === 'login' || !save)
    return (
      <Login
        store={store}
        onBack={() => go('landing')}
        onDone={(s) => {
          setStore((st) => ({ who: s.code, saves: { ...st.saves, [s.code]: s } }))
          enter(s)
        }}
      />
    )
  if (screen === 'intro') return <Intro step={introStep} onStep={setIntroStep} replay={introFrom === 'settings'} onBack={() => go(introFrom)} onDone={() => {
    if (introFrom === 'settings') return go('settings')
    completeOnboarding({ introDone: true })
    howTo('landing')
  }} />
  if (screen === 'howto') return <HowTo step={howtoStep} onStep={setHowtoStep} replay={howtoFrom === 'settings'} preDone={save.preDone} onBack={() => go(howtoFrom)} onDone={() => {
    if (howtoFrom === 'settings') return go('settings')
    completeOnboarding({ introDone: true, howtoDone: true })
    go(save.preDone ? 'modes' : 'pre')
  }} />
  if (screen === 'pre')
    return (
      <Pre
        onDone={() => {
          completeOnboarding({ introDone: true, howtoDone: true, preDone: true })
          go('modes')
        }}
        onBack={() => go('landing')}
      />
    )
  if (screen === 'settings')
    return (
      <Settings
        code={save.code}
        onBack={() => go('modes')}
        onIntro={() => intro('settings')}
        onHowTo={() => howTo('settings')}
        onSignOut={() => {
          setStore((st) => ({ ...st, who: null }))
          go('login')
        }}
      />
    )

  // Dev server only: ?unlock opens every level for a look around. It adds no wins, so nothing fake syncs.
  const won = import.meta.env.DEV && new URLSearchParams(location.search).has('unlock') ? new Set(LEVELS.map((l) => l.id)) : wonLevels(save.attempts)
  const coins = coinsOf(save.attempts) // the open level's hint coins are counted in its game
  const shown = coins + (save.current?.coins ?? 0)
  if (screen === 'modes')
    return (
      <><Modes
        code={save.code}
        coins={shown}
        won={won}
        expertOpen={isUnlocked('expert-1', won)}
        battleOpen={won.has('expert-5')}
        onPick={(m) => {
          if (m === 'battle') {
            if (hasSavedWork) { setPendingStart('battle'); return }
            update(abandon)
          }
          go(m)
        }}
        onSettings={() => go('settings')}
      />{confirmStart}</>
    )
  if (screen === 'relax' || screen === 'expert')
    return <><Levels mode={screen} attempts={save.attempts} won={won} coins={shown} open={open?.level} onPlay={askPlay} onBack={() => go('modes')} onRanking={() => go('ranking')} />{confirmStart}</>
  if (screen === 'battle')
    return (
      <BattleRoom
        code={save.code}
        coins={coins}
        onExit={() => go('modes')}
        onProgress={(a) => update((s) => ({ ...s, current: { ...a, filled: {} } }))}
        onFinish={(a) => update((s) => ({ ...s, current: null, attempts: [...s.attempts, a] }))}
      />
    )
  if (screen === 'ranking') return <Ranking rows={ranking} attempts={save.attempts} code={save.code} onRefresh={syncNow} onBack={() => go('expert')} />

  const level = LEVELS.find((l) => l.id === screen.level)!
  const puzzle = playingPuzzle ?? puzzleFor(level.id)!
  const next = LEVELS[LEVELS.indexOf(level) + 1]
  return (
    <Game
      key={`${level.id}-${puzzle.version}`}
      level={level}
      csv={puzzle.csv}
      sample={puzzle.sample}
      coins={coins}
      rewardEligible={!save.attempts.some((a) => a.level === level.id && a.result === 'win')}
      rankOf={(seconds, wrong) =>
        ranking && isCurrent(level.id, puzzle.version) ? rankingFor(ranking.filter((r) => isCurrent(r.level, r.puzzle)), level.id, { level: level.id, code: save.code, seconds, wrong }).findIndex((r) => r.code === save.code) + 1 : null
      }
      resume={open?.level === level.id && open.puzzle === puzzle.version ? open : null}
      onProgress={(a, filled) => update((s) => ({ ...s, current: { ...a, filled } }))}
      onFinish={(a) => update((s) => ({ ...s, current: null, attempts: [...s.attempts, a] }))}
      onExit={() => {
        update((s) => ({ ...s, current: null })) // left with nothing to keep (a try with moves ends through onFinish)
        go(level.mode)
      }}
      onNext={next && puzzleFor(next.id) ? () => play(next.id) : null}
    />
  )
}

function Landing({ onStart }: { onStart: () => void }) {
  const sample = ['−3', '+', '?', '=', '2', null, null, '×', null, null, null, null, '2', null, null, null, null, '=', null, null, null, null, '10', null, null]
  return (
    <main className="screen landing start-screen" tabIndex={-1}>
      <p className="start-brand"><Art name="puzzle" />YOUR INTEGER ADVENTURE</p>
      <div className="start-illustration" aria-hidden="true">
        <span className="start-spark one"><Art name="star" /></span><span className="start-spark two"><Art name="leaf" /></span>
        <div className="start-grid">{sample.map((value, i) => <span key={i} className={value === null ? 'empty' : value === '?' ? 'answer' : ''}>{value}</span>)}</div>
        <span className="start-award"><Art name="medal" /></span>
      </div>
      <div className="start-copy"><h1>INTEGRID <span>IN ACTION</span></h1><p>A Math Crossword Adventure!</p><small>Learn the signs. Solve the grid. Build your skills.</small></div>
      <div className="start-operations" aria-label="Addition, subtraction, multiplication and division"><span>+</span><span>−</span><span>×</span><span>÷</span></div>
      <button className="start" onClick={onStart}><Art name="controller" />LET’S START!<Icon name="next" /></button>
      <p className="start-note">Your next challenge starts with one box.</p>
    </main>
  )
}

function Login({ store, onBack, onDone }: { store: Store; onBack: () => void; onDone: (s: Save) => void }) {
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useAppUpdateBlocker(busy || !!code || !!pin)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (!c || !/^\d{4}$/.test(pin)) return setMsg('Type your code and your 4-digit PIN.')
    const local = store.saves[c]
    if (local) return local.pin === pin ? onDone(local) : setMsg('Wrong code or PIN. Ask your teacher.')
    if (!db) return onDone(newSave(c, pin)) // dev mode
    setBusy(true)
    setMsg('')
    try {
      const r = await sync(newSave(c, pin))
      if (r === 'bad-login') setMsg('Wrong code or PIN. Ask your teacher.')
      else onDone(merge(newSave(c, pin), r.attempts)) // brings back progress from another device
    } catch {
      setMsg('You need internet the first time you sign in.')
    } finally {
      setBusy(false)
    }
  }

  useBack(onBack)
  return (
    <main className="screen entry-screen" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={onBack} aria-label="Back to start">
          <Icon name="back" />
        </button>
        <span className="eyebrow">Your adventure</span>
      </header>
      <div className="entry-heading"><div><p className="eyebrow">Your place in the adventure</p><h1>Sign in</h1><p>Use the code and PIN from your teacher.</p></div><span className="entry-heading-art"><Art name="profile" /></span></div>
      <form className="card form entry-form" onSubmit={submit}>
        <label>
          Student code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            placeholder="e.g. S01"
            required
            aria-invalid={!!msg}
            aria-describedby={msg ? 'signin-error' : undefined}
          />
        </label>
        <label>
          4-digit PIN
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            // Masked by CSS, not type="password": Chrome checks passwords against breach lists, and
            // every 4-digit PIN is on them, so each sign-in popped up "Change your password".
            className="pin"
            autoComplete="off"
            placeholder="••••"
            required
            aria-invalid={!!msg}
            aria-describedby={msg ? 'signin-error' : undefined}
          />
        </label>
        {msg && (
          <p id="signin-error" className="error" role="alert">
            {msg}
          </p>
        )}
        <button className="big" disabled={busy}>
          {busy ? 'Checking…' : 'Let’s go!'}
        </button>
        <p className="entry-help"><Art name="info" />Need your details? Ask your teacher.</p>
      </form>
      {/* replace, not push: a student's back gesture must never land on the admin page */}
      <a
        className="admin-link"
        href="#admin"
        onClick={(e) => {
          e.preventDefault()
          location.replace('#admin')
        }}
      >
        <Art name="book" /> Teacher sign in
      </a>
    </main>
  )
}

function Pre({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const total = PRE_ASSESSMENT.length
  useEffect(() => {
    if (i > 0) focusScreen() // the next question (or the score) is read out
    if (i === total) return sfx.finish()
  }, [i, total])
  useBack(() => (i === total ? onDone() : setLeaving(true)))

  if (i === total)
    return (
      <main className="screen center assessment-complete" tabIndex={-1}>
        <span className="assessment-finish-art" aria-hidden="true"><Art name={score === total ? 'medal' : 'thumbs-up'} /></span>
        <p className="eyebrow">Pre-assessment complete</p>
        <div className="assessment-score" aria-hidden="true"><b>{score}</b><span>of {total}</span></div>
        <h1>
          You got {score} of {total}!
        </h1>
        <p className="sub">You’re ready. Level 1 is open!</p>
        <button className="big" onClick={onDone}>
          Let’s play <Deco>→</Deco>
        </button>
      </main>
    )

  const q = PRE_ASSESSMENT[i]
  return (
    <main className="screen assessment-screen" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={() => setLeaving(true)} aria-label="Back to start">
          <Icon name="back" />
        </button>
        <span className="assessment-bar-label">Integer rules</span><span className="assessment-count">{i + 1} / {total}</span>
      </header>
        <div className="progress" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={total} aria-valuenow={i + Number(picked !== null)}>
          {PRE_ASSESSMENT.map((_, j) => (
            <span key={j} className={j < i ? 'done' : j === i ? 'now' : ''} />
          ))}
        </div>
      <p className="eyebrow">
        Pre-Assessment: Integer Rules · {`${i + 1}\u00a0of\u00a0${total}`}
      </p>
      <div className="assessment-question-card"><span className="assessment-question-art" aria-hidden="true"><Art name="book" /></span><h1 className="question">{q.q}</h1></div>
      <div className="choices">
        {q.choices.map((c, j) => (
          <button
            key={c}
            className={picked === null ? '' : j === q.answer ? 'right' : j === picked ? 'wrong' : 'dim'}
            disabled={picked !== null}
            onClick={() => {
              setPicked(j)
              if (j === q.answer) sfx.right()
              else sfx.wrong()
              if (j === q.answer) setScore(score + 1)
            }}
          >
            <b className="choice-letter">{'abcd'[j]}.</b><span>{c}</span>{picked !== null && (j === q.answer || j === picked) && <Art name={j === q.answer ? 'check' : 'error'} />}
          </button>
        ))}
      </div>
      {picked === null && <p className="assessment-hint">There’s no timer. Take a moment to work it out.</p>}
      {picked !== null && (
        <>
          <p className={`feedback ${picked === q.answer ? 'ok' : 'no'}`} role="status">
            {picked === q.answer ? <><Deco>✓</Deco> Correct!</> : <><Deco>✗</Deco> Not quite. The answer is {'abcd'[q.answer]}. {q.choices[q.answer]}.</>}
          </p>
          <button
            className="big"
            autoFocus
            onClick={() => {
              setI(i + 1)
              setPicked(null)
            }}
          >
            {i + 1 === total ? (
              'Finish'
            ) : (
              <>
                Next <Deco>→</Deco>
              </>
            )}
          </button>
        </>
      )}
      {leaving && (
        <Dialog title="Leave the pre-assessment?" onClose={() => setLeaving(false)}>
          <p>You’ll start again from question 1. You need to finish it before you can play.</p>
          <div className="row">
            <button className="big secondary" onClick={() => setLeaving(false)} autoFocus>
              Keep going
            </button>
            <button className="big" onClick={onBack}>
              Leave
            </button>
          </div>
        </Dialog>
      )}
    </main>
  )
}

function Modes(props: { code: string; coins: number; won: ReadonlySet<string>; expertOpen: boolean; battleOpen: boolean; onPick: (m: Mode) => void; onSettings: () => void }) {
  const relax = LEVELS.filter((level) => level.mode === 'relax')
  const expert = LEVELS.filter((level) => level.mode === 'expert')
  const relaxDone = relax.filter((level) => props.won.has(level.id)).length
  const expertDone = expert.filter((level) => props.won.has(level.id)).length
  const completed = relaxDone + expertDone
  const suggested = !props.expertOpen ? 'relax' : !props.battleOpen ? 'expert' : null
  const modes = [
    {
      id: 'relax', title: 'RELAX MODE', art: 'leaf', open: true,
      description: 'Practice at your pace, with free clues to help.',
      progress: `${relaxDone} / ${relax.length} levels cleared`,
      action: relaxDone ? 'Choose a level' : 'Start playing',
      badge: relaxDone ? 'Keep going' : 'Start here',
    },
    {
      id: 'expert', title: 'EXPERT MODE', art: 'flame', open: props.expertOpen,
      description: 'Take on bigger grids and climb the rankings.',
      progress: props.expertOpen ? `${expertDone} / ${expert.length} levels cleared` : `Unlock: ${relaxDone} / ${relax.length} Relax levels cleared`,
      action: 'Choose a level', badge: 'Next challenge',
    },
    {
      id: 'battle', title: 'BATTLE MODE', art: 'battle', open: props.battleOpen,
      description: 'Team up and race the other groups.',
      progress: props.battleOpen ? 'Your teacher hosts the battle' : `Unlock: ${expertDone} / ${expert.length} Expert levels cleared`,
      action: 'Join a battle', badge: '',
    },
  ] as const

  return (
    <main className="screen adventure" tabIndex={-1}>
      <header className="bar adventure-bar">
        <span className="who">
          <span className="adventure-avatar"><Icon name="user" /></span>
          <span className="adventure-player"><small>PLAYER</small><b className="clip">{props.code}</b></span>
        </span>
        <Coins n={props.coins} />
        <button className="icon" onClick={props.onSettings} aria-label="Settings">
          <Icon name="settings" />
        </button>
      </header>

      <div className="adventure-heading">
        <div>
          <p className="eyebrow">Your integer journey</p>
          <h1>Choose Your <span>Adventure!</span></h1>
        </div>
        <span className="adventure-map" aria-hidden="true"><Art name="map" /></span>
      </div>

      <section className="adventure-progress" aria-label="Your progress">
        <div><b>{completed === LEVELS.length ? 'All solo levels cleared!' : 'Every level is a step forward'}</b><span>{completed} / {LEVELS.length} <span className="sr">solo levels cleared</span></span></div>
        <div className="adventure-track" role="progressbar" aria-label="Solo levels cleared" aria-valuemin={0} aria-valuemax={LEVELS.length} aria-valuenow={completed}>
          {LEVELS.map((level) => <span key={level.id} className={`${level.mode}${props.won.has(level.id) ? ' cleared' : ''}`} />)}
        </div>
      </section>

      <div className="adventure-options" role="group" aria-label="Choose a game mode">
        {modes.map((mode) => (
          <button key={mode.id} className={`mode ${mode.id}${suggested === mode.id ? ' suggested' : ''}`} disabled={!mode.open} onClick={() => props.onPick(mode.id)}>
            <span className="mode-body">
              <span className="mode-icon" aria-hidden="true">
                <Art name={mode.art} />
                {!mode.open && <span className="mode-art-lock"><Icon name="lock" /></span>}
              </span>
              <span className="mode-copy">
                <span className="mode-heading"><b>{mode.title}</b></span>
                <span className="mode-description">{mode.description}</span>
              </span>
              {suggested === mode.id && <span className="mode-badge">{mode.badge}</span>}
            </span>
            <span className="mode-footer">
              <span className="mode-progress">{mode.progress}</span>
              <span className="mode-action">{mode.open ? <>{mode.action}<Icon name="next" /></> : <><Icon name="lock" /> Locked</>}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="adventure-note">{props.battleOpen ? 'All modes are open. Choose your next challenge.' : 'Clear each level to open the next part of your adventure.'}</p>
    </main>
  )
}

// Settings: replay the guides, saved audio preferences and account actions.
function Settings({ code, onBack, onIntro, onHowTo, onSignOut }: { code: string; onBack: () => void; onIntro: () => void; onHowTo: () => void; onSignOut: () => void }) {
  const [confirm, setConfirm] = useState(false)
  useBack(onBack)
  return (
    <main className="screen settings-screen" tabIndex={-1}>
      <header className="bar settings-bar">
        <button className="icon" onClick={onBack} aria-label="Back to modes"><Icon name="back" /></button>
        <span className="eyebrow">Your adventure</span>
      </header>
      <div className="settings-heading">
        <div><p className="eyebrow">Make yourself at home</p><h1>Settings</h1><p>Sound, guides, and your account.</p></div>
        <span className="settings-heading-art" aria-hidden="true"><Art name="settings" /></span>
      </div>
      <section className="settings-section" aria-labelledby="settings-sound-title">
        <h2 id="settings-sound-title">Sound</h2>
        <AudioSettings />
      </section>
      <section className="settings-section" aria-labelledby="settings-guides-title">
        <h2 id="settings-guides-title">Need a refresher?</h2>
        <div className="settings-list">
          <button className="settings-row" onClick={onIntro}>
            <span className="settings-row-art intro"><Art name="map" /></span>
            <span className="settings-row-copy"><b>Adventure Intro</b><small>Your mission and the journey ahead</small></span>
            <Icon name="next" />
          </button>
          <button className="settings-row" onClick={onHowTo}>
            <span className="settings-row-art guide"><Art name="book" /></span>
            <span className="settings-row-copy"><b>How to Play</b><small>The grid, number bank, lives and hints</small></span>
            <Icon name="next" />
          </button>
        </div>
      </section>
      <section className="settings-account" aria-label="Your account">
        <span className="settings-account-art"><Art name="profile" /></span>
        <span className="settings-account-copy"><small>Signed in as</small><b>{code}</b></span>
        <button onClick={() => setConfirm(true)}>Sign out</button>
      </section>
      <p className="settings-footnote">Your progress stays saved on this device.</p>
      {confirm && (
        <Dialog title={`Sign out of ${code}?`} onClose={() => setConfirm(false)} className="settings-confirm-panel">
          <p>Your progress stays saved. To come back, you’ll need your code and PIN.</p>
          <div className="row">
            <button className="big secondary" onClick={() => setConfirm(false)} autoFocus>Stay signed in</button>
            <button className="big" onClick={onSignOut}>Sign out</button>
          </div>
        </Dialog>
      )}
    </main>
  )
}

function Levels(props: { mode: Mode; attempts: Attempt[]; won: Set<string>; coins: number; open?: string; onPlay: (id: string) => void; onBack: () => void; onRanking: () => void }) {
  useBack(props.onBack)
  const expert = props.mode === 'expert'
  const levels = LEVELS.filter((level) => level.mode === props.mode)
  const completed = levels.filter((level) => props.won.has(level.id)).length
  const available = levels.filter((level) => puzzleFor(level.id) && isUnlocked(level.id, props.won))
  const suggested = available.find((level) => level.id === props.open) ?? available.find((level) => !props.won.has(level.id))
  const complete = completed === levels.length

  return (
    <main className={`screen level-select ${props.mode}`} tabIndex={-1}>
      <header className="bar level-select-bar">
        <button className="icon" onClick={props.onBack} aria-label="Back to modes">
          <Icon name="back" />
        </button>
        <span className="eyebrow">Your adventure</span>
        <Coins n={props.coins} />
      </header>

      <div className="level-select-heading">
        <div>
          <p className="eyebrow">{expert ? 'Take on the challenge' : 'Build your skills'}</p>
          <h1>{expert ? 'Expert Mode' : 'Relax Mode'}</h1>
          <p>{expert ? 'Mix your skills. Take on bigger challenges.' : 'One operation at a time. Go at your pace.'}</p>
        </div>
        <span className="level-select-art" aria-hidden="true"><Art name={expert ? 'flame' : 'leaf'} /></span>
      </div>

      <section className="level-select-progress" aria-label="Mode progress">
        <div className="level-select-tools">
          <b>{completed} of {levels.length} levels cleared</b>
          {expert && <button className="level-ranking" onClick={props.onRanking}><Deco>🏆</Deco> Ranking <Icon name="next" /></button>}
        </div>
        <div className="level-select-track" role="progressbar" aria-label={`${expert ? 'Expert' : 'Relax'} levels cleared`} aria-valuemin={0} aria-valuemax={levels.length} aria-valuenow={completed}>
          {levels.map((level) => <span key={level.id} className={props.won.has(level.id) ? 'cleared' : ''} />)}
        </div>
      </section>

      <ol className="levels level-route" aria-label={`${expert ? 'Expert' : 'Relax'} levels`}>
        {levels.map((level) => {
          const puzzle = puzzleFor(level.id)
          const best = bestWin(props.attempts, level.id)
          const state = !puzzle ? 'soon' : !isUnlocked(level.id, props.won) ? 'locked' : level.id === props.open ? 'resume' : best ? 'done' : 'play'
          const next = suggested?.id === level.id
          return (
            <li key={level.id}>
              <button className={`level level-route-card ${state}${next ? ' next' : ''}`} disabled={state === 'soon' || state === 'locked'} onClick={() => props.onPlay(level.id)}>
                <span className="level-route-body">
                  <span className="level-n" aria-hidden="true">{level.n}</span>
                  <span className="level-route-copy">
                    <span className="level-route-label">Level {level.n} {puzzle?.sample && <span className="tag">SAMPLE</span>}</span>
                    <b>{level.title}</b>
                  </span>
                  {next && <span className="level-next-label">{state === 'resume' ? 'In progress' : 'Up next'}</span>}
                </span>
                <span className="level-route-footer">
                  <span className="level-route-status">
                    {state === 'done' && <><Art name="check" /><span>Cleared <span className="level-best">· Best {clock(best.seconds)}</span></span></>}
                    {state === 'locked' && <>Clear Level {level.n - 1} to unlock</>}
                    {state === 'soon' && 'Puzzle coming soon'}
                    {state === 'resume' && <><Art name="controller" />Your game is saved</>}
                    {state === 'play' && (next ? 'Your next challenge' : 'Ready to play')}
                  </span>
                  <span className="level-route-action">
                    {state === 'locked' ? <><Icon name="lock" />Locked</> : state === 'soon' ? 'Soon' : <>{state === 'resume' ? 'Continue' : state === 'done' ? 'Play again' : 'Start'}<Icon name="next" /></>}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {complete ? (
        <button className="level-unlock" onClick={props.onBack}>
          <Art name={expert ? 'battle' : 'flame'} />
          <span className="level-unlock-copy"><b>{expert ? 'Battle' : 'Expert'} Mode unlocked!</b><small>Back to adventures</small></span>
          <Icon name="next" />
        </button>
      ) : <p className="level-select-note">Clear all {levels.length} levels to unlock {expert ? 'Battle' : 'Expert'} Mode.</p>}
    </main>
  )
}

function Ranking(props: { rows: Rank[] | null; attempts: Attempt[]; code: string; onRefresh: () => Promise<void>; onBack: () => void }) {
  const levels = LEVELS.filter((l) => l.mode === 'expert' && puzzleFor(l.id))
  const [id, setId] = useState(levels[0]?.id ?? 'expert-1')
  useBack(props.onBack)
  const refresh = useEffectEvent(() => void props.onRefresh())
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 10_000) // live while open
    return () => clearInterval(t)
  }, [])
  // only results on the level's current puzzle (a swapped puzzle starts a new ranking)
  const mine = bestWin(props.attempts.filter((a) => isCurrent(a.level, a.puzzle)), id)
  const list = rankingFor((props.rows ?? []).filter((r) => isCurrent(r.level, r.puzzle)), id, mine && { level: id, code: props.code, seconds: mine.seconds, wrong: mine.wrong })

  return (
    <main className="screen leaderboard-screen" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={props.onBack} aria-label="Back to Expert levels">
          <Icon name="back" />
        </button>
        <span className="eyebrow">Your adventure</span>
      </header>
      <div className="leaderboard-heading"><div><p className="eyebrow">Challenge your best</p><h1>Expert Ranking</h1><p>See how your best time compares.</p></div><span><Art name="trophy" /></span></div>
      <div className="tabs" role="tablist" aria-label="Expert level" onKeyDown={(e) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
        if (!keys.includes(e.key)) return
        e.preventDefault()
        const current = levels.findIndex((level) => level.id === id)
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? levels.length - 1 : (current + (e.key === 'ArrowRight' ? 1 : -1) + levels.length) % levels.length
        setId(levels[next].id)
        e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
      }}>
        <span className="tabs-label" aria-hidden="true">
          Level
        </span>
        {levels.map((l) => (
          <button key={l.id} role="tab" id={`tab-${l.id}`} tabIndex={l.id === id ? 0 : -1} aria-selected={l.id === id} aria-controls="ranking-panel" aria-label={`Level ${l.n}`} onClick={() => setId(l.id)}>
            {l.n}
          </button>
        ))}
      </div>
      <p className="leaderboard-order">Fastest time first. Fewer mistakes break a tie.</p>
      <div id="ranking-panel" role="tabpanel" aria-labelledby={`tab-${id}`}>
        <h2 className="leaderboard-level-title">{levels.find((level) => level.id === id)?.title}</h2>
        {props.rows === null && <p className="note">Connect to the internet to see everyone’s times.</p>}
        {list.length ? (
          <ol className="ranking">
            {list.map((r, i) => (
              <li key={r.code} className={r.code === props.code ? 'me' : ''}>
                <span className="place">#{i + 1}</span>
                <span className="name"><b>{r.code}</b><small>{r.code === props.code ? 'Your best run' : 'Player'}</small></span>
                <span className="ranking-run"><b>{clock(r.seconds)}</b><small>{r.wrong} wrong</small></span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="ranking-empty"><Art name="target" /><h2>{props.rows === null ? 'Connect to see the rankings' : 'Your next challenge awaits'}</h2><p>{props.rows === null ? 'Everyone’s times will appear when you’re online.' : 'No one has finished this level yet. Be the first!'}</p></div>
        )}
      </div>
    </main>
  )
}
