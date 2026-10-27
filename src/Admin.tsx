import type { Session } from '@supabase/supabase-js'
import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Puzzles } from './AdminPuzzles.tsx'
import { ResearchTab, type Research } from './AdminResearch.tsx'
import type { HostGuard } from './Battle.tsx'
import { TeacherBattles } from './TeacherBattles.tsx'
import { rng } from './generate.ts'
import { RESEARCH_SURVEY, RESEARCH_TEST } from './content.ts'
import { isCurrent, refreshPuzzles } from './puzzles.ts'
import { BATTLES, clock, LEVELS, MODES, rankingFor, reward, START_COINS } from './rules.ts'
import { db } from './store.ts'
import { Deco, Dialog } from './ui.tsx'
import { Art } from './Art.tsx'
import { LoadingScreen } from './LoadingScreen.tsx'
import { ConfirmDialog } from './ConfirmDialog.tsx'
import { deleteStudent } from './studentAdmin.ts'
import { useBack } from './back.ts'
import { useAppUpdateBlocker } from './useAppUpdateBlocker.ts'

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
  puzzle?: string | null
}

const signErrors = (r: Row) => r.mistakes.filter(([answer, placed]) => answer !== 0 && placed === -answer).length
const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((t, r) => t + f(r), 0)
const bestOf = (rows: Row[], level: string) =>
  rows.filter((r) => r.level === level && r.result === 'win').sort((a, b) => a.seconds - b.seconds || a.wrong - b.wrong)[0]
const shortLevel = (id: string) => id.replace('relax-', 'R').replace('expert-', 'E').replace('battle-', 'B')
const hours = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`)
const DAY = 86_400_000

function download(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const Shell = ({ children, onStudentApp }: { children: ReactNode; onStudentApp?: () => void }) => (
  <main className="admin teacher-workspace">
    <header className="teacher-brandbar no-print">
      <div className="teacher-brand"><Art name="book" /><span><b>INTEGRID</b><small>TEACHER WORKSPACE</small></span></div>
      <a href="#" onClick={(e) => { e.preventDefault(); if (onStudentApp) onStudentApp(); else location.replace('#') }}><Deco>←</Deco> Student app</a>
    </header>
    {children}
  </main>
)

// Dev mode (no Supabase keys): ten made-up students at different points, so the dashboard can be
// reviewed and demoed. Never shown once the keys are set; nothing is saved.
function sampleData() {
  const rand = rng(7)
  const pick = (n: number) => Math.floor(rand() * n)
  const students: Student[] = []
  const rows: Row[] = []
  let time = Date.now() - 2 * DAY
  for (let s = 1; s <= 10; s++) {
    const code = `S${String(s).padStart(2, '0')}`
    students.push({ code, pin: String(1000 + pick(9000)) })
    const reached = 1 + pick(LEVELS.length)
    let balance = START_COINS
    if (s === 9) continue // one learner who hasn't started
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
  for (const r of rows) if (r.student === 'S04') r.played_at = new Date(Date.parse(r.played_at) - 6 * DAY).toISOString() // stopped a while ago
  return { students, rows, research: sampleResearch(students.map((s) => s.code), rand) }
}

// Dev mode: believable made-up results for the sample students, so the tab can be reviewed.
function sampleResearch(codes: string[], rand: () => number): Record<string, Research> {
  return Object.fromEntries(
    codes.map((c, k) => {
      const ability = 0.2 + 0.05 * k + 0.1 * rand()
      const marks = (gain: number) => RESEARCH_TEST.map((_, i) => rand() < Math.min(0.95, ability + gain + (i % 4) * 0.04))
      const survey = RESEARCH_SURVEY.flatMap((d) => d.items).map(() => (rand() < 0.15 ? 2 : rand() < 0.55 ? 3 : 4))
      return [c, { pre: marks(0), post: marks(0.3 + 0.1 * rand()), survey: k < 8 ? survey : null }]
    }),
  )
}

export function Admin() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!db) return
    void db.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    }).catch(() => setReady(true))
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!db) return <Dashboard email="" demo />
  if (!ready) return <Shell><LoadingScreen embedded title="Opening your classroom" detail="Getting your teacher tools ready." /></Shell>
  return session ? <Dashboard key={session.user.id} email={session.user.email ?? ''} teacherId={session.user.id} /> : <SignIn />
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useAppUpdateBlocker(busy || !!email || !!password)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      const { error } = await db!.auth.signInWithPassword({ email, password })
      if (error) setMsg(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : `Couldn’t sign in: ${error.message}`)
    } catch {
      setMsg('Couldn’t connect. Check your internet and try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell>
      <form className="card form narrow" onSubmit={submit}>
        <span className="teacher-auth-art"><Art name="profile" /></span><h1>Teacher sign in</h1><p className="muted">Your classroom tools, in one place.</p>
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

type Tab = 'overview' | 'students' | 'puzzles' | 'research' | 'battle'
const TABS: [Tab, string][] = [
  ['overview', 'Overview'], ['students', 'Students'], ['research', 'Research'],
  ['puzzles', 'Puzzles'], ['battle', 'Battle'],
]
const TAB_INFO = {
  overview: { art: 'target', title: 'Class overview', description: 'See progress, participation, and where learners need support.' },
  students: { art: 'profile', title: 'Manage your class', description: 'Create access codes and follow each learner’s progress.' },
  research: { art: 'book', title: 'Research workspace', description: 'Bring pretests, posttests, and learning experiences together.' },
  puzzles: { art: 'puzzle', title: 'Puzzle library', description: 'Review the level puzzles and see what is ready for play.' },
  battle: { art: 'battle', title: 'Class battles', description: 'Host a group race or revisit saved class rounds.' },
} as const
const TAB_KEY = 'integrid:admin-tab'
const NEEDS_UPDATE = 'This needs the database update: paste all of supabase/schema.sql into Supabase’s SQL Editor and press Run (safe to run again). Until then nothing here is saved.'

async function readDashboard(): Promise<
  | { error: string }
  | { notAdmin: true }
  | { students: Student[]; rows: Row[]; research: Record<string, Research>; researchIssue: string }
> {
  const me = await db!.from('admins').select('uid')
  if (me.error) return { error: me.error.message }
  if (!me.data.length) return { notAdmin: true }
  const s = await db!.from('students').select('code, pin').order('code')
  if (s.error) return { error: s.error.message }
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    // the API hands out at most 1000 rows per request
    const r = await db!.from('attempts').select('*').order('played_at').range(from, from + 999)
    if (r.error) return { error: r.error.message }
    rows.push(...(r.data as Row[]))
    if (r.data.length < 1000) break
  }
  const res = await db!.from('research').select('student, pre, post, survey')
  return {
    students: s.data,
    rows,
    research: Object.fromEntries((res.data ?? []).map((r) => [r.student, { pre: r.pre, post: r.post, survey: r.survey }])),
    researchIssue: res.error ? NEEDS_UPDATE : '',
  }
}

function Dashboard({ email, demo = false, teacherId }: { email: string; demo?: boolean; teacherId?: string }) {
  const [sample] = useState(() => (demo ? sampleData() : null))
  const [students, setStudents] = useState<Student[]>(sample?.students ?? [])
  const [rows, setRows] = useState<Row[]>(sample?.rows ?? [])
  const [research, setResearch] = useState<Record<string, Research>>(sample?.research ?? {})
  const [researchIssue, setResearchIssue] = useState(demo ? 'Dev mode: made-up results, nothing is saved.' : '')
  const [status, setStatus] = useState(demo ? '' : 'Loading…') // '' = ready
  const [notAdmin, setNotAdmin] = useState(false)
  const [open, setOpen] = useState<string | null>(null) // a learner's record
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY)
      return TABS.find(([id]) => id === saved)?.[0] ?? 'students'
    } catch {
      return 'students'
    }
  })
  const [, setPuzzles] = useState(0)
  const [hostGuard, setHostGuard] = useState<HostGuard | null>(null)
  const [leaving, setLeaving] = useState<'student' | 'signout' | null>(null)
  const [leavingBusy, setLeavingBusy] = useState(false)
  const [leavingError, setLeavingError] = useState('')
  function go(t: Tab) {
    setTab(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // the tab just isn't remembered
    }
  }

  async function reload() {
    void refreshPuzzles().then((ok) => ok && setPuzzles((n) => n + 1))
    if (demo) return
    return readDashboard().then((data) => {
      if ('error' in data) return setStatus(data.error)
      if ('notAdmin' in data) return setNotAdmin(true)
      setResearchIssue(data.researchIssue)
      setResearch(data.research)
      setStudents(data.students)
      setRows(data.rows)
      setStatus('')
    }).catch(() => setStatus('Couldn’t load the dashboard. Check your internet and press Refresh.'))
  }
  const load = useEffectEvent(() => void reload())
  useEffect(() => {
    load()
  }, [demo])

  async function addStudents(count: number) {
    let last = Math.max(0, ...students.map((s) => Number(/^S(\d+)$/.exec(s.code)?.[1] ?? 0)))
    const fresh = Array.from(crypto.getRandomValues(new Uint16Array(count)), (r) => ({
      code: `S${String(++last).padStart(2, '0')}`,
      pin: String(r % 10000).padStart(4, '0'),
    }))
    if (demo) return setStudents([...students, ...fresh])
    try {
      const { error } = await db!.from('students').insert(fresh)
      if (error) return setStatus(error.message)
      await reload()
    } catch {
      setStatus('Couldn’t add students. Check your internet and try again.')
    }
  }

  async function removeStudent(code: string) {
    if (!demo) await deleteStudent(db!, code)
    setStudents((cur) => cur.filter((s) => s.code !== code))
    setRows((cur) => cur.filter((r) => r.student !== code))
    setResearch((cur) => { const next = { ...cur }; delete next[code]; return next })
    setOpen((cur) => cur === code ? null : cur)
  }

  function askLeave(action: 'student' | 'signout') {
    if (action === 'student' && !hostGuard) { location.replace('#'); return }
    setLeavingError('')
    setLeaving(action)
  }
  async function leave() {
    if (leavingBusy) return
    setLeavingBusy(true)
    setLeavingError('')
    try {
      // Publish the ended room before closing the teacher's channels.
      await hostGuard?.end()
      if (leaving === 'signout') {
        const { error } = await db!.auth.signOut()
        if (error) throw error
      } else location.replace('#')
      setLeaving(null)
    } catch { setLeavingError('Couldn’t finish leaving. Check your connection and try again.') }
    finally { setLeavingBusy(false) }
  }
  useBack(() => askLeave('student'), 'screen', !!hostGuard)

  async function saveResearch(code: string, patch: Partial<Research>) {
    const next = { ...(research[code] ?? { pre: null, post: null, survey: null }), ...patch }
    if (!demo) {
      const { error } = await db!.from('research').upsert({ student: code, ...next, updated_at: new Date().toISOString() })
      if (error) throw new Error(/research/.test(error.message) ? NEEDS_UPDATE : error.message)
    }
    setResearch((cur) => ({ ...cur, [code]: next }))
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

  const byStudent = new Map<string, Row[]>(students.map((s) => [s.code, []]))
  for (const r of rows) byStudent.get(r.student)?.push(r)
  const openStudent = (code: string) => {
    go('students')
    setOpen(code)
  }

  return (
    <Shell onStudentApp={() => askLeave('student')}>
      <header className="bar no-print teacher-dashboard-title">
        <div><p className="eyebrow">Classroom hub</p><h1>Teacher workspace</h1></div>
        {!demo && (
          <>
            <span className="muted">{email}</span>
            <button className="link" onClick={() => askLeave('signout')}>
              Sign out
            </button>
          </>
        )}
      </header>
      {demo && <p className="notice no-print">Preview classroom · Sample data is shown. Changes here do not update school records.</p>}
      {status && <p className="note no-print">{status}</p>}

      <div className="teacher-layout no-print">
      <nav className="admin-tabs" role="tablist" aria-label="Admin sections" onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
        e.preventDefault()
        const current = TABS.findIndex(([id]) => id === tab)
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (current + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1) + TABS.length) % TABS.length
        go(TABS[next][0])
        e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
      }}>
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" id={`tab-${t}`} tabIndex={t === tab ? 0 : -1} aria-selected={t === tab} aria-controls="admin-panel" onClick={() => go(t)}>
            <Art name={TAB_INFO[t].art} /><span>{label}</span><Art name="arrow-right" className="teacher-nav-arrow" />
          </button>
        ))}
      </nav>
      <div id="admin-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="admin-panel">
        <header className="teacher-page-intro"><span className="teacher-page-icon"><Art name={TAB_INFO[tab].art} /></span><div><p className="eyebrow">{['overview', 'students', 'research'].includes(tab) ? 'Track and understand' : 'Prepare and play'}</p><h2>{TAB_INFO[tab].title}</h2><p>{TAB_INFO[tab].description}</p></div></header>
        {tab === 'overview' && <Overview students={students} byStudent={byStudent} rows={rows} onOpen={openStudent} />}
        {tab === 'students' && (
          <StudentsTab students={students} byStudent={byStudent} rows={rows} research={research} onAdd={addStudents} onDelete={removeStudent} onReload={reload} open={open} onOpen={setOpen} />
        )}
        {tab === 'puzzles' && <Puzzles rows={rows} />}
        {tab === 'research' && <ResearchTab codes={students.map((s) => s.code)} data={research} saveIssue={researchIssue} onSave={saveResearch} />}
        {/* Keep the room alive while the teacher checks other sections. */}
        <div hidden={tab !== 'battle'}><TeacherBattles teacherId={teacherId} onGuardChange={setHostGuard} /></div>
      </div>
      </div>

      {leaving && <ConfirmDialog title={leaving === 'signout' ? 'Sign out of the teacher workspace?' : 'Leave the teacher workspace?'}
        confirmLabel={hostGuard ? 'End battle and leave' : 'Sign out'} cancelLabel="Stay here" onCancel={() => setLeaving(null)} onConfirm={() => void leave()} busy={leavingBusy} error={leavingError}>
        <p>{hostGuard ? `Room ${hostGuard.room} is ${hostGuard.state === 'live' ? 'running' : 'waiting for players'}. Leaving will end the battle for every group.` : 'Your class records stay saved. You’ll need to sign in again to return.'}</p>
      </ConfirmDialog>}

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

// ---------- Overview ----------

// The level a learner is on: the first one they haven't won.
const currentLevel = (list: Row[]) => LEVELS.find((l) => !list.some((r) => r.level === l.id && r.result === 'win'))

function Overview({ students, byStudent, rows, onOpen }: { students: Student[]; byStudent: Map<string, Row[]>; rows: Row[]; onOpen: (code: string) => void }) {
  const [rankLevel, setRankLevel] = useState('expert-1')
  const [now] = useState(Date.now)
  const week = students.filter((s) => byStudent.get(s.code)!.some((r) => now - Date.parse(r.played_at) < 7 * DAY)).length
  const n = students.length || 1
  const attention = students.flatMap((s) => {
    const list = byStudent.get(s.code)!
    if (!list.length) return [{ code: s.code, why: 'hasn’t played yet' }]
    const out: { code: string; why: string }[] = []
    const days = Math.floor((now - Date.parse(list.at(-1)!.played_at)) / DAY)
    if (days >= 3) out.push({ code: s.code, why: `no play for ${days} days` })
    const lvl = currentLevel(list)
    const tries = lvl ? list.filter((r) => r.level === lvl.id).length : 0
    if (lvl && tries >= 3) out.push({ code: s.code, why: `${tries} tries on ${shortLevel(lvl.id)} (${lvl.title}), not won yet` })
    return out
  })
  const ranking = rankingFor(
    rows.filter((r) => r.result === 'win' && isCurrent(r.level, r.puzzle)).map((r) => ({ level: r.level, code: r.student, seconds: r.seconds, wrong: r.wrong })),
    rankLevel,
  )
  const progress = [
    ...LEVELS.map((l) => ({ id: l.id, label: `${shortLevel(l.id)} · ${l.title}`, won: students.filter((s) => byStudent.get(s.code)!.some((r) => r.level === l.id && r.result === 'win')).length })),
    { id: 'battle', label: 'Battle (any round won)', won: students.filter((s) => byStudent.get(s.code)!.some((r) => r.level.startsWith('battle-') && r.result === 'win')).length },
  ]
  return (
    <>
      <section className="stat-cards" aria-label="At a glance">
        <div className="card stat">
          <b>{students.length}</b>learners
        </div>
        <div className="card stat">
          <b>
            {week}/{students.length}
          </b>
          played this week
        </div>
        <div className="card stat">
          <b>{rows.length}</b>results
        </div>
        <div className="card stat">
          <b>{hours(rows.reduce((t, r) => t + r.seconds, 0))}</b>time playing
        </div>
      </section>

      <section className="card">
        <h2>Progress through the levels</h2>
        <p className="muted small">How many learners have won each level.</p>
        <ul className="funnel">
          {progress.map((p) => (
            <li key={p.id}>
              <span className="label">{p.label}</span>
              <span className="meter" aria-hidden="true">
                <i style={{ width: `${(100 * p.won) / n}%` }} />
              </span>
              <span className="count">
                {p.won}/{students.length}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Needs attention</h2>
        {attention.length ? (
          <ul className="attention">
            {attention.map((a, i) => (
              <li key={i}>
                <button className="link" onClick={() => onOpen(a.code)}>
                  {a.code}
                </button>{' '}
                {a.why}
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">Everyone is playing and moving along.</p>
        )}
      </section>

      <section className="card">
        <h2>
          <Deco>🏆</Deco> Expert ranking
        </h2>
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
    </>
  )
}

// ---------- Students ----------

function StudentsTab(props: {
  students: Student[]
  byStudent: Map<string, Row[]>
  rows: Row[]
  research: Record<string, Research>
  onAdd: (count: number) => Promise<void>
  onDelete: (code: string) => Promise<void>
  onReload: () => Promise<void>
  open: string | null
  onOpen: (code: string | null) => void
}) {
  const { students, byStudent, rows } = props
  const [countText, setCountText] = useState('10') // kept as typed; clamped to 1–60 when used
  const count = Math.max(1, Math.min(60, Math.round(Number(countText)) || 1))
  const [busy, setBusy] = useState('')
  useAppUpdateBlocker(!!busy)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleted, setDeleted] = useState('')
  const deletingNow = useRef(false)
  async function confirmDelete() {
    if (!deleting || deletingNow.current) return
    deletingNow.current = true
    setBusy('Deleting…')
    setDeleteError('')
    try {
      await props.onDelete(deleting)
      setDeleted(`Deleted ${deleting} and their saved class records.`)
      setDeleting(null)
    } catch (e) { setDeleteError(`Couldn’t delete ${deleting}: ${(e as Error).message}`) }
    finally { deletingNow.current = false; setBusy('') }
  }

  function exportAttempts() {
    download('attempts.csv', [
      ['student', 'level', 'result', 'seconds', 'wrong', 'sign_errors', 'hints', 'coins', 'puzzle', 'played_at'],
      ...rows.map((r) => [r.student, r.level, r.result, r.seconds, r.wrong, signErrors(r), r.hints, r.coins, r.puzzle ?? '', r.played_at]),
    ])
  }
  function exportStudents() {
    download('students.csv', [
      ['student', 'levels_won', ...LEVELS.map((l) => `${l.id}_best_seconds`), 'plays', 'wrong', 'sign_errors', 'hints', 'coins', 'seconds_played', 'last_played'],
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
          sum(list, (r) => r.seconds),
          list.at(-1)?.played_at ?? '',
        ]
      }),
    ])
  }

  return (
    <>
      <section className="card">
        <h2>Students</h2>
        <div className="row wrap">
          <label className="inline">
            Add
            <input type="number" min={1} max={60} value={countText} onChange={(e) => setCountText(e.target.value)} onBlur={() => setCountText(String(count))} />
            students
          </label>
          <button
            className="big"
            disabled={!!busy}
            onClick={async () => {
              setBusy('Adding…')
              setCountText(String(count))
              try { await props.onAdd(count) } finally { setBusy('') }
            }}
          >
            Add
          </button>
          <button className="big secondary" onClick={() => print()} disabled={!students.length}>
            <Deco>🖨</Deco> Print code slips
          </button>
          <button
            className="big secondary"
            disabled={!!busy}
            onClick={async () => {
              setBusy('Loading…')
              try { await props.onReload() } finally { setBusy('') }
            }}
          >
            <Deco>↻</Deco> Refresh
          </button>
        </div>
        {busy && <p className="note" role="status">{busy}</p>}
        {deleted && <p className="note" role="status">{deleted}</p>}
        <p className="muted table-hint">Tap a code to see that learner’s full record. Swipe the table sideways for every level and the totals.</p>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const list = byStudent.get(s.code)!
                const last = list.at(-1)
                return (
                  <tr key={s.code}>
                    <td>
                      <button className="link code" onClick={() => props.onOpen(s.code)} aria-label={`${s.code}: open record`}>
                        {s.code}
                      </button>
                    </td>
                    <td>{s.pin}</td>
                    {LEVELS.map((l) => {
                      const best = bestOf(list, l.id)
                      const tries = list.filter((r) => r.level === l.id).length
                      return (
                        <td key={l.id} className={best ? 'won' : ''}>
                          {best ? <><Deco>✓</Deco> {clock(best.seconds)}</> : tries ? `${tries} ${tries === 1 ? 'try' : 'tries'}` : '—'}
                        </td>
                      )
                    })}
                    <td>{list.length}</td>
                    <td>{sum(list, (r) => r.wrong)}</td>
                    <td>{sum(list, signErrors)}</td>
                    <td>{sum(list, (r) => r.hints)}</td>
                    <td>{START_COINS + sum(list, (r) => r.coins)}</td>
                    <td>{last ? new Date(last.played_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                    <td><button className="student-delete" aria-label={`Delete student ${s.code}`} disabled={!!busy} onClick={() => { setDeleteError(''); setDeleting(s.code) }}>Delete</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
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

      {deleting && <ConfirmDialog title={`Delete student ${deleting}?`} confirmLabel={`Delete ${deleting}`} onCancel={() => setDeleting(null)} onConfirm={() => void confirmDelete()} busy={busy === 'Deleting…'} error={deleteError}>
        <p>This permanently deletes the student’s code, {byStudent.get(deleting)?.length ?? 0} saved game results, and any pretest, posttest and survey records. It also removes their individual rankings and class reports. Past class Battle History stays saved.</p>
        <p>This cannot be undone. Download the class data first if you need a copy.</p>
        <p className="muted small">Copies already saved on student devices remain there, but this code will stop syncing to the class.</p>
      </ConfirmDialog>}

      {props.open && byStudent.has(props.open) && (
        <StudentRecord code={props.open} pin={students.find((s) => s.code === props.open)!.pin} list={byStudent.get(props.open)!} research={props.research[props.open]} onClose={() => props.onOpen(null)} />
      )}
    </>
  )
}

// One learner's record: every level, their mistakes (are they sign errors?), battles and test scores.
function StudentRecord({ code, pin, list, research, onClose }: { code: string; pin: string; list: Row[]; research?: Research; onClose: () => void }) {
  const wrongs = list.flatMap((r) => r.mistakes.map(([answer, placed]) => ({ level: r.level, answer, placed, sign: answer !== 0 && placed === -answer })))
  const signs = wrongs.filter((w) => w.sign).length
  const levels = [...LEVELS, ...BATTLES].filter((l) => list.some((r) => r.level === l.id))
  const score = (m: boolean[] | null | undefined) => (m ? m.filter(Boolean).length : null)
  const pre = score(research?.pre)
  const post = score(research?.post)
  const n = (v: number) => (v < 0 ? `−${-v}` : String(v))
  return (
    <Dialog title={`Learner ${code}`} onClose={onClose} className="teacher-record-panel" focusTitle>
      <p className="muted">
        PIN {pin} · {list.length} plays · {hours(sum(list, (r) => r.seconds))} playing
        {list.length ? ` · last played ${new Date(list.at(-1)!.played_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
      </p>
      {pre !== null || post !== null ? (
        <p>
          Pretest {pre ?? '—'}/20 · Posttest {post ?? '—'}/20{pre !== null && post !== null ? ` · gain ${post - pre >= 0 ? '+' : '−'}${Math.abs(post - pre)}` : ''}
        </p>
      ) : null}
      {levels.length ? (
        <div className="table-wrap" role="region" aria-label="Learner level results" tabIndex={0}><table className="rtable">
          <thead>
            <tr>
              <th>Level</th>
              <th>Tries</th>
              <th>Best time</th>
              <th>Wrong</th>
              <th>Hints</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => {
              const mine = list.filter((r) => r.level === l.id)
              const best = bestOf(mine, l.id)
              return (
                <tr key={l.id}>
                  <th scope="row" title={l.title}>
                    {shortLevel(l.id)} <small className="muted">{l.title}</small>
                  </th>
                  <td>{mine.length}</td>
                  <td>{best ? clock(best.seconds) : 'not won'}</td>
                  <td>{sum(mine, (r) => r.wrong)}</td>
                  <td>{sum(mine, (r) => r.hints)}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      ) : (
        <p className="note">Hasn’t played yet.</p>
      )}
      {wrongs.length > 0 && (
        <>
          <h3>Mistakes</h3>
          <p>
            <b>
              {signs} of {wrongs.length}
            </b>{' '}
            wrong answers ({Math.round((100 * signs) / wrongs.length)}%) were <b>sign errors</b>: the right number with the wrong sign.
          </p>
          <ul className="mistakes">
            {wrongs.slice(-12).map((w, i) => (
              <li key={i} className={w.sign ? 'sign' : undefined}>
                {shortLevel(w.level)}: answer {n(w.answer)}, placed {n(w.placed)}
                {w.sign ? ' · sign error' : ''}
              </li>
            ))}
          </ul>
          {wrongs.length > 12 && <p className="muted small">The last 12 shown; attempts.csv has them all.</p>}
        </>
      )}
      <button className="big" onClick={onClose} autoFocus>
        Close
      </button>
    </Dialog>
  )
}
