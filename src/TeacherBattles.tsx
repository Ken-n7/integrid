import { useState } from 'react'
import { BattleHost, type HostGuard } from './Battle.tsx'
import { Art } from './Art.tsx'
import { Dialog } from './ui.tsx'
import { BATTLES, clock } from './rules.ts'
import { historyCsv, OUTCOME_LABEL, type BattleRecord } from './battleHistory.ts'
import { useBattleHistory } from './useBattleHistory.ts'

const dateOf = (date: string) => new Date(date).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const joined = (r: BattleRecord) => new Set(r.groups.flatMap((g) => g.members)).size
function exportHistory(records: BattleRecord[]) {
  const url = URL.createObjectURL(new Blob([historyCsv(records)], { type: 'text/csv;charset=utf-8' }))
  Object.assign(document.createElement('a'), { href: url, download: 'battle-history.csv' }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function TeacherBattles({ teacherId, onGuardChange }: { teacherId?: string; onGuardChange: (guard: HostGuard | null) => void }) {
  const [view, setView] = useState<'host' | 'history'>('host')
  const [query, setQuery] = useState('')
  const [puzzle, setPuzzle] = useState('all')
  const [selected, setSelected] = useState<BattleRecord | null>(null)
  const history = useBattleHistory(teacherId)
  const needle = query.trim().toLowerCase()
  const records = history.records.filter((r) => (puzzle === 'all' || r.puzzle === puzzle) && (!needle || `${r.room} ${r.puzzle_title} ${dateOf(r.ended_at)} ${r.groups.flatMap((g) => g.members).join(' ')}`.toLowerCase().includes(needle)))
  return (
    <div className="teacher-battles">
      <div className="battle-view-tabs" role="tablist" aria-label="Battle workspace" onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
        e.preventDefault()
        const next = e.key === 'Home' ? 'host' : e.key === 'End' ? 'history' : view === 'host' ? 'history' : 'host'
        setView(next)
        e.currentTarget.querySelector<HTMLButtonElement>(`#battle-view-${next}`)?.focus()
      }}>
        <button id="battle-view-host" role="tab" aria-controls="battle-host-panel" aria-selected={view === 'host'} tabIndex={view === 'host' ? 0 : -1} onClick={() => setView('host')}><Art name="battle" />Host Battle</button>
        <button id="battle-view-history" role="tab" aria-controls="battle-history-panel" aria-selected={view === 'history'} tabIndex={view === 'history' ? 0 : -1} onClick={() => setView('history')}><Art name="book" />Battle History{history.records.length > 0 && <span className="battle-history-count" aria-hidden="true">{history.records.length}</span>}</button>
      </div>
      {history.storageIssue && <p className="notice" role="alert">{history.storageIssue}</p>}
      {/* Looking at history never unmounts an active classroom room. */}
      <div id="battle-host-panel" role="tabpanel" aria-labelledby="battle-view-host" hidden={view !== 'host'}>
        <BattleHost onGuardChange={onGuardChange} onArchive={history.record} onShowHistory={() => setView('history')} />
        {history.pending > 0 && !history.storageIssue && <p className="battle-history-save-note" role="status">{history.pending} round{history.pending === 1 ? '' : 's'} saved on this device, waiting to sync.</p>}
      </div>
      <section id="battle-history-panel" role="tabpanel" aria-labelledby="battle-view-history" hidden={view !== 'history'}>
        <div className="card battle-history-tools">
          <header><div><h2>Past battles</h2><p>Revisit your class rounds and group results.</p></div><Art name="trophy" /></header>
          <div className="battle-history-filters">
            <label>Find a battle<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Room, student code or date" type="search" /></label>
            <label>Puzzle<select value={puzzle} onChange={(e) => setPuzzle(e.target.value)}><option value="all">All puzzles</option>{BATTLES.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label>
          </div>
          <div className="row wrap">
            <button className="big secondary" onClick={() => exportHistory(records)} disabled={!records.length}><Art name="download" />Download CSV</button>
            {history.cloud && <button className="big secondary" onClick={() => void history.sync()} disabled={history.syncing}>{history.syncing ? 'Syncing…' : 'Refresh history'}</button>}
          </div>
          <p className="battle-history-save-note" role="status">{history.storageIssue ? 'Save pending. Please keep this page open.' : history.cloud ? history.pending ? `${history.pending} round${history.pending === 1 ? '' : 's'} waiting to sync. Your device copy is kept.` : history.syncing ? 'Checking shared history…' : 'Shared history with a saved device copy.' : 'History is saved on this preview device.'}</p>
          {history.cloudIssue && <p className="notice">{history.cloudIssue}</p>}
        </div>
        {!records.length ? <div className="card battle-history-empty"><Art name="flag" /><h3>{history.records.length ? 'No matching battles' : 'No saved battles yet'}</h3><p>{history.records.length ? 'Try a different room, student code, date or puzzle.' : 'New rounds will appear here when they finish or are cancelled. Older rounds did not save these details.'}</p>{!history.records.length && <button className="big" onClick={() => setView('host')}>Host a battle</button>}</div> : <ol className="battle-history-list" aria-label="Saved battles">
          {records.map((r) => <li key={r.id} className="card battle-history-card">
            <div className="battle-history-card-top"><time dateTime={r.ended_at}>{dateOf(r.ended_at)}</time><span className={`badge ${r.outcome === 'cancelled' ? 'warn' : 'ok'}`}>{OUTCOME_LABEL[r.outcome]}</span></div>
            <h3>{r.puzzle_title}<span>Room {r.room}</span></h3>
            <p>{r.groups.length} groups · {joined(r)} joined · {r.time_limit_seconds / 60} min limit</p>
            <div className="battle-history-card-bottom"><span>{r.outcome === 'cancelled' ? 'Round did not start' : r.groups.find((g) => g.rank === 1) ? `Top group: Group ${r.groups.find((g) => g.rank === 1)!.group} · ${clock(r.elapsed_seconds)} elapsed` : 'No group results'}</span><button className="big secondary" onClick={() => setSelected(r)} aria-label={`View results for ${r.puzzle_title}, room ${r.room}, ${dateOf(r.ended_at)}`}>View results</button></div>
          </li>)}
        </ol>}
      </section>
      {selected && <Dialog title={`${selected.puzzle_title} · Room ${selected.room}`} onClose={() => setSelected(null)} className="battle-history-detail" focusTitle>
        <p className="muted">{dateOf(selected.ended_at)} · {OUTCOME_LABEL[selected.outcome]}</p>
        <div className="battle-history-summary"><span><b>{selected.groups.length}</b>groups</span><span><b>{joined(selected)}</b>joined</span><span><b>{clock(selected.elapsed_seconds)}</b>elapsed</span></div>
        <p className="muted small">Players listed include those who joined a group and later left or switched. Results are the snapshot saved when this round ended.</p>
        <div className="table-wrap" role="region" aria-label="Final group results" tabIndex={0}><table>
          <thead><tr><th>Place</th><th>Group</th><th>Players</th><th>Boxes</th><th>Wrong</th><th>Completion</th></tr></thead>
          <tbody>{selected.groups.map((g) => <tr key={g.group}><td>{g.rank === null ? '—' : `#${g.rank}`}</td><th scope="row">Group {g.group}</th><td>{g.members.join(', ') || 'No players'}</td><td>{g.filled}/{selected.total_boxes}</td><td>{g.wrong}</td><td>{selected.outcome === 'cancelled' ? 'Not started' : g.completed_seconds === null ? 'Not completed' : clock(g.completed_seconds)}</td></tr>)}</tbody>
        </table></div>
        <div className="row"><button className="big secondary" onClick={() => exportHistory([selected])}>Download this round</button><button className="big" onClick={() => setSelected(null)}>Close results</button></div>
      </Dialog>}
    </div>
  )
}
