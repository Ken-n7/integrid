import { SaveWarning } from './SaveWarning.tsx'
// Battle Mode (dev plan §10). The teacher's admin page hosts a room; each group shares one grid.
// Online rooms use credential-checked RPCs; demo rooms use local browser channels.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useBack } from './back.ts'
import { apply, countWrong, isGroupMsg, isRoom, roundFinished, standings, sum, type Bar, type GroupMsg, type Host, type Room } from './battleState.ts'
import { Game, type BattleLink } from './Game.tsx'
import { blanksOf, key, parse } from './puzzle.ts'
import { puzzleFor } from './puzzles.ts'
import { BATTLES, clock, HEARTS, type Attempt } from './rules.ts'
import { db, uuid } from './store.ts'
import { BattleRelay, type BattleAuth } from './battleRelay.ts'
import { Coins, Deco, Icon } from './ui.tsx'
import { Art } from './Art.tsx'
import { ConfirmDialog } from './ConfirmDialog.tsx'
import { useBeforeUnload } from './useBeforeUnload.ts'
import { archiveBattle, type BattleOutcome, type BattleRecord } from './battleHistory.ts'

const relays = new Map<string, { relay: BattleRelay; users: number }>()
function channel<M>(name: string, onMsg: (m: M) => void, onReady: () => void = () => {}, auth: BattleAuth = { teacher: true }, onError: (error: unknown) => void = () => {}) {
  if (!db) {
    const bc = new BroadcastChannel(name)
    bc.onmessage = (e) => onMsg(e.data as M)
    const ready = setTimeout(onReady)
    return { send: (m: M) => { bc.postMessage(m); return Promise.resolve('ok') }, close: () => { clearTimeout(ready); bc.close() } }
  }
  const match = /^ig-(\d{4})(?:-(\d+))?$/.exec(name)
  if (!match) throw new Error('Invalid room channel')
  const room = match[1], subject = match[2] === undefined ? 'room' : Number(match[2])
  const key = room + ':' + ('teacher' in auth ? 'teacher' : auth.code)
  let entry = relays.get(key)
  if (!entry) { entry = { relay: new BattleRelay(db, room, auth, onError), users: 0 }; relays.set(key, entry) }
  entry.users++
  const current = entry
  const unsubscribe = current.relay.subscribe(subject, value => {
    if (subject === 'room' && current.relay.pending === 0) onError(null)
    onMsg(value as M)
  }, onReady)
  return {
    send: (m: M) => {
      const sent = subject === 'room' ? current.relay.publish(m as Room) : current.relay.event(subject, m as GroupMsg)
      void sent.then(() => { if (current.relay.pending === 0) onError(null) }, onError)
      return sent
    },
    close: () => { unsubscribe(); if (--current.users === 0) { current.relay.close(); relays.delete(key) } },
  }
}

const totalOf = (csv: string) => blanksOf(parse(csv)).length
// The live ranking: one card per group, leader first. `top` keeps the grid screen short in a big
// class (8 groups of 5): the leaders plus your own group. `names`: the teacher's page lists members.
function Bars({ bars, total, mine, members, names = false, top = Infinity, compact = false, final = false }: { bars: Bar[]; total: number; mine?: number; members: string[][]; names?: boolean; top?: number; compact?: boolean; final?: boolean }) {
  const rows = standings(bars, members).map((b, i) => ({ ...b, place: i + 1 }))
  return (
    <ol className={`bars${compact ? ' bars-compact' : ''}${final ? ' bars-final' : ''}`} aria-label={final ? 'Final ranking' : 'Live ranking'}>
      {rows.filter((b) => b.place <= top || b.g === mine).map((b) => (
        <li key={b.g} className={`${b.g === mine ? 'mine ' : ''}${b.place === 1 ? 'leader' : ''}`}>
          <span className="who-row">
            <span className="place">#{b.place}</span> <b>G{compact ? <span className="sr">roup </span> : 'roup '}{b.g + 1}</b>
            {b.g === mine && <span className="bars-you">{compact ? 'YOU' : 'Your group'}</span>}
            {names && <small className="bars-members">{members[b.g]?.join(', ') || 'No players yet'}</small>}
          </span>
          <span className="score">
            {b.done !== null ? (
              <>
                <Deco>✓</Deco>{' '}
                <span className="sr">finished in&nbsp;</span>
                {clock(b.done)}
              </>
            ) : (
              <>{b.cells.length} / {total}<span className="sr"> boxes filled</span></>
            )}
            <span className="bars-mistakes">{b.done === null && b.wrong >= HEARTS ? 'Out of hearts' : `${b.wrong} wrong`}</span>
          </span>
          <span className="meter" aria-hidden="true">
            <i style={{ width: `${(100 * b.cells.length) / (total || 1)}%` }} />
          </span>
        </li>
      ))}
    </ol>
  )
}

// ---------- students ----------

type Props = { saveIssue?: boolean; onRetrySave?: () => void; code: string; pin: string; coins: number; onExit: (completedFinal?: boolean) => void; onProgress: (a: Attempt) => void; onFinish: (a: Attempt) => void }

export function BattleRoom({ saveIssue, onRetrySave, code, pin, coins, onExit, onProgress, onFinish }: Props) {
  const [runId] = useState(uuid) // rejoining starts a new wrong-answer count, without restoring group hearts
  const [typed, setTyped] = useState('')
  const [msg, setMsg] = useState('')
  const [connectionIssue, setConnectionIssue] = useState('')
  const [room, setRoom] = useState<string | null>(null)
  const [snap, setSnap] = useState<Room | null>(null)
  const [group, setGroup] = useState<number | null>(null)
  const [shared, setShared] = useState<Record<string, boolean>>({}) // boxes my group solved
  const [wrongs, setWrongs] = useState<Record<string, number>>({}) // each member's wrong answers, for the group's hearts
  const send = useRef<(m: GroupMsg) => void>(() => {})
  const [inBattle, setInBattle] = useState(false) // was in the grid while the round ran
  const last = useRef<Attempt | null>(null) // my run so far, from the game
  const logged = useRef(false)
  const groupNow = useRef(group)
  useEffect(() => {
    groupNow.current = group
  })
  const inGame = inBattle && !!snap && group !== null
  const csv = snap?.csv

  // The teacher's page repeats the room every few seconds, so 8 s of silence means a wrong code.
  // Its clock is the one that counts: startedAt is moved onto this phone's clock.
  useEffect(() => {
    if (!room) return
    let heard = false
    const ch = channel<Room>(`ig-${room}`, (r) => {
      if (!isRoom(r)) return
      heard = true
      setSnap({ ...r, startedAt: r.startedAt && r.startedAt + (Date.now() - r.sentAt) })
      if (r.state === 'live' && groupNow.current !== null) setInBattle(true)
    }, () => {}, { code, pin }, error => setConnectionIssue(error ? 'Battle connection interrupted. Check your connection and ask your teacher if it continues.' : ''))
    const t = setTimeout(() => {
      if (heard) return
      setMsg(`No battle with room code ${room}. Check the code on the board.`)
      setRoom(null)
    }, 8000)
    return () => {
      clearTimeout(t)
      ch.close()
    }
  }, [room, code, pin])

  useEffect(() => {
    if (!room || group === null || !csv) return
    const boxes = new Set(blanksOf(parse(csv)).map(key))
    const ch = channel<GroupMsg>(
      `ig-${room}-${group}`,
      (m) => {
        if (!isGroupMsg(m)) return
        if (m.t === 'cell' && boxes.has(m.k)) setShared((s) => (m.k in s ? s : { ...s, [m.k]: m.hint }))
        if (m.t === 'wrong') setWrongs((w) => countWrong(w, m.code, m.wrong, m.run))
      },
      () => { void ch.send({ t: 'join', code }) },
      { code, pin }, error => setConnectionIssue(error ? 'Your Battle update is waiting to send. Check your connection.' : ''),
    )
    send.current = ch.send
    return () => {
      ch.send({ t: 'leave', code })
      ch.close()
      send.current = () => {}
      setWrongs({})
    }
  }, [room, group, code, pin, csv])

  // Not on the teacher's list yet (a lost message, or the teacher's page reloaded): say hello again.
  const listed = !snap || group === null || snap.state === 'done' || snap.members[group]?.includes(code)
  useEffect(() => {
    if (!listed) send.current({ t: 'join', code })
  }, [listed, snap, code])

  // Round over: log my run with the group's result (§10.9).
  useEffect(() => {
    if (snap?.state !== 'done' || group === null || !inBattle || logged.current) return
    logged.current = true
    const start = snap.startedAt ?? Date.now()
    const base = last.current ?? { id: uuid(), level: snap.puzzle, result: 'quit', seconds: 0, wrong: 0, hints: 0, coins: 0, mistakes: [], at: new Date(start).toISOString() }
    const place = standings(snap.bars, snap.members).findIndex((b) => b.g === group) + 1
    const seconds = snap.bars[group]?.done ?? Math.min(snap.seconds, Math.round((Date.now() - start) / 1000))
    onFinish({ ...base, result: place === 1 ? 'win' : 'lose', seconds })
  }, [snap, group, inBattle, onFinish])

  function back() {
    if (group !== null) return setGroup(null)
    if (room) {
      setRoom(null)
      setSnap(null)
      return
    }
    onExit()
  }
  useBack(back, 'screen', !inGame)

  function join(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{4}$/.test(typed)) return setMsg('Type the 4-digit room code.')
    setMsg('')
    setSnap(null)
    setRoom(typed)
  }

  if (inGame) {
    const level = BATTLES.find((b) => b.id === snap.puzzle)!
    const p = { csv: snap.csv, sample: !!puzzleFor(snap.puzzle)?.sample } // the teacher's copy: every grid in the room is the same
    const place = standings(snap.bars, snap.members).findIndex((b) => b.g === group) + 1
    const link: BattleLink = {
      title: `Group ${group + 1}`,
      startedAt: snap.startedAt ?? 0, // always set once the round has started
      seconds: snap.seconds,
      shared: { ...Object.fromEntries((snap.bars[group]?.cells ?? []).map((k) => [k, false])), ...shared },
      // teammates' messages arrive at once; the teacher's total covers any that were missed
      hearts: Math.max(0, HEARTS - Math.max(sum(wrongs), snap.bars[group]?.wrong ?? 0)),
      over: snap.state === 'done',
      won: place === 1,
      bars: <Bars bars={snap.bars} total={totalOf(snap.csv)} mine={group} members={snap.members} top={snap.state === 'done' ? Infinity : 3} compact={snap.state !== 'done'} final={snap.state === 'done'} />,
      result: (
        <>
          <section className="battle-result" aria-label="Your group result">
            <Art name={place === 1 ? 'trophy' : 'medal'} className="battle-result-art" />
            <p className="eyebrow">Group {group + 1} · {level.title}</p>
            <h3>{place === 1 ? 'Your group won!' : `Your group placed #${place}`}</h3>
            <p className="battle-result-note">Here’s how your team finished.</p>
            <dl className="battle-result-stats">
              <div><dt>Place</dt><dd>#{place}</dd></div>
              <div><dt>Boxes filled</dt><dd>{snap.bars[group]?.cells.length ?? 0}<small> / {totalOf(snap.csv)}</small></dd></div>
              <div><dt>Wrong</dt><dd>{snap.bars[group]?.wrong ?? 0}</dd></div>
            </dl>
          </section>
          <h3 className="battle-ranking-title">Final ranking</h3>
        </>
      ),
      issue: connectionIssue,
      onSolve: (k, hint, value) => {
        setShared((s) => ({ ...s, [k]: hint }))
        send.current({ t: 'cell', code, k, hint, value })
      },
      onWrong: (wrong, k, value) => {
        setWrongs((w) => countWrong(w, code, wrong, runId))
        send.current({ t: 'wrong', code, wrong, run: runId, k, value })
      },
    }
    return (
      <Game
        saveIssue={saveIssue} onRetrySave={onRetrySave}
        key={`${room}-${group}`}
        level={level}
        csv={p.csv}
        sample={p.sample}
        coins={coins}
        rankOf={() => null}
        onProgress={(a) => {
          last.current = a
          onProgress(a)
        }}
        onFinish={onFinish}
        onExit={() => onExit(snap.state === 'done' && level.id === BATTLES.at(-1)?.id)}
        onNext={null}
        battle={link}
      />
    )
  }

  const members = snap && group !== null ? [...new Set([...(snap.members[group] ?? []), code])].sort() : []
  const step = !room || !snap || snap.state === 'done' ? 0 : group === null ? 1 : 2
  return (
    <main className="screen battle-screen" tabIndex={-1}>
      <header className="bar battle-screen-bar">
        <button className="icon" onClick={back} aria-label={group !== null ? 'Back to the groups' : room ? 'Leave the room' : 'Back to modes'}>
          <Icon name="back" />
        </button>
        <span className="eyebrow">Your adventure</span>
        <Coins n={coins} />
      </header>

      {saveIssue && <SaveWarning onRetry={onRetrySave} />}
      {connectionIssue && <p className="error" role="alert">{connectionIssue}</p>}
      <div className="battle-heading">
        <div><p className="eyebrow">Team up. Take on the grid.</p><h1>Battle Mode</h1><p>One puzzle. Your group. A race together.</p></div>
        <span className="battle-heading-art" aria-hidden="true"><Art name="battle" /></span>
      </div>

      <ol className="battle-steps" aria-label="Joining steps">
        {['Room', 'Group', 'Ready'].map((label, i) => <li key={label} className={i < step ? 'complete' : i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined}><span aria-hidden="true">{i < step ? <Art name="check" /> : i + 1}</span>{label}</li>)}
      </ol>

      {room && snap && snap.state !== 'done' && (
        <section className="battle-room-summary" aria-label="Battle room details">
          <span className="battle-room-number"><small>ROOM CODE</small><b>{room}</b></span>
          <span className="battle-room-details"><b>{BATTLES.find((b) => b.id === snap.puzzle)?.title}</b><span><Icon name="clock" /> {Math.round(snap.seconds / 60)} min <span className={`battle-state ${snap.state === 'live' ? 'live' : ''}`}>{snap.state === 'live' ? 'Live now' : 'Joining'}</span></span></span>
        </section>
      )}

      {!room ? (
        <>
          <form className="battle-join form" onSubmit={join} noValidate>
            <h2>Join your class</h2>
            <label>
              Room code
              <input value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={4} placeholder="0000" aria-invalid={!!msg} aria-describedby={`room-code-help${msg ? ' room-error' : ''}`} />
            </label>
            <p id="room-code-help" className="battle-help">Enter the 4-digit code your teacher shows on the board.</p>
            {msg && <p id="room-error" className="error" role="alert">{msg}</p>}
            <button className="big">Join <Icon name="next" /></button>
          </form>
          <p className="battle-tip"><Art name="info" /><span>Your group shares one puzzle and {HEARTS} lives. Every player can help.</span></p>
        </>
      ) : !snap ? (
        <section className="battle-status-card"><Art name="magnifier" /><h2>Finding your battle</h2><p role="status">Looking for room {room}…</p><p className="battle-help">Keep this screen open while we connect.</p></section>
      ) : snap.state === 'done' ? (
        <section className="battle-status-card">
          <Art name="flag" /><h2>This battle has ended</h2><p role="status">Ask your teacher for the next room code.</p>
          <button className="big" onClick={() => { setGroup(null); setRoom(null); setSnap(null); setTyped(''); setMsg('') }}>Enter a new code</button>
        </section>
      ) : group === null ? (
        <section className="battle-group-section" aria-labelledby="pick-group-title">
          <div className="battle-section-heading"><h2 id="pick-group-title">Choose your group</h2><p>Join the group your teacher assigned.</p></div>
          <div className="battle-group-grid">
            {snap.members.map((m, g) => (
              <button key={g} className="battle-group-card" onClick={() => { setGroup(g); if (snap.state === 'live') setInBattle(true) }}>
                <span className="battle-group-body"><span className="battle-group-number" aria-hidden="true">{g + 1}</span><span><b>Group {g + 1}</b><small>{m.length ? `${m.length} ${m.length === 1 ? 'player' : 'players'} joined` : 'Be the first to join'}</small></span></span>
                {m.length > 0 && <span className="battle-group-members">{m.join(', ')}</span>}
                <span className="battle-group-footer"><span>Join group</span><Icon name="next" /></span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="battle-wait-card lobby" aria-labelledby="your-group-title">
            <span className="battle-joined">Joined</span>
            <Art name="controller" className="battle-lobby-art" />
            <p className="eyebrow">Your group</p><h2 id="your-group-title">Group {group + 1}</h2>
            <div className="battle-member-chips" aria-label="Group members">{members.map((member) => <span key={member} className={member === code ? 'you' : undefined}>{member}{member === code && <b> (you)</b>}</span>)}</div>
            <p className="battle-waiting" role="status"><Icon name="clock" />Waiting for your teacher to start…</p>
            <p className="battle-help">The puzzle opens automatically when the round starts.</p>
          </section>
          <button className="big secondary battle-change-group" onClick={() => setGroup(null)}>Change group</button>
          <p className="battle-tip"><Art name="heart" /><span>Work together: your group shares {HEARTS} lives.</span></p>
        </>
      )}
    </main>
  )
}

// ---------- teacher (admin page) ----------

const barsOf = (h: Host): Bar[] => h.cells.map((cells, g) => ({ cells, wrong: sum(h.wrongs[g]), done: h.done[g] }))
const roomOf = (h: Host): Room => ({ instance: h.instance, puzzle: h.puzzle, csv: h.csv, seconds: h.seconds, state: h.state, startedAt: h.startedAt, sentAt: Date.now(), members: h.members, bars: barsOf(h) })

// A number box's text as a whole number in [lo, hi] (empty or junk: the default).
const clampOf = (text: string, lo: number, hi: number, fallback: number) => Math.max(lo, Math.min(hi, Math.round(Number(text)) || fallback))

export type HostGuard = { room: string; state: 'lobby' | 'live'; end: () => Promise<void> }

export function BattleHost({ onGuardChange, onArchive, onShowHistory }: { onGuardChange?: (guard: HostGuard | null) => void; onArchive?: (record: BattleRecord) => void; onShowHistory?: () => void } = {}) {
  const [puzzle, setPuzzle] = useState(BATTLES[0].id)
  // kept as typed, so clearing a box to type a new number works; clamped when used
  const [groupsText, setGroupsText] = useState('2')
  const [minutesText, setMinutesText] = useState('10')
  const groups = clampOf(groupsText, 2, 8, 2)
  const minutes = clampOf(minutesText, 1, 60, 10)
  const [h, setH] = useState<Host | null>(null)
  const [now, setNow] = useState(Date.now)
  const send = useRef<(r: Room) => void | Promise<unknown>>(() => {})
  const latest = useRef<Host | null>(null)
  const finalizing = useRef(false)
  const archiveMeta = useRef<{ id: string; created_at: string; puzzle_version: string; roster: string[][]; saved: boolean } | null>(null)
  useEffect(() => {
    latest.current = h
  })
  const saveArchive = useCallback((final: Host, outcome: BattleOutcome) => {
    const meta = archiveMeta.current
    if (!meta || meta.saved) return
    meta.saved = true
    onArchive?.(archiveBattle(final, meta, outcome))
  }, [onArchive])

  const [action, setAction] = useState<'start' | 'end' | 'cancel' | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const endHostedBattle = useCallback(async (outcome: 'ended' | 'cancelled' = 'ended') => {
    const cur = latest.current
    if (!cur || cur.state === 'done') return
    const next = { ...cur, state: 'done' as const, startedAt: cur.startedAt ?? Date.now() }
    const result = await send.current(roomOf(next))
    if (result && result !== 'ok') throw new Error('Couldn’t notify the class. Check your connection and try again.')
    // The timer may have ended the same room while the broadcast was in flight.
    if (latest.current?.state === 'done') return
    saveArchive(next, cur.state === 'lobby' ? 'cancelled' : outcome)
    latest.current = next
    setH(next)
  }, [saveArchive])
  const hostedRoom = h?.room
  const hostedState = h?.state
  useEffect(() => {
    onGuardChange?.(hostedRoom && hostedState && hostedState !== 'done' ? { room: hostedRoom, state: hostedState, end: endHostedBattle } : null)
    return () => onGuardChange?.(null)
  }, [onGuardChange, hostedRoom, hostedState, endHostedBattle])
  useBeforeUnload(!!h && h.state !== 'done')

  const code = h?.room
  useEffect(() => {
    if (!code) return
    const roomCh = channel<Room>(`ig-${code}`, () => {}, () => {}, { teacher: true }, error => setActionError(error ? 'Battle connection interrupted. Check your internet and ask the project owner if it continues.' : ''))
    send.current = roomCh.send
    const groupChs = latest.current!.members.map((_, g) => channel<GroupMsg>(`ig-${code}-${g}`, (m) => {
      // Keep players who joined and left between React renders in the archive roster.
      if (latest.current?.state !== 'done' && isGroupMsg(m) && m.t === 'join' && archiveMeta.current) {
        archiveMeta.current.roster[g] = [...new Set([...archiveMeta.current.roster[g], m.code])].sort()
      }
      setH((cur) => cur && apply(cur, g, m))
    }))
    // Repeat the room: right away when it changed, every 4 s anyway for phones that just joined.
    let sent = ''
    let at = 0
    const t = setInterval(() => {
      setNow(Date.now())
      const cur = latest.current
      if (!cur) return
      if (roundFinished(cur)) {
        if (finalizing.current) return
        finalizing.current = true
        const next = { ...cur, state: 'done' as const }
        void (async () => {
          try {
            const result = await send.current(roomOf(next))
            if (result && result !== 'ok') throw new Error('Couldn’t notify the class. Try again.')
            if (latest.current?.state !== 'done') {
              saveArchive(next, Date.now() - cur.startedAt! >= cur.seconds * 1000 ? 'time_up' : 'completed')
              latest.current = next
              setH(next)
            }
          } catch { setActionError('Final results are waiting to reach the class. Check your connection.') }
          finally { finalizing.current = false }
        })()
        return
      }
      const r = roomOf(cur)
      const json = JSON.stringify({ ...r, sentAt: 0 })
      if (json !== sent || Date.now() - at > 4000) {
        send.current(r)
        sent = json
        at = Date.now()
      }
    }, 500)
    return () => {
      clearInterval(t)
      roomCh.close()
      groupChs.forEach((c) => c.close())
    }
  }, [code, saveArchive])

  function create() {
    setAction(null)
    const room = String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, '0')
    const empty = <T,>(f: () => T) => Array.from({ length: groups }, f)
    const currentPuzzle = puzzleFor(puzzle)!
    const csv = currentPuzzle.csv
    archiveMeta.current = { id: uuid(), created_at: new Date().toISOString(), puzzle_version: currentPuzzle.version, roster: empty(() => []), saved: false }
    setH({ instance: uuid(), room, puzzle, csv, total: totalOf(csv), seconds: minutes * 60, state: 'lobby', startedAt: null, members: empty(() => []), cells: empty(() => []), wrongs: empty(() => ({})), done: empty(() => null) })
  }

  if (!h)
    return (
      <section className="card no-print battle-host">
        <h2>
          <Deco>⚔️</Deco> Battle
        </h2>
        <p className="teacher-battle-help">Set up the round, then share its code with your class.</p>
        <div className="teacher-battle-setup">
          <label className="inline">
            Puzzle
            <select value={puzzle} onChange={(e) => setPuzzle(e.target.value)}>
              {BATTLES.filter((b) => puzzleFor(b.id)).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                  {puzzleFor(b.id)!.sample ? ' (sample)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            Groups
            <input type="number" min={2} max={8} value={groupsText} onChange={(e) => setGroupsText(e.target.value)} onBlur={() => setGroupsText(String(groups))} />
          </label>
          <label className="inline">
            Minutes
            <input type="number" min={1} max={60} value={minutesText} onChange={(e) => setMinutesText(e.target.value)} onBlur={() => setMinutesText(String(minutes))} />
          </label>
          <button className="big" onClick={create}>
            New battle
          </button>
        </div>
      </section>
    )

  const left = h.startedAt ? Math.max(0, h.seconds - Math.floor((now - h.startedAt) / 1000)) : h.seconds
  async function go(state: Room['state']) {
    // A cancelled lobby still needs a timestamp so waiting clients accept its done message.
    const startedAt = state === 'live' ? Date.now() : h!.startedAt ?? Date.now()
    const next = { ...h!, state, startedAt }
    const previous = latest.current
    latest.current = next
    try {
      const result = await send.current(roomOf(next))
      if (result && result !== 'ok') throw new Error('Couldn’t start the Battle. Try again.')
      setH(next)
    } catch (error) { latest.current = previous; throw error }
  }
  return (
    <section className="card no-print battle-host">
      <h2>
        <Deco>⚔️</Deco> {BATTLES.find((b) => b.id === h.puzzle)?.title} · room code
      </h2>
      {actionError && <p className="error" role="alert">{actionError}</p>}
      <div className="teacher-room-banner"><span>SHARE THIS ROOM CODE</span><p className="room-code">{h.room}</p><small>{h.members.length} groups · {Math.round(h.seconds / 60)} {h.seconds === 60 ? 'minute' : 'minutes'}</small></div>
      {h.state === 'lobby' ? (
        <>
          <p>
            Students: <b>Battle Mode</b> → type <b>{h.room}</b> → pick a group. Keep this page open during the battle.
          </p>
          <ol className="groups">
            {h.members.map((m, g) => (
              <li key={g}>
                <b>Group {g + 1}</b> ({m.length}): {m.join(', ') || 'no one yet'}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <p className="host-clock" role="status">
            {h.state === 'live' ? `${clock(left)} left` : 'Battle over: final ranking'}
          </p>
          <Bars bars={barsOf(h)} total={h.total} members={h.members} names final={h.state === 'done'} />
        </>
      )}
      <div className="row wrap">
        {h.state === 'lobby' && (
          <button className="big" onClick={() => { setActionError(''); setAction('start') }}>
            Start battle
          </button>
        )}
        {h.state === 'live' && (
          <button className="big secondary" onClick={() => { setActionError(''); setAction('end') }}>
            End now
          </button>
        )}
        {h.state !== 'live' && (
          <button
            className="big secondary"
            onClick={() => {
              if (h.state === 'lobby') { setActionError(''); setAction('cancel'); return }
              setAction(null)
              setH(null)
            }}
          >
            {h.state === 'lobby' ? 'Cancel' : 'New battle'}
          </button>
        )}
      </div>
      {h.state === 'done' && onShowHistory && <button className="big secondary" onClick={onShowHistory}>View in Battle History</button>}
      {action && (action === 'end' ? h.state === 'live' : h.state === 'lobby') && <ConfirmDialog
        title={action === 'start' ? `Start room ${h.room}?` : action === 'cancel' ? `Cancel room ${h.room}?` : `End room ${h.room} now?`}
        confirmLabel={action === 'start' ? 'Start battle' : action === 'cancel' ? 'Cancel battle' : 'End battle'}
        cancelLabel={action === 'start' ? 'Keep waiting' : action === 'cancel' ? 'Keep room open' : 'Keep playing'} danger={action !== 'start'} onCancel={() => setAction(null)} busy={actionBusy} error={actionError}
        onConfirm={() => {
          if (actionBusy) return
          setActionBusy(true)
          setActionError('')
          void (async () => {
            try {
              if (action === 'start') await go('live')
              else { await endHostedBattle(action === 'cancel' ? 'cancelled' : 'ended'); if (action === 'cancel') setH(null) }
              setAction(null)
            } catch (e) { setActionError((e as Error).message) }
            finally { setActionBusy(false) }
          })()
        }}>
        <p>{action === 'start' ? `The ${Math.round(h.seconds / 60)}-minute timer will start for every group. Make sure the class is ready.` : action === 'cancel' ? 'Students waiting in this room will see that the battle has ended. They will need a new room code.' : 'This stops the round for every group and shows the final results. Students cannot continue this round.'}</p>
      </ConfirmDialog>}
    </section>
  )
}
