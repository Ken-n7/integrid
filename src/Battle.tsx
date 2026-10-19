// Battle Mode (dev plan §10). The teacher's admin page hosts a room; each group shares one grid.
// Channels (Supabase Realtime broadcast; in dev mode, tabs of one browser):
//   ig-<room>       teacher → everyone: the room (puzzle, time, groups, live bars), every 2–4 s
//   ig-<room>-<g>   one group and the teacher: joins, solved boxes, wrong answers
// One channel per group keeps each message to a handful of phones: the free plan allows about
// 100 deliveries a second, and a class is ~40 phones.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useBack } from './back.ts'
import { Game, type BattleLink } from './Game.tsx'
import { blanksOf, parse } from './puzzle.ts'
import { puzzleFor } from './puzzles.ts'
import { BATTLES, clock, HEARTS, type Attempt } from './rules.ts'
import { db, uuid } from './store.ts'
import { Deco, Icon } from './ui.tsx'

type Bar = { cells: string[]; wrong: number; done: number | null } // done = seconds when the grid was full
type Room = { puzzle: string; csv: string; seconds: number; state: 'lobby' | 'live' | 'done'; startedAt: number | null; sentAt: number; members: string[][]; bars: Bar[] }
type GroupMsg = { t: 'join'; code: string } | { t: 'leave'; code: string } | { t: 'cell'; k: string; hint: boolean } | { t: 'wrong'; code: string; wrong: number }

function channel<M>(name: string, onMsg: (m: M) => void, onReady: () => void = () => {}) {
  if (!db) {
    const bc = new BroadcastChannel(name)
    bc.onmessage = (e) => onMsg(e.data as M)
    setTimeout(onReady)
    return { send: (m: M) => bc.postMessage(m), close: () => bc.close() }
  }
  // supabase-js hands back a channel that is still closing when the name matches (React's dev mode
  // opens every screen twice; a student can re-pick the same group): let any old copy go first.
  let ch: RealtimeChannel | null = null
  let closed = false
  void (async () => {
    await Promise.resolve()
    for (const old of db.getChannels().filter((c) => c.topic === `realtime:${name}`)) await db.removeChannel(old)
    if (closed) return
    ch = db.channel(name, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload as M))
    ch.subscribe((status) => status === 'SUBSCRIBED' && onReady())
  })()
  return {
    send: (m: M) => void ch?.send({ type: 'broadcast', event: 'm', payload: m }),
    close: () => {
      closed = true
      if (ch) void db!.removeChannel(ch)
    },
  }
}

const totalOf = (csv: string) => blanksOf(parse(csv)).length
const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0)
// A member's running count of wrong answers: keep the highest, so a repeated message counts once.
const countWrong = (w: Record<string, number>, code: string, n: number) => ({ ...w, [code]: Math.max(w[code] ?? 0, n) })

// Finished groups first (by time), then most boxes solved, then fewest wrong answers (§10).
// A group no one joined comes last: with 0 wrong answers it would otherwise beat a group playing.
const standings = (bars: Bar[], members: string[][]) => {
  const empty = (g: number) => !members[g]?.length && !bars[g].cells.length && !bars[g].wrong
  return bars
    .map((b, g) => ({ ...b, g }))
    .sort((a, b) => +empty(a.g) - +empty(b.g) || (a.done ?? Infinity) - (b.done ?? Infinity) || b.cells.length - a.cells.length || a.wrong - b.wrong)
}

// The live ranking: one card per group, leader first. `top` keeps the grid screen short in a big
// class (8 groups of 5): the leaders plus your own group. `names`: the teacher's page lists members.
function Bars({ bars, total, mine, members, names = false, top = Infinity }: { bars: Bar[]; total: number; mine?: number; members: string[][]; names?: boolean; top?: number }) {
  const rows = standings(bars, members).map((b, i) => ({ ...b, place: i + 1 }))
  return (
    <ol className="bars" aria-label="Live ranking">
      {rows.filter((b) => b.place <= top || b.g === mine).map((b) => (
        <li key={b.g} className={b.g === mine ? 'mine' : undefined}>
          <span className="who-row">
            <span className="place">#{b.place}</span> <b>Group {b.g + 1}</b>
            {b.g === mine && ' (you)'}
            {names && <small> · {members[b.g]?.join(', ') || 'no one'}</small>}
          </span>
          <span className="score">
            {b.done !== null ? (
              <>
                <Deco>✓&nbsp;</Deco>
                <span className="sr">finished in&nbsp;</span>
                {clock(b.done)}
              </>
            ) : (
              `${b.cells.length} of ${total}`
            )}
            <span className="muted"> · {b.done === null && b.wrong >= HEARTS ? 'out of hearts' : `${b.wrong} wrong`}</span>
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

type Props = { code: string; coins: number; onExit: () => void; onProgress: (a: Attempt) => void; onFinish: (a: Attempt) => void }

export function BattleRoom({ code, coins, onExit, onProgress, onFinish }: Props) {
  const [typed, setTyped] = useState('')
  const [msg, setMsg] = useState('')
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

  // The teacher's page repeats the room every few seconds, so 8 s of silence means a wrong code.
  // Its clock is the one that counts: startedAt is moved onto this phone's clock.
  useEffect(() => {
    if (!room) return
    let heard = false
    const ch = channel<Room>(`ig-${room}`, (r) => {
      heard = true
      setSnap({ ...r, startedAt: r.startedAt && r.startedAt + (Date.now() - r.sentAt) })
      if (r.state === 'live' && groupNow.current !== null) setInBattle(true)
    })
    const t = setTimeout(() => {
      if (heard) return
      setMsg(`No battle with room code ${room}. Check the code on the board.`)
      setRoom(null)
    }, 8000)
    return () => {
      clearTimeout(t)
      ch.close()
    }
  }, [room])

  useEffect(() => {
    if (!room || group === null) return
    const ch = channel<GroupMsg>(
      `ig-${room}-${group}`,
      (m) => {
        if (m.t === 'cell') setShared((s) => (m.k in s ? s : { ...s, [m.k]: m.hint }))
        if (m.t === 'wrong') setWrongs((w) => countWrong(w, m.code, m.wrong))
      },
      () => ch.send({ t: 'join', code }),
    )
    send.current = ch.send
    return () => {
      ch.send({ t: 'leave', code })
      ch.close()
      send.current = () => {}
      setWrongs({})
    }
  }, [room, group, code])

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
      bars: <Bars bars={snap.bars} total={totalOf(snap.csv)} mine={group} members={snap.members} top={snap.state === 'done' ? Infinity : 3} />,
      result:
        place === 1 ? (
          <p className="result">
            <Deco>🎉</Deco> Your group won!
          </p>
        ) : (
          <p className="result">Your group placed #{place}. Great teamwork!</p>
        ),
      onSolve: (k, hint) => {
        setShared((s) => ({ ...s, [k]: hint }))
        send.current({ t: 'cell', k, hint })
      },
      onWrong: (wrong) => {
        setWrongs((w) => countWrong(w, code, wrong))
        send.current({ t: 'wrong', code, wrong })
      },
    }
    return (
      <Game
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
        onExit={onExit}
        onNext={null}
        battle={link}
      />
    )
  }

  const members = snap && group !== null ? [...new Set([...(snap.members[group] ?? []), code])].sort() : []
  return (
    <main className="screen" tabIndex={-1}>
      <header className="bar">
        <button className="icon" onClick={back} aria-label={group !== null ? 'Back to the groups' : room ? 'Leave the room' : 'Back to modes'}>
          <Icon name="back" />
        </button>
        <h1>
          <Deco>⚔️</Deco> Battle Mode
        </h1>
      </header>
      {!room ? (
        <>
          <form className="card form" onSubmit={join} noValidate>
            <label>
              Room code
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={!!msg}
                aria-describedby={msg ? 'room-error' : undefined}
              />
            </label>
            {msg && (
              <p id="room-error" className="error" role="alert">
                {msg}
              </p>
            )}
            <button className="big">Join</button>
          </form>
          <p className="sub">Your teacher shows the 4-digit room code on the board.</p>
        </>
      ) : !snap ? (
        <p className="sub" role="status">
          Looking for room {room}…
        </p>
      ) : snap.state === 'done' ? (
        <p className="sub" role="status">
          This battle has ended. Ask your teacher for the next room code.
        </p>
      ) : group === null ? (
        <>
          <p className="sub">
            Room {room} · {Math.round(snap.seconds / 60)} minutes. Pick your group:
          </p>
          {snap.members.map((m, g) => (
            <button
              key={g}
              className="level"
              onClick={() => {
                setGroup(g)
                if (snap.state === 'live') setInBattle(true) // joining a round that already started
              }}
            >
              <span className="level-n">{g + 1}</span>
              <span className="level-text">
                <b>Group {g + 1}</b>
                <small>{m.length ? m.join(', ') : 'No one yet'}</small>
              </span>
              <span className="level-state">
                <Icon name="next" />
              </span>
            </button>
          ))}
        </>
      ) : (
        <>
          <section className="card lobby">
            <h2>Group {group + 1}</h2>
            <p>{members.map((m) => (m === code ? `${m} (you)` : m)).join(', ')}</p>
            <p className="sub" role="status">
              Waiting for your teacher to start…
            </p>
          </section>
          <button className="big secondary" onClick={() => setGroup(null)}>
            Change group
          </button>
        </>
      )}
    </main>
  )
}

// ---------- teacher (admin page) ----------

type Host = Omit<Room, 'bars' | 'sentAt'> & { room: string; total: number; cells: string[][]; wrongs: Record<string, number>[]; done: (number | null)[] }

const barsOf = (h: Host): Bar[] => h.cells.map((cells, g) => ({ cells, wrong: sum(h.wrongs[g]), done: h.done[g] }))
const roomOf = (h: Host): Room => ({ puzzle: h.puzzle, csv: h.csv, seconds: h.seconds, state: h.state, startedAt: h.startedAt, sentAt: Date.now(), members: h.members, bars: barsOf(h) })

function apply(h: Host, g: number, m: GroupMsg): Host {
  if (m.t === 'join' || m.t === 'leave') {
    const members = h.members.map((list) => list.filter((c) => c !== m.code)) // one group per student
    if (m.t === 'join') members[g] = [...members[g], m.code].sort()
    return { ...h, members }
  }
  if (m.t === 'wrong') return { ...h, wrongs: h.wrongs.map((w, i) => (i === g ? countWrong(w, m.code, m.wrong) : w)) }
  if (h.state !== 'live' || h.cells[g].includes(m.k) || sum(h.wrongs[g]) >= HEARTS) return h // out of hearts: no more boxes
  const cells = h.cells.map((c, i) => (i === g ? [...c, m.k] : c))
  const done = h.done.map((d, i) => (i === g && d === null && cells[g].length >= h.total ? Math.floor((Date.now() - h.startedAt!) / 1000) : d))
  return { ...h, cells, done }
}

// A number box's text as a whole number in [lo, hi] (empty or junk: the default).
const clampOf = (text: string, lo: number, hi: number, fallback: number) => Math.max(lo, Math.min(hi, Math.round(Number(text)) || fallback))

export function BattleHost() {
  const [puzzle, setPuzzle] = useState(BATTLES[0].id)
  // kept as typed, so clearing a box to type a new number works; clamped when used
  const [groupsText, setGroupsText] = useState('2')
  const [minutesText, setMinutesText] = useState('10')
  const groups = clampOf(groupsText, 2, 8, 2)
  const minutes = clampOf(minutesText, 1, 60, 10)
  const [h, setH] = useState<Host | null>(null)
  const [now, setNow] = useState(Date.now)
  const send = useRef<(r: Room) => void>(() => {})
  const latest = useRef<Host | null>(null)
  useEffect(() => {
    latest.current = h
  })

  const code = h?.room
  useEffect(() => {
    if (!code) return
    const roomCh = channel<Room>(`ig-${code}`, () => {})
    send.current = roomCh.send
    const groupChs = latest.current!.members.map((_, g) => channel<GroupMsg>(`ig-${code}-${g}`, (m) => setH((cur) => cur && apply(cur, g, m))))
    // Repeat the room: right away when it changed, every 4 s anyway for phones that just joined.
    let sent = ''
    let at = 0
    const t = setInterval(() => {
      setNow(Date.now())
      const cur = latest.current
      if (!cur) return
      if (cur.state === 'live' && (Date.now() - cur.startedAt! >= cur.seconds * 1000 || cur.done.every((d, g) => d !== null || sum(cur.wrongs[g]) >= HEARTS))) {
        setH({ ...cur, state: 'done' }) // time's up, or every group finished or ran out of hearts
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
  }, [code])

  function create() {
    const room = String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, '0')
    const empty = <T,>(f: () => T) => Array.from({ length: groups }, f)
    const csv = puzzleFor(puzzle)!.csv
    setH({ room, puzzle, csv, total: totalOf(csv), seconds: minutes * 60, state: 'lobby', startedAt: null, members: empty(() => []), cells: empty(() => []), wrongs: empty(() => ({})), done: empty(() => null) })
  }

  if (!h)
    return (
      <section className="card no-print battle-host">
        <h2>
          <Deco>⚔️</Deco> Battle
        </h2>
        <div className="row wrap">
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
  function go(state: Room['state']) {
    const next = { ...h!, state, startedAt: state === 'live' ? Date.now() : h!.startedAt }
    setH(next)
    send.current(roomOf(next)) // start and end go out at once
  }
  return (
    <section className="card no-print battle-host">
      <h2>
        <Deco>⚔️</Deco> {BATTLES.find((b) => b.id === h.puzzle)?.title} · room code
      </h2>
      <p className="room-code">{h.room}</p>
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
          <Bars bars={barsOf(h)} total={h.total} members={h.members} names />
        </>
      )}
      <div className="row wrap">
        {h.state === 'lobby' && (
          <button className="big" onClick={() => go('live')}>
            Start battle
          </button>
        )}
        {h.state === 'live' && (
          <button className="big secondary" onClick={() => go('done')}>
            End now
          </button>
        )}
        {h.state !== 'live' && (
          <button
            className="big secondary"
            onClick={() => {
              if (h.state === 'lobby') go('done') // tell waiting phones the room closed
              setH(null)
            }}
          >
            {h.state === 'lobby' ? 'Cancel' : 'New battle'}
          </button>
        )}
      </div>
    </section>
  )
}
