// Regression checks for device recovery, offline upload batches and Battle message ordering.
import assert from 'node:assert/strict'
import { apply, isGroupMsg, isRoom, roundFinished, standings, sum, type Host } from '../src/battleState.ts'
import { calc, parse, readEquation } from '../src/puzzle.ts'
import { merge, newSave, readStore, sync, type Save } from '../src/store.ts'
import type { Attempt } from '../src/rules.ts'

const result: Attempt = { id: 'saved', level: 'relax-1', result: 'quit', seconds: 4, wrong: 0, hints: 1, coins: -60, mistakes: [], at: '2026-10-22T00:00:00Z' }
const save: Save = { code: 'S01', pin: '1234', preDone: true, attempts: [result], current: result }
for (const raw of ['null', '[]', '{}', '{broken', '{"saves":null}', '{"saves":[],"who":"S01"}']) {
  assert.deepEqual(readStore(raw), { who: null, saves: {} })
}
const restored = readStore(JSON.stringify({ who: 'S01', saves: { S01: { ...save, attempts: [result, null, { ...result, coins: '60' }] }, S02: null } }))
assert.equal(restored.who, 'S01')
assert.deepEqual(restored.saves.S01.attempts, [result]) // current isn't charged a second time
assert.equal(restored.saves.S01.current, null)
assert.equal(restored.saves.S02, undefined)
const interrupted = readStore(JSON.stringify({ who: 'S01', saves: { S01: { ...save, attempts: [] } } }))
assert.deepEqual(interrupted.saves.S01.attempts, [result]) // interrupted hints are still charged
assert.equal(merge(newSave('S01', '1234'), [result]).preDone, true) // played on another phone: no pre-assessment again
assert.equal(merge(newSave('S01', '1234'), []).preDone, false)

assert.throws(() => parse('?9007199254740993,+,0,=,9007199254740992'), /too large/)
assert.match(String(calc([Number.MAX_SAFE_INTEGER, 2], ['×'])), /too large/)
assert.match(String(calc([Number.MAX_SAFE_INTEGER, 1], ['+'])), /too large/)
assert.match(String(readEquation('999999999999999999999 x 2')), /too large/)

const pending = Array.from({ length: 1001 }, (_, i) => ({ ...result, id: `attempt-${i}` }))
const sent = new Map<string, Attempt>()
const batches: number[] = []
const client = { async rpc(_name: string, args: { p_attempts: Attempt[] }) {
  batches.push(args.p_attempts.length)
  assert.ok(args.p_attempts.length <= 500)
  for (const a of args.p_attempts) sent.set(a.id, a)
  return { data: { attempts: [...sent.values()], ranking: [] }, error: null }
} }
const uploaded = await sync({ ...save, attempts: pending, current: null }, client)
assert.deepEqual(batches, [500, 500, 1])
assert.notEqual(uploaded, 'bad-login')
if (uploaded !== 'bad-login') assert.equal(uploaded.attempts.length, 1001)
assert.ok(pending.every((a) => !a.synced)) // uploading never mutates the local snapshot
await sync({ ...save, attempts: [] }, client)
assert.equal(batches.at(-1), 0) // sign-in and refresh still fetch with no uploads
assert.equal(await sync(save, { async rpc() { return { data: null, error: null } } }), 'bad-login')
await assert.rejects(sync(save, { async rpc() { return { data: null, error: new Error('offline') } } }), /offline/)
const partial = new Map<string, Attempt>()
let calls = 0
let failSecond = true
const retryClient = { async rpc(_name: string, args: { p_attempts: Attempt[] }) {
  if (++calls === 2 && failSecond) return { data: null, error: new Error('connection dropped') }
  for (const a of args.p_attempts) partial.set(a.id, a)
  return { data: { attempts: [...partial.values()], ranking: [] }, error: null }
} }
await assert.rejects(sync({ ...save, attempts: pending }, retryClient), /connection dropped/)
assert.equal(partial.size, 500)
failSecond = false
const retried = await sync({ ...save, attempts: pending }, retryClient)
if (retried === 'bad-login') assert.fail('retry rejected valid credentials')
assert.equal(retried.attempts.length, 1001)
assert.equal(partial.size, 1001) // retries keep every result, without duplicating the first batch

const host: Host = { room: '1234', puzzle: 'battle-1', csv: '?1,+,2,=,3', seconds: 60, state: 'live', startedAt: Date.now(), members: [[], ['S01']], cells: [[], []], wrongs: [{}, {}], done: [null, null], total: 1 }
assert.deepEqual(apply(host, 0, { t: 'leave', code: 'S01' }).members, host.members)
assert.deepEqual(apply(host, 0, { t: 'join', code: 'S01' }).members, [['S01'], []])
assert.equal(apply(host, 1, { t: 'cell', k: '999,999', hint: false }), host)
assert.equal(apply(host, 1, { t: 'cell', k: '0,2', hint: false }), host) // a given isn't an answer box
assert.equal(apply(host, 1, { t: 'wrong', code: 'S02', wrong: 1 }), host)
for (const message of [null, {}, { t: 'wrong', code: 'S01', wrong: -1 }, { t: 'wrong', code: 'S01', wrong: '5' }, { t: 'cell', k: '0,0', hint: 'yes' }]) assert.equal(isGroupMsg(message), false)
const wrong = apply(host, 1, { t: 'wrong', code: 'S01', wrong: 1 })
assert.deepEqual(apply(wrong, 1, { t: 'wrong', code: 'S01', wrong: 1 }).wrongs, wrong.wrongs)
const runOne = apply(host, 1, { t: 'wrong', code: 'S01', wrong: 1, run: '11111111-1111-4111-8111-111111111111' })
const rejoined = apply(runOne, 1, { t: 'wrong', code: 'S01', wrong: 1, run: '22222222-2222-4222-8222-222222222222' })
assert.equal(sum(rejoined.wrongs[1]), 2) // leaving and rejoining doesn't give free mistakes
const solved = apply(host, 1, { t: 'cell', k: '0,0', hint: false })
assert.deepEqual(solved.cells, [[], ['0,0']])
assert.equal(apply(solved, 1, { t: 'cell', k: '0,0', hint: false }), solved)
assert.equal(roundFinished(solved), true) // unused groups don't block the end
assert.equal(roundFinished({ ...host, wrongs: [{}, { S01: 5 }] }), true)
assert.equal(roundFinished(host), false)
assert.equal(roundFinished({ ...host, members: [[], []] }), false)
assert.equal(roundFinished(host, host.startedAt! + 60_000), true)
assert.equal(apply({ ...solved, state: 'done' }, 1, { t: 'wrong', code: 'S01', wrong: 5 }).wrongs[1].S01, undefined)
const bars = solved.cells.map((cells, g) => ({ cells, wrong: 0, done: solved.done[g] }))
assert.equal(standings(bars, solved.members)[0].g, 1)
const room = { ...host, bars, sentAt: Date.now() }
assert.equal(isRoom(room), true)
assert.equal(isRoom({ ...room, csv: 'broken' }), false)
assert.equal(isRoom({ ...room, bars: [{ cells: ['999,999'], wrong: 0, done: null }, bars[1]] }), false)
assert.equal(isRoom(null), false)
console.log('✓ Save recovery, batched sync, exact maths and Battle regressions')
