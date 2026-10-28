import assert from 'node:assert/strict'
import { BattleRelay } from '../src/battleRelay.ts'
const instance = '11111111-1111-4111-8111-111111111111'
const snapshot = { instance, revision: 1, puzzle: 'battle-1', csv: '?1,+,2,=,3', seconds: 60, state: 'lobby', startedAt: null, sentAt: Date.now(), members: [['S01'], []], bars: [{ cells: [], wrong: 0, done: null }, { cells: [], wrong: 0, done: null }] }
const calls: { name: string; args: Record<string, unknown> }[] = []
let errorOnce = true
const events = [{ seq: 1, group: 0, message: { t: 'join', code: 'S01' } }]
const client = { rpc: async (name: string, args: Record<string, unknown>) => {
  calls.push({ name, args })
  if (name === 'integrid_battle_event') {
    if (errorOnce) { errorOnce = false; return { data: null, error: new Error('lost acknowledgement') } }
    return { data: { ok: true }, error: null }
  }
  return { data: { snapshot, events }, error: null }
} }
const received: unknown[] = [], errors: unknown[] = []
const relay = new BattleRelay(client, '1234', { code: 'S01', pin: '1234' }, e => errors.push(e), false)
relay.subscribe(0, value => received.push(value), () => {})
await relay.poll()
await new Promise(resolve => setTimeout(resolve, 0))
await relay.event(0, { t: 'join', code: 'S01' })
const writes = calls.filter(c => c.name === 'integrid_battle_event')
assert.equal(writes.length, 2)
assert.equal(writes[0].args.p_id, writes[1].args.p_id)
assert.ok(writes.every(c => c.args.p_code === 'S01' && c.args.p_pin === '1234' && c.args.p_instance === instance))
await relay.poll(); await relay.poll()
assert.equal(received.length, 1, 'repeated polls do not reapply an event')
await assert.rejects(relay.publish(snapshot as never), /Only the teacher/)
relay.close()
assert.equal(errors.length, 1, 'a dropped acknowledgement reports pending work')
errors.length = 0
const denied = new BattleRelay({ rpc: async () => ({ data: null, error: { code: '42501' } }) }, '1234', { code: 'S01', pin: 'bad' }, e => errors.push(e), false)
await denied.poll();assert.equal(errors.length, 1);denied.close()
const teacher = new BattleRelay(client, '1234', { teacher: true }, e => errors.push(e), false)
await assert.rejects(teacher.event(0, { t: 'join', code: 'S01' }), /impersonate/)
teacher.close()
console.log('✓ Battle relay credentials, immutable retry IDs, event replay protection and role separation')
