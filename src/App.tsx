import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { HOW_TO, PRE_ASSESSMENT } from './content.ts'
import { Game } from './Game.tsx'
import { bestWin, clock, coinsOf, isUnlocked, LEVELS, rankingFor, wonLevels, type Attempt, type Mode, type Rank } from './rules.ts'
import { abandon, db, load, merge, newSave, persist, sync, type Save, type Store } from './store.ts'
import { useBack } from './back.ts'
import { focusScreen } from './focus.ts'
import { musicOn, setMusicOn, startMusic, stopMusic } from './music.ts'
import { pauseAudio, setSoundOn, sfx, soundOn, warmSoundEffects } from './sound.ts'
import { isCurrent, puzzleFor, refreshPuzzles } from './puzzles.ts'
import { Coins, Deco, Dialog, Icon } from './ui.tsx'

type Screen = 'landing' | 'login' | 'howto' | 'pre' | 'modes' | 'settings' | Mode | 'ranking' | { level: string }
type HowToFrom = 'landing' | 'settings'

const Admin = lazy(() => import('./Admin.tsx').then(({ Admin }) => ({ default: Admin })))
const BattleRoom = lazy(() => import('./Battle.tsx').then(({ BattleRoom }) => ({ default: BattleRoom })))

export default function App() {
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
  const [ranking, setRanking] = useState<Rank[] | null>(null) // null = not fetched yet (offline)
  const [howtoFrom, setHowtoFrom] = useState<HowToFrom>('landing') // How to Play's back goes there
  const [playingPuzzle, setPlayingPuzzle] = useState<ReturnType<typeof puzzleFor>>(null)
  const [, setPuzzles] = useState(0) // bumped when the researchers' approved puzzles arrive
  const latest = useRef(store)
  const busy = useRef(false)
  const save = store.who ? store.saves[store.who] : null

  useEffect(() => {
    latest.current = store
    persist(store)
  }, [store])
  // Music starts on the first tap (browsers allow sound only after one), pauses while the app is in
  // the background, and stops on the admin page.
  useEffect(() => {
    const tap = () => { void startMusic(); warmSoundEffects() }
    const away = () => pauseAudio(document.hidden)
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
  useEffect(() => {
    void navigator.storage?.persist?.() // ask the browser not to clear unsynced results
    void refreshPuzzles().then((changed) => changed && setPuzzles((n) => n + 1))
  }, [])

  const update = (fn: (s: Save) => Save) => setStore((st) => (st.who ? { ...st, saves: { ...st.saves, [st.who]: fn(st.saves[st.who]) } } : st))

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
    if (document.activeElement === document.body) focusScreen()
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
  const howTo = (from: HowToFrom) => {
    setHowtoFrom(from)
    go('howto')
  }
  if (screen === 'landing') return <Landing onStart={() => (save ? howTo('landing') : go('login'))} />
  if (screen === 'login' || !save)
    return (
      <Login
        store={store}
        onBack={() => go('landing')}
        onDone={(s) => {
          setStore((st) => ({ who: s.code, saves: { ...st.saves, [s.code]: s } }))
          howTo('landing') // back from here goes to the start screen, not to sign in again
        }}
      />
    )
  if (screen === 'howto') return <HowTo from={howtoFrom} onBack={() => go(howtoFrom)} onNext={() => go(save.preDone ? 'modes' : 'pre')} />
  if (screen === 'pre')
    return (
      <Pre
        onDone={() => {
          update((s) => ({ ...s, preDone: true }))
          go('modes')
        }}
        onBack={() => go('howto')}
      />
    )
  if (screen === 'settings')
    return (
      <Settings
        code={save.code}
        onBack={() => go('modes')}
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
      <Modes
        code={save.code}
        coins={shown}
        expertOpen={isUnlocked('expert-1', won)}
        battleOpen={won.has('expert-5')}
        onPick={(m) => {
          if (m === 'battle') update(abandon)
          go(m)
        }}
        onSettings={() => go('settings')}
      />
    )
  if (screen === 'relax' || screen === 'expert')
    return <Levels mode={screen} attempts={save.attempts} won={won} coins={shown} open={open?.level} onPlay={play} onBack={() => go('modes')} onRanking={() => go('ranking')} />
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
  return (
    <main className="screen landing" tabIndex={-1}>
      {['+', '−', '×', '÷'].map((s, i) => (
        <span key={s} className={`sticker s${i + 1}`} aria-hidden="true">
          {s}
        </span>
      ))}
      <h1>INTEGRID IN ACTION</h1>
      <p className="tagline">
        <Deco>🎮</Deco> A Math Crossword Adventure! <Deco>🧩</Deco>
      </p>
      <p className="sub">Master integer operations while having fun!</p>
      <button className="start" onClick={onStart}>
        <Deco>→</Deco> LET’S START!
      </button>
      <p className="sub">Tap to begin your adventure!</p>
      <p className="emoji-row" aria-hidden="true">
        ⭐ 🎯 🏆
      </p>
    </main>
  )
}

function Login({ store, onBack, onDone }: { store: Store; onBack: () => void; onDone: (s: Save) => void }) {
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

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
    <main className="screen" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={onBack} aria-label="Back to start">
          <Icon name="back" />
        </button>
        <h1>Sign in</h1>
      </header>
      <p className="sub">Use the code and PIN from your teacher.</p>
      <form className="card form" onSubmit={submit}>
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
        {!db && <p className="note">Dev mode: no server yet, any code and 4-digit PIN works.</p>}
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
        Admin sign in
      </a>
    </main>
  )
}

const BACK_TO: Record<HowToFrom, string> = { landing: 'Back to start', settings: 'Back to settings' }

function HowTo({ from, onBack, onNext }: { from: HowToFrom; onBack: () => void; onNext: () => void }) {
  useBack(onBack)
  return (
    <main className="screen" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={onBack} aria-label={BACK_TO[from]}>
          <Icon name="back" />
        </button>
        <h1>
          Let’s learn how to play! <Deco>🎓</Deco>
        </h1>
      </header>
      {HOW_TO.map((c) => (
        <section key={c.title} className="howto">
          <span className="howto-icon" aria-hidden="true">
            {c.icon}
          </span>
          <div>
            <h2>{c.title}</h2>
            <p>{c.text}</p>
          </div>
        </section>
      ))}
      <div className="sticky-cta">
        <button className="big" onClick={onNext}>
          CONTINUE <Deco>→</Deco>
        </button>
      </div>
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
  }, [i])
  useBack(() => (i === total ? onDone() : setLeaving(true)))

  if (i === total)
    return (
      <main className="screen center" tabIndex={-1}>
        <h1>
          You got {score} of {total}! <Deco>{score === total ? '🌟' : '👍'}</Deco>
        </h1>
        <p className="sub">You’re ready. Level 1 is open!</p>
        <button className="big" onClick={onDone}>
          Let’s play <Deco>→</Deco>
        </button>
      </main>
    )

  const q = PRE_ASSESSMENT[i]
  return (
    <main className="screen" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={() => setLeaving(true)} aria-label="Back to How to Play">
          <Icon name="back" />
        </button>
        <div className="progress" aria-hidden="true">
          {PRE_ASSESSMENT.map((_, j) => (
            <span key={j} className={j < i ? 'done' : j === i ? 'now' : ''} />
          ))}
        </div>
      </header>
      <p className="eyebrow">
        Pre-Assessment: Integer Rules · {`${i + 1}\u00a0of\u00a0${total}`}
      </p>
      <h1 className="question">{q.q}</h1>
      <div className="choices">
        {q.choices.map((c, j) => (
          <button
            key={c}
            className={picked === null ? '' : j === q.answer ? 'right' : j === picked ? 'wrong' : 'dim'}
            disabled={picked !== null}
            onClick={() => {
              setPicked(j)
              if (j === q.answer) setScore(score + 1)
            }}
          >
            <b>{'abcd'[j]}.</b> {c}
          </button>
        ))}
      </div>
      {picked !== null && (
        <>
          <p className={`feedback ${picked === q.answer ? 'ok' : 'no'}`} role="status">
            {picked === q.answer ? '✓ Correct!' : `✗ Not quite. The answer is ${'abcd'[q.answer]}. ${q.choices[q.answer]}.`}
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

function Modes(props: { code: string; coins: number; expertOpen: boolean; battleOpen: boolean; onPick: (m: Mode) => void; onSettings: () => void }) {
  return (
    <main className="screen" tabIndex={-1}>
      <header className="bar">
        <span className="who">
          <Icon name="user" />
          <span className="sr">Signed in as&nbsp;</span>
          {props.code}
        </span>
        <Coins n={props.coins} />
        <button className="icon" onClick={props.onSettings} aria-label="Settings">
          <Icon name="settings" />
        </button>
      </header>
      <h1>
        Choose Your Adventure! <Deco>🗺️</Deco>
      </h1>
      <p className="sub">Pick a style that feels right for you today</p>
      <button className="mode relax" onClick={() => props.onPick('relax')}>
        <span className="mode-icon" aria-hidden="true">🌿</span>
        <span>
          <b>RELAX MODE</b>
          <small>Go at your own pace! Free clues, no pressure.</small>
        </span>
      </button>
      <button className="mode expert" disabled={!props.expertOpen} onClick={() => props.onPick('expert')}>
        <span className="mode-icon" aria-hidden="true">{props.expertOpen ? '🔥' : <Icon name="lock" />}</span>
        <span>
          <b>EXPERT MODE</b>
          <small>{props.expertOpen ? 'Bigger grids, beat the clock, climb the ranking!' : 'Finish all 4 Relax levels to unlock.'}</small>
        </span>
      </button>
      <button className="mode battle" disabled={!props.battleOpen} onClick={() => props.onPick('battle')}>
        <span className="mode-icon" aria-hidden="true">{props.battleOpen ? '⚔️' : <Icon name="lock" />}</span>
        <span>
          <b>BATTLE MODE</b>
          <small>{props.battleOpen ? 'Team up with your group and race the other groups!' : 'Finish all 5 Expert levels to unlock.'}</small>
        </span>
      </button>
    </main>
  )
}

// Settings: How to Play again, and signing out (asks first: the student needs the slip to come back).
function Settings({ code, onBack, onHowTo, onSignOut }: { code: string; onBack: () => void; onHowTo: () => void; onSignOut: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [sound, setSound] = useState(soundOn)
  const [music, setMusic] = useState(musicOn)
  useBack(onBack)
  return (
    <main className="screen" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={onBack} aria-label="Back to modes">
          <Icon name="back" />
        </button>
        <h1>Settings</h1>
      </header>
      <button className="level" onClick={onHowTo}>
        <span className="level-n">
          <Icon name="info" />
        </span>
        <span className="level-text">
          <b>How to Play</b>
          <small>The rules, the number bank, lives and coins</small>
        </span>
        <span className="level-state">
          <Icon name="next" />
        </span>
      </button>
      <button
        className="level"
        role="switch"
        aria-checked={sound}
        onClick={() => {
          setSoundOn(!sound)
          setSound(!sound)
          if (!sound) sfx.right() // a sample, so you hear it's on
        }}
      >
        <span className="level-n">
          <Deco>{sound ? '🔊' : '🔇'}</Deco>
        </span>
        <span className="level-text">
          <b>Sound effects</b>
          <small>A “ding” when right, a low sound when wrong</small>
        </span>
        <span className={`toggle${sound ? ' on' : ''}`} aria-hidden="true">
          {sound ? 'On' : 'Off'}
        </span>
      </button>
      <button
        className="level"
        role="switch"
        aria-checked={music}
        onClick={() => {
          setMusicOn(!music)
          setMusic(!music)
        }}
      >
        <span className="level-n">
          <Deco>{music ? '🎵' : '🔇'}</Deco>
        </span>
        <span className="level-text">
          <b>Music</b>
          <small>Background music while you play</small>
        </span>
        <span className={`toggle${music ? ' on' : ''}`} aria-hidden="true">
          {music ? 'On' : 'Off'}
        </span>
      </button>
      <section className="card account">
        <p className="who">
          <Icon name="user" />
          Signed in as {code}
        </p>
        <button className="big secondary" onClick={() => setConfirm(true)}>
          Sign out
        </button>
      </section>
      {confirm && (
        <Dialog title={`Sign out of ${code}?`} onClose={() => setConfirm(false)}>
          <p>Your progress stays saved. To come back, you’ll need your code and PIN.</p>
          <div className="row">
            <button className="big secondary" onClick={() => setConfirm(false)} autoFocus>
              Stay signed in
            </button>
            <button className="big" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </Dialog>
      )}
    </main>
  )
}

function Levels(props: { mode: Mode; attempts: Attempt[]; won: Set<string>; coins: number; open?: string; onPlay: (id: string) => void; onBack: () => void; onRanking: () => void }) {
  useBack(props.onBack)
  return (
    <main className="screen" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={props.onBack} aria-label="Back to modes">
          <Icon name="back" />
        </button>
        <h1>
          <Deco>{props.mode === 'relax' ? '🌿' : '🔥'}</Deco> {props.mode === 'relax' ? 'Relax Mode' : 'Expert Mode'}
        </h1>
        <Coins n={props.coins} />
      </header>
      {props.mode === 'expert' && (
        <button className="big secondary" onClick={props.onRanking}>
          <Deco>🏆</Deco> Ranking
        </button>
      )}
      <ol className="levels">
        {LEVELS.filter((l) => l.mode === props.mode).map((l) => {
          const puzzle = puzzleFor(l.id)
          const best = bestWin(props.attempts, l.id)
          const state = !puzzle ? 'soon' : !isUnlocked(l.id, props.won) ? 'locked' : l.id === props.open ? 'resume' : best ? 'done' : 'play'
          return (
            <li key={l.id}>
              <button className={`level ${state}`} disabled={state === 'soon' || state === 'locked'} onClick={() => props.onPlay(l.id)}>
                <span className="level-n">{l.n}</span>
                <span className="level-text">
                  <b>
                    Level {l.n} {puzzle?.sample && <span className="tag">SAMPLE</span>}
                  </b>
                  <small>{l.title}</small>
                </span>
                <span className="level-state">
                  {state === 'done' && (
                    <>
                      <span className="sr">Best time </span>✓ {clock(best.seconds)}
                    </>
                  )}
                  {state === 'locked' && (
                    <>
                      <Icon name="lock" />
                      <span className="sr">Locked</span>
                    </>
                  )}
                  {state === 'soon' && 'Soon'}
                  {state === 'resume' && 'Continue'}
                  {state === 'play' && <Icon name="next" />}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
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
    <main className="screen" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={props.onBack} aria-label="Back to Expert levels">
          <Icon name="back" />
        </button>
        <h1>
          <Deco>🏆</Deco> Expert Ranking
        </h1>
      </header>
      <div className="tabs" role="tablist" aria-label="Expert level">
        <span className="tabs-label" aria-hidden="true">
          Level
        </span>
        {levels.map((l) => (
          <button key={l.id} role="tab" id={`tab-${l.id}`} aria-selected={l.id === id} aria-controls="ranking-panel" aria-label={`Level ${l.n}`} onClick={() => setId(l.id)}>
            {l.n}
          </button>
        ))}
      </div>
      <div id="ranking-panel" role="tabpanel" aria-labelledby={`tab-${id}`}>
        {props.rows === null && <p className="note">Connect to the internet to see everyone’s times.</p>}
        {list.length ? (
          <ol className="ranking">
            {list.map((r, i) => (
              <li key={r.code} className={r.code === props.code ? 'me' : ''}>
                <span className="place">#{i + 1}</span>
                <span className="name">
                  {r.code}
                  {r.code === props.code && ' (you)'}
                </span>
                <span>{clock(r.seconds)}</span>
                <span className="muted">{r.wrong} wrong</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="note">No one has finished this level yet. Be the first!</p>
        )}
      </div>
    </main>
  )
}
