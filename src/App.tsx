import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { Admin } from './Admin.tsx'
import { HOW_TO, PRE_ASSESSMENT } from './content.ts'
import { Game } from './Game.tsx'
import { bestWin, clock, coinsOf, isUnlocked, LEVELS, rankingFor, wonLevels, type Attempt, type Mode, type Rank } from './rules.ts'
import { db, load, merge, newSave, persist, sync, type Save, type Store } from './store.ts'
import { focusScreen } from './focus.ts'
import { Coins, Deco, Icon } from './ui.tsx'

// Puzzle files: the researchers' relax-1.csv replaces the placeholder relax-1.sample.csv.
const files = import.meta.glob('../puzzles/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const puzzleFor = (id: string) => {
  const csv = files[`../puzzles/${id}.csv`] ?? files[`../puzzles/${id}.sample.csv`]
  return csv ? { csv, sample: !files[`../puzzles/${id}.csv`] } : null
}

type Screen = 'landing' | 'login' | 'howto' | 'pre' | 'modes' | Mode | 'ranking' | { level: string }

export default function App() {
  const [admin, setAdmin] = useState(() => location.hash === '#admin')
  useEffect(() => {
    const onHash = () => setAdmin(location.hash === '#admin')
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  return admin ? <Admin /> : <Student />
}

function Student() {
  const [store, setStore] = useState(load)
  const [screen, setScreen] = useState<Screen>('landing')
  const [ranking, setRanking] = useState<Rank[] | null>(null) // null = not fetched yet (offline)
  const latest = useRef(store)
  const busy = useRef(false)
  const save = store.who ? store.saves[store.who] : null

  useEffect(() => {
    latest.current = store
    persist(store)
  }, [store])
  useEffect(() => {
    void navigator.storage?.persist?.() // ask the browser not to clear unsynced results
  }, [])

  const update = (fn: (s: Save) => Save) => setStore((st) => (st.who ? { ...st, saves: { ...st.saves, [st.who]: fn(st.saves[st.who]) } } : st))

  async function syncNow() {
    const st = latest.current
    const s = st.who ? st.saves[st.who] : null
    if (!s || busy.current) return
    busy.current = true
    try {
      const r = await sync(s)
      if (r === 'bad-login') return // code removed on the server: keep everything on the device
      setStore((cur) => (cur.saves[s.code] ? { ...cur, saves: { ...cur.saves, [s.code]: merge(cur.saves[s.code], r.attempts) } } : cur))
      setRanking(r.ranking)
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
  if (screen === 'landing') return <Landing onStart={() => go(save ? 'howto' : 'login')} />
  if (screen === 'login' || !save)
    return (
      <Login
        store={store}
        onDone={(s) => {
          setStore((st) => ({ who: s.code, saves: { ...st.saves, [s.code]: s } }))
          go('howto')
        }}
      />
    )
  if (screen === 'howto') return <HowTo onNext={() => go(save.preDone ? 'modes' : 'pre')} />
  if (screen === 'pre')
    return (
      <Pre
        onDone={() => {
          update((s) => ({ ...s, preDone: true }))
          go('modes')
        }}
      />
    )

  const won = wonLevels(save.attempts)
  const coins = coinsOf(save.attempts)
  if (screen === 'modes')
    return (
      <Modes
        code={save.code}
        coins={coins}
        expertOpen={isUnlocked('expert-1', won)}
        battleOpen={won.has('expert-5')}
        onPick={go}
        onSwitch={() => {
          setStore((st) => ({ ...st, who: null }))
          go('login')
        }}
      />
    )
  if (screen === 'relax' || screen === 'expert')
    return <Levels mode={screen} attempts={save.attempts} won={won} coins={coins} onPlay={(id) => go({ level: id })} onBack={() => go('modes')} onRanking={() => go('ranking')} />
  if (screen === 'ranking') return <Ranking rows={ranking} attempts={save.attempts} code={save.code} onRefresh={syncNow} onBack={() => go('expert')} />

  const level = LEVELS.find((l) => l.id === screen.level)!
  const puzzle = puzzleFor(level.id)!
  const next = LEVELS[LEVELS.indexOf(level) + 1]
  return (
    <Game
      key={level.id}
      level={level}
      csv={puzzle.csv}
      sample={puzzle.sample}
      coins={coins}
      rankOf={(seconds, wrong) =>
        ranking ? rankingFor(ranking, level.id, { level: level.id, code: save.code, seconds, wrong }).findIndex((r) => r.code === save.code) + 1 : null
      }
      onProgress={(a) => update((s) => ({ ...s, current: a }))}
      onFinish={(a) => update((s) => ({ ...s, current: null, attempts: [...s.attempts, a] }))}
      onExit={() => go(level.mode)}
      onNext={next && puzzleFor(next.id) ? () => go({ level: next.id }) : null}
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

function Login({ store, onDone }: { store: Store; onDone: (s: Save) => void }) {
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

  return (
    <main className="screen" tabIndex={-1}>
      <h1>Sign in</h1>
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
            autoComplete="username"
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
            autoComplete="current-password"
            type="password"
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
      <a className="admin-link" href="#admin">
        Admin sign in
      </a>
    </main>
  )
}

function HowTo({ onNext }: { onNext: () => void }) {
  return (
    <main className="screen" tabIndex={-1}>
      <h1>
        Let’s learn how to play! <Deco>🎓</Deco>
      </h1>
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

function Pre({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const total = PRE_ASSESSMENT.length
  useEffect(() => {
    if (i > 0) focusScreen() // the next question (or the score) is read out
  }, [i])

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
      <p className="eyebrow">
        Pre-Assessment: Integer Rules · {i + 1} of {total}
      </p>
      <div className="progress" aria-hidden="true">
        {PRE_ASSESSMENT.map((_, j) => (
          <span key={j} className={j < i ? 'done' : j === i ? 'now' : ''} />
        ))}
      </div>
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
    </main>
  )
}

function Modes(props: { code: string; coins: number; expertOpen: boolean; battleOpen: boolean; onPick: (m: Mode) => void; onSwitch: () => void }) {
  const [note, setNote] = useState('')
  return (
    <main className="screen" tabIndex={-1}>
      <header className="bar">
        <span className="who">
          <Icon name="user" />
          {props.code}
          <button className="switch" onClick={props.onSwitch}>
            Not you? Switch
          </button>
        </span>
        <Coins n={props.coins} />
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
      <button className="mode battle" disabled={!props.battleOpen} onClick={() => setNote('Battle Mode is coming soon!')}>
        <span className="mode-icon" aria-hidden="true">{props.battleOpen ? '⚔️' : <Icon name="lock" />}</span>
        <span>
          <b>BATTLE MODE</b>
          <small>{props.battleOpen ? 'Team up with your group and race the other groups!' : 'Finish all 5 Expert levels to unlock.'}</small>
        </span>
      </button>
      <p className="msg" role="status">
        {note}
      </p>
    </main>
  )
}

function Levels(props: { mode: Mode; attempts: Attempt[]; won: Set<string>; coins: number; onPlay: (id: string) => void; onBack: () => void; onRanking: () => void }) {
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
          const state = !puzzle ? 'soon' : !isUnlocked(l.id, props.won) ? 'locked' : best ? 'done' : 'play'
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
  const refresh = useEffectEvent(() => void props.onRefresh())
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 10_000) // live while open
    return () => clearInterval(t)
  }, [])
  const mine = bestWin(props.attempts, id)
  const list = rankingFor(props.rows ?? [], id, mine && { level: id, code: props.code, seconds: mine.seconds, wrong: mine.wrong })

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
