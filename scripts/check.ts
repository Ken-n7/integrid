// Checks every puzzle in puzzles/ and the game rules. Runs before every build.
//   npm run check
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { bankOf, countSolutions, equations, parse, validate } from '../src/puzzle.ts'
import { ALL_OPS, LEVELS, rankingFor, reward } from '../src/rules.ts'

// The checker itself: a wrong equation, MDAS, inexact division and a two-answer puzzle must all be caught.
const errs = (csv: string) => validate(parse(csv), { ops: ALL_OPS, oneOp: false })
assert.deepEqual(errs('?2,+,3,x,4,=,14'), [])
assert.match(errs('?2,+,3,=,6')[0], /is not true/)
assert.match(errs('?7,/,2,=,3')[0], /not a whole number/)
assert.match(errs('?2,+,?3,=,5')[0], /more than one way/) // 2+3 or 3+2
assert.match(errs('?5,5,=,5')[0], /expected an operator/)
assert.throws(() => parse('?5,abc'), /row 1, column 2/)
assert.equal(countSolutions(parse('?-3,+,5,=,?2'), equations(parse('?-3,+,5,=,?2')).eqs, [-3, 2]), 1)
assert.deepEqual(bankOf(parse('?-3,+,?5,=,2')), [-3, 5])

// Rewards from the client's table; slower never earns more.
assert.equal(reward('relax', 60), 60)
assert.equal(reward('relax', 61), 40)
assert.equal(reward('relax', 3600), 10)
assert.equal(reward('expert', 120), 120)
assert.equal(reward('expert', 3600), 60)
for (const mode of ['relax', 'expert'] as const) for (let s = 1; s < 400; s++) assert.ok(reward(mode, s) <= reward(mode, s - 1))
assert.deepEqual(
  rankingFor([{ level: 'e', code: 'A', seconds: 90, wrong: 0 }, { level: 'e', code: 'B', seconds: 80, wrong: 2 }], 'e', { level: 'e', code: 'A', seconds: 70, wrong: 1 }).map((r) => r.code),
  ['A', 'B'],
)

// The puzzles.
let bad = 0
for (const file of readdirSync('puzzles').filter((f) => f.endsWith('.csv')).sort()) {
  const id = file.replace(/(\.sample)?\.csv$/, '')
  const level = LEVELS.find((l) => l.id === id)
  let problems: string[]
  if (!level && !/^battle-\d+$/.test(id)) problems = [`unknown file name; use ${LEVELS.map((l) => l.id).join(', ')} or battle-1, battle-2, …`]
  else {
    try {
      problems = validate(parse(readFileSync(`puzzles/${file}`, 'utf8')), { ops: level?.ops ?? ALL_OPS, oneOp: level?.mode === 'relax' })
    } catch (e) {
      problems = [(e as Error).message]
    }
  }
  if (problems.length) bad++
  console.log(problems.length ? `✗ ${file}\n    ${problems.join('\n    ')}` : `✓ ${file}`)
}
if (bad) {
  console.error(`\n${bad} puzzle file(s) need fixing.`)
  process.exit(1)
}
