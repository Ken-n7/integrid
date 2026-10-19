// Checks every puzzle in puzzles/ and the game rules. Runs before every build.
//   npm run check
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { bankOf, countSolutions, equations, parse, validate } from '../src/puzzle.ts'
import { ALL_OPS, LEVELS, rankingFor, reward } from '../src/rules.ts'
import { cronbach, likert, mastery, pairedT, shapiroWilk, wilcoxon } from '../src/stats.ts'

// The checker itself: a wrong equation, a multi-step one, inexact division and a two-answer puzzle must all be caught.
const errs = (csv: string) => validate(parse(csv), { ops: ALL_OPS })
assert.deepEqual(errs('?2,x,4,=,8'), [])
assert.match(errs('?2,+,3,x,4,=,14')[0], /two numbers and one operation/)
assert.match(errs('?2,+,3,=,6')[0], /is not true/)
assert.match(errs('?7,/,2,=,3')[0], /not a whole number/)
assert.match(errs('?2,+,?3,=,5')[0], /more than one way/) // 2+3 or 3+2
assert.match(errs('?5,5,=,5')[0], /expected an operator/)
assert.throws(() => parse('?5,abc'), /row 1, column 2/)
assert.deepEqual(errs('?2,(+),3,(=),5'), []) // symbols typed in brackets, as in Google Sheets
assert.deepEqual(errs('-12,+,?-7,=,-19,+,?14,=,-5'), []) // a chain: -12 + (-7) = -19, then -19 + 14 = -5
assert.match(errs('-12,+,?-7,=,-19,+,14,=,-6')[0], /is not true/) // each link of a chain is checked
assert.match(errs('?2,+,3,=,5,=,5')[0], /exactly one =/) // not a chain: N op N = N = N
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
      problems = validate(parse(readFileSync(`puzzles/${file}`, 'utf8')), { ops: level?.ops ?? ALL_OPS })
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

// Research-tab statistics against scipy 1.11 (reference values computed with scipy.stats).
const close = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`)
let sw = shapiroWilk([4, 7, 9, 2, 11, 8, 6, 13, 5, 8.5])!
close(sw.w, 0.9935106039, 1e-6)
close(sw.p, 0.999428988, 1e-5)
sw = shapiroWilk([0.351, 4.322, 1.032, 0.127, 2.877, 0.511, 6.045, 0.231, 1.478, 0.042, 3.316, 0.867])!
close(sw.w, 0.8389378786, 1e-6)
close(sw.p, 0.0268768948, 1e-5)
const t = pairedT([10, 12, 9, 14, 11, 8, 13, 10], [11, 11, 12, 13, 15, 9, 12, 14])!
close(t.t, 1.6161498379, 1e-9)
close(t.p, 0.1500956805, 1e-8)
let w = wilcoxon([3, 5, 4, 6, 2, 7, 5, 8, 4, 6], [5.1, 12.3, 4.5, 10.2, 9.4, 8.9, 11.6, 17.8, 7.7, 9.0])! // no ties: exact
assert.ok(w.exact)
close(w.p, 0.001953125, 1e-12)
w = wilcoxon([10, 12, 9, 14, 11, 8, 13, 10], [11.5, 10.2, 12.7, 13.1, 15.4, 9.9, 12.6, 14.8])!
assert.equal(w.stat, 7)
close(w.p, 0.1484375, 1e-12)
w = wilcoxon([10, 12, 9, 14, 11, 8, 13, 10], [11, 11, 12, 13, 15, 9, 12, 14])! // ties: normal approximation
assert.ok(!w.exact)
close(w.p, 0.1956677, 1e-6)
close(cronbach([[4, 3, 4], [2, 2, 3], [3, 3, 3], [1, 2, 1], [4, 4, 3]])!, 0.8863636364, 1e-9) // numpy
// The paper's scales
assert.equal(mastery(100), 'Mastered')
assert.equal(mastery(95), 'Closely Approximating Mastery')
assert.equal(mastery(65), 'Average Mastery')
assert.equal(mastery(4), 'Absolutely No Mastery')
assert.equal(likert(1.44), 'Strongly Disagree')
assert.equal(likert(2.45), 'Agree') // rounds to 2.5, as in Table 1
assert.equal(likert(3.5), 'Strongly Agree')

