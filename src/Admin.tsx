import type { Session } from '@supabase/supabase-js'
import { useEffect, useEffectEvent, useState, type FormEvent, type ReactNode } from 'react'
import { rng } from './generate.ts'
import { clock, LEVELS, MODES, rankingFor, reward, START_COINS } from './rules.ts'
import { db } from './store.ts'
import { Deco } from './ui.tsx'

type Student = { code: string; pin: string }
type Row = {
  id: string
  student: string
  level: string
  result: string
  seconds: number
  wrong: number
  hints: number
  coins: number
  mistakes: [number, number][]
  played_at: string
}

const signErrors = (r: Row) => r.mistakes.filter(([answer, placed]) => answer !== 0 && placed === -answer).length
const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((t, r) => t + f(r), 0)
const bestOf = (rows: Row[], level: string) =>
  rows.filter((r) => r.level === level && r.result === 'win').sort((a, b) => a.seconds - b.seconds || a.wrong - b.wrong)[0]
const shortLevel = (id: string) => id.replace('relax-', 'R').replace('expert-', 'E')

function download(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const Shell = ({ children }: { children: ReactNode }) => (
  <main className="admin">
    {children}
    <p className="no-print">
      <a href="#">← Student app</a>
    </p>
  </main>
)

// Dev mode (no Supabase keys): ten made-up students at different points, so the dashboard can be
// reviewed and demoed. Never shown once the keys are set; nothing is saved.
function sampleData() {
  const rand = rng(7)
  const pick = (n: number) => Math.floor(rand() * n)
  const students: Student[] = []
  const rows: Row[] = []
  let time = Date.parse('2026-10-20T08:00:00Z')
  for (let s = 1; s <= 10; s++) {
    const code = `S${String(s).padStart(2, '0')}`
    students.push({ code, pin: String(1000 + pick(9000)) })
    const reached = 1 + pick(LEVELS.length)
    let balance = START_COINS
    LEVELS.slice(0, reached).forEach((l, i) => {
      const tries = 1 + pick(3)
      for (let t = 0; t < tries; t++) {
        const won = t === tries - 1 && (i < reached - 1 || rand() < 0.5)
        const result = won ? 'win' : rand() < 0.7 ? 'lose' : 'quit'
        const seconds = 40 + pick(260)
        const wrong = result === 'lose' ? 5 : pick(4)
        const hints = pick(10) < 2 && balance >= MODES[l.mode].hintCost ? 1 : 0
        const mistakes = Array.from({ length: wrong }, (): [number, number] => {
          const a = 1 + pick(20)
          return rand() < 0.5 ? [-a, a] : [a, a + 1 + pick(3)] // half of them are sign errors
        })
        time += 7 * 60_000
        const coins = (won ? reward(l.mode, seconds) : 0) - hints * MODES[l.mode].hintCost
        balance += coins
        rows.push({ id: `${code}-${l.id}-${t}`, student: code, level: l.id, result, seconds, wrong, hints, coins, mistakes, played_at: new Date(time).toISOString() })
      }
    })
  }
  return { students, rows }
}

export function Admin() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!db) return
    void db.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!db) return <Dashboard email="" demo />
  if (!ready) return <Shell>Loading…</Shell>
  return session ? <Dashboard email={session.user.email ?? ''} /> : <SignIn />
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { error } = await db!.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setMsg(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : `Couldn’t sign in: ${error.message}`)
  }
  return (
    <Shell>
      <form className="card form narrow" onSubmit={submit}>
        <h1>Admin sign in</h1>
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {msg && (
          <p className="error" role="alert">
            {msg}
          </p>
        )}
        <button className="big" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Shell>
  )
}

function Dashboard({ email, demo = false }: { email: string; demo?: boolean }) {
  const [sample] = useState(() => (demo ? sampleData() : null))
  const [students, setStudents] = useState<Student[]>(sample?.students ?? [])
  const [rows, setRows] = useState<Row[]>(sample?.rows ?? [])
  const [status, setStatus] = useState(demo ? '' : 'Loading…') // '' = ready
  const [notAdmin, setNotAdmin] = useState(false)
  const [count, setCount] = useState(10)
  const [rankLevel, setRankLevel] = useState('expert-1')

  async function reload() {
    if (demo) return setStatus('')
    const me = await db!.from('admins').select('uid')
    if (me.error) return setStatus(me.error.message)
    if (!me.data.length) return setNotAdmin(true)
    const s = await db!.from('students').select('code, pin').order('code')
    if (s.error) return setStatus(s.error.message)
    const all: Row[] = []
    for (let from = 0; ; from += 1000) {
      // the API hands out at most 1000 rows per request
      const r = await db!.from('attempts').select('*').order('played_at').range(from, from + 999)
      if (r.error) return setStatus(r.error.message)
      all.push(...(r.data as Row[]))
      if (r.data.length < 1000) break
    }
    setStudents(s.data)
    setRows(all)
    setStatus('')
  }
  const load = useEffectEvent(() => void reload())
  useEffect(() => {
    if (!demo) load()
  }, [demo])

  async function addStudents() {
    let last = Math.max(0, ...students.map((s) => Number(/^S(\d+)$/.exec(s.code)?.[1] ?? 0)))
    const fresh = Array.from(crypto.getRandomValues(new Uint16Array(count)), (r) => ({
      code: `S${String(++last).padStart(2, '0')}`,
      pin: String(r % 10000).padStart(4, '0'),
    }))
    if (demo) return setStudents([...students, ...fresh])
    const { error } = await db!.from('students').insert(fresh)
    if (error) return setStatus(error.message)
    await reload()
  }

  const byStudent = new Map<string, Row[]>(students.map((s) => [s.code, []]))
  for (const r of rows) byStudent.get(r.student)?.push(r)
  const ranking = rankingFor(
    rows.filter((r) => r.result === 'win').map((r) => ({ level: r.level, code: r.student, seconds: r.seconds, wrong: r.wrong })),
    rankLevel,
  )

  function exportAttempts() {
    download('attempts.csv', [
      ['student', 'level', 'result', 'seconds', 'wrong', 'sign_errors', 'hints', 'coins', 'played_at'],
      ...rows.map((r) => [r.student, r.level, r.result, r.seconds, r.wrong, signErrors(r), r.hints, r.coins, r.played_at]),
    ])
  }
  function exportStudents() {
    download('students.csv', [
      ['student', 'levels_won', ...LEVELS.map((l) => `${l.id}_best_seconds`), 'plays', 'wrong', 'sign_errors', 'hints', 'coins', 'last_played'],
      ...students.map((s) => {
        const list = byStudent.get(s.code)!
        return [
          s.code,
          LEVELS.filter((l) => bestOf(list, l.id)).length,
          ...LEVELS.map((l) => bestOf(list, l.id)?.seconds ?? ''),
          list.length,
          sum(list, (r) => r.wrong),
          sum(list, signErrors),
          sum(list, (r) => r.hints),
          START_COINS + sum(list, (r) => r.coins),
          list.at(-1)?.played_at ?? '',
        ]
      }),
    ])
  }

  if (notAdmin)
    return (
      <Shell>
        <h1>Admin</h1>
        <p>{email} is signed in but isn’t an admin account. Ask the developer to add it.</p>
        <button className="big secondary" onClick={() => db!.auth.signOut()}>
          Sign out
        </button>
      </Shell>
    )

  return (
    <Shell>
      <header className="bar no-print">
        <h1>INTEGRID Admin</h1>
        {!demo && (
          <>
            <span className="muted">{email}</span>
            <button className="link" onClick={() => db!.auth.signOut()}>
              Sign out
            </button>
          </>
        )}
      </header>
      {demo && <p className="notice no-print">Dev mode: sample students, no server connected. Nothing here is saved.</p>}
      {status && <p className="note no-print">{status}</p>}

      <section className="card no-print">
        <h2>Students</h2>
        <div className="row wrap">
          <label className="inline">
            Add
            <input type="number" min={1} max={60} value={count} onChange={(e) => setCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
            students
          </label>
          <button className="big" onClick={addStudents}>
            Add
          </button>
          <button className="big secondary" onClick={() => print()} disabled={!students.length}>
            🖨 Print code slips
          </button>
          <button
            className="big secondary"
            onClick={() => {
              setStatus('Loading…')
              void reload()
            }}
          >
            ↻ Refresh
          </button>
        </div>
        <p className="muted table-hint">Swipe the table sideways to see every level and the totals.</p>
        <div className="table-wrap" role="region" aria-label="Student progress" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>PIN</th>
                {LEVELS.map((l) => (
                  <th key={l.id} title={l.title}>
                    {shortLevel(l.id)}
                  </th>
                ))}
                <th>Plays</th>
                <th>Wrong</th>
                <th title="Placed the right number with the wrong sign">Sign errors</th>
                <th>Hints</th>
                <th>Coins</th>
                <th>Last played</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const list = byStudent.get(s.code)!
                const last = list.at(-1)
                return (
                  <tr key={s.code}>
                    <td>
                      <b>{s.code}</b>
                    </td>
                    <td>{s.pin}</td>
                    {LEVELS.map((l) => {
                      const best = bestOf(list, l.id)
                      const tries = list.filter((r) => r.level === l.id).length
                      return (
                        <td key={l.id} className={best ? 'won' : ''}>
                          {best ? `✓ ${clock(best.seconds)}` : tries ? `${tries} ${tries === 1 ? 'try' : 'tries'}` : '—'}
                        </td>
                      )
                    })}
                    <td>{list.length}</td>
                    <td>{sum(list, (r) => r.wrong)}</td>
                    <td>{sum(list, signErrors)}</td>
                    <td>{sum(list, (r) => r.hints)}</td>
                    <td>{START_COINS + sum(list, (r) => r.coins)}</td>
                    <td>{last ? new Date(last.played_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card no-print">
        <h2>🏆 Expert ranking</h2>
        <div className="tabs" role="tablist" aria-label="Expert level">
          <span className="tabs-label" aria-hidden="true">
            Level
          </span>
          {LEVELS.filter((l) => l.mode === 'expert').map((l) => (
            <button key={l.id} role="tab" aria-selected={l.id === rankLevel} aria-label={`Level ${l.n}`} onClick={() => setRankLevel(l.id)}>
              {l.n}
            </button>
          ))}
        </div>
        {ranking.length ? (
          <ol className="ranking">
            {ranking.map((r, i) => (
              <li key={r.code}>
                <span className="place">#{i + 1}</span>
                <span className="name">{r.code}</span>
                <span>{clock(r.seconds)}</span>
                <span className="muted">{r.wrong} wrong</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="note">No one has finished this level yet.</p>
        )}
      </section>

      <section className="card no-print">
        <h2>Download data</h2>
        <p className="muted">Opens in Excel or Google Sheets. Codes only, no names.</p>
        <div className="row wrap">
          <button className="big secondary" onClick={exportAttempts} disabled={!rows.length}>
            <Deco>⬇</Deco> attempts.csv <small>one row per play</small>
          </button>
          <button className="big secondary" onClick={exportStudents} disabled={!students.length}>
            <Deco>⬇</Deco> students.csv <small>one row per student</small>
          </button>
        </div>
      </section>

      <section className="slips" aria-hidden="true">
        {students.map((s) => (
          <div key={s.code} className="slip">
            <b>INTEGRID In Action</b>
            <span>
              Code: <strong>{s.code}</strong>
            </span>
            <span>
              PIN: <strong>{s.pin}</strong>
            </span>
            <small>Go to {location.host}</small>
          </div>
        ))}
      </section>
    </Shell>
  )
}
