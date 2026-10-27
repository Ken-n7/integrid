import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { makePracticeResult, readPracticeResult, mergePractice, syncPractice, type PracticeResult } from '../src/practice.ts'
import { merge, newSave, persist, readStore } from '../src/store.ts'
const start = '2026-10-27T01:00:00Z', end = '2026-10-27T01:01:00Z'
const result = makePracticeResult(randomUUID(), [1, 2, 1, 1, 0], start, end)
assert.equal(result.score, 5)
assert.equal(makePracticeResult(randomUUID(), [0, 0, 0, 0, 1], start, end).score, 0)
assert.throws(() => makePracticeResult(randomUUID(), [1], start, end))
assert.throws(() => makePracticeResult(randomUUID(), [1, 2, 1, 1, 0], end, start))
assert.equal(readPracticeResult({ ...result, score: 4 }), null)
assert.equal(readPracticeResult({ ...result, correct: [false, true, true, true, true], score: 4 }), null)
assert.equal(readPracticeResult({ ...result, id: 'bad' }), null)
assert.equal(mergePractice([result], [result]).length, 1)
assert.equal(mergePractice([result], [result])[0].synced, true)
const save = newSave('TEST', '1234')
const restored = merge(save, [], [result])
assert.equal(restored.preDone, true)
assert.equal(restored.introDone, true)
assert.equal(restored.practice?.length, 1)
let stored = ''
Object.assign(globalThis, { localStorage: { getItem: () => stored, setItem: (_: string, v: string) => { stored = v } } })
assert.equal(persist({ who: 'TEST', saves: { TEST: { ...save, practice: [result] } } }), true)
assert.equal(readStore(stored).saves.TEST.practice?.[0].score, 5)
stored = JSON.stringify({ who: 'TEST', saves: { TEST: { ...save, practice: [{ ...result, answers: [] }, result] } } })
assert.equal(readStore(stored).saves.TEST.practice?.length, 1)
assert.equal(readStore(stored).saves.TEST.preDone, true)
const pending = Array.from({ length: 201 }, () => ({ ...result, id: randomUUID() }))
const server = new Map<string, PracticeResult>(); const batches: number[] = []
const client = { rpc: async (_name: string, args: { p_results: PracticeResult[] }) => {
  batches.push(args.p_results.length)
  for (const r of args.p_results) server.set(r.id, r)
  return { data: [...server.values()], error: null }
} }
await syncPractice({ ...save, practice: pending }, client)
await syncPractice({ ...save, practice: pending }, client)
assert.equal(server.size, 201)
assert.deepEqual(batches, [100, 100, 1, 100, 100, 1])
assert.equal(await syncPractice(save, { rpc: async () => ({ data: null, error: null }) }), 'bad-login')
await assert.rejects(syncPractice({ ...save, practice: [result] }, { rpc: async () => ({ data: [], error: null }) }))
await assert.rejects(syncPractice(save, { rpc: async () => ({ data: null, error: new Error('offline') }) }))
console.log('✓ Practice scoring, validation, recovery, separate storage, batching and idempotent acknowledgements')
