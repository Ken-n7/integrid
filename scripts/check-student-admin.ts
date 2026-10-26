import assert from 'node:assert/strict'
import { deleteStudent } from '../src/studentAdmin.ts'

type Client = Parameters<typeof deleteStudent>[0]
function mock(result: { data: { code: string }[] | null; error: { code?: string; message: string } | null }) {
  const calls: unknown[] = []
  const client = { from(table: string) {
    calls.push(['from', table])
    return { delete() { calls.push(['delete']); return { eq(field: string, value: string) {
      calls.push(['eq', field, value]); return { select(fields: string) { calls.push(['select', fields]); return Promise.resolve(result) } }
    } } } }
  } } as unknown as Client
  return { client, calls }
}
const ok = mock({ data: [{ code: 'S03' }], error: null })
await deleteStudent(ok.client, 'S03')
assert.deepEqual(ok.calls, [['from', 'students'], ['delete'], ['eq', 'code', 'S03'], ['select', 'code']])
const invalid = mock({ data: [], error: null })
await assert.rejects(deleteStudent(invalid.client, 'S03,or(code.neq.S03)'), /Invalid student code/)
assert.deepEqual(invalid.calls, [])
for (const data of [null, [], [{ code: 'S04' }], [{ code: 'S03' }, { code: 'S04' }]]) {
  await assert.rejects(deleteStudent(mock({ data, error: null }).client, 'S03'), /No student was deleted/)
}
await assert.rejects(deleteStudent(mock({ data: null, error: { code: '42501', message: 'permission denied' } }).client, 'S03'), /not enabled for this teacher account/)
await assert.rejects(deleteStudent(mock({ data: null, error: { message: 'Network unavailable' } }).client, 'S03'), /Network unavailable/)
console.log('✓ Student deletion: exact-code filter, permission failures and zero-row protection')
