// Lays out the researchers' problems as a crossword: puzzles/<level>.txt → puzzles/<level>.csv.
// The .txt is their list as sent, one equation per line like "-12 + (-7) = -19" (headings are
// skipped). The equations stay exactly as written, and each one's answer is its blank; only
// where they sit is ours. A .csv is locked for the study, so an existing one is only replaced
// with --force.
//   npm run layout -- relax-1
//   npm run layout -- relax-1 --seed 40 --force   another layout
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { layoutPuzzle, preview, toCsv, type Equation } from '../src/generate.ts'
import { parse, readEquation, validate } from '../src/puzzle.ts'
import { ALL_OPS, LEVELS } from '../src/rules.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { seed: { type: 'string', default: '1' }, force: { type: 'boolean', default: false } },
})
const fail = (msg: string) => {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}

for (const id of positionals) {
  const level = LEVELS.find((l) => l.id === id)
  const ops = level?.ops ?? ALL_OPS
  if (!level && !/^battle-\d+$/.test(id)) fail(`${id}: unknown level`)
  else if (existsSync(`puzzles/${id}.csv`) && !values.force) fail(`puzzles/${id}.csv exists and is locked for the study; add --force to replace it`)
  else {
    const eqs: Equation[] = []
    const problems: string[] = []
    readFileSync(`puzzles/${id}.txt`, 'utf8')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        if (!raw.includes('=')) return // a heading
        const e = readEquation(raw)
        if (!e || typeof e === 'string') return void problems.push(`line ${i + 1}: ${e ?? `can't read "${raw.trim()}"`}`)
        if (!ops.includes(e.ops[0])) problems.push(`line ${i + 1}: uses ${e.ops[0]}, but ${id} only allows ${ops.join(' ')}`)
        eqs.push(e)
      })
    const p = !problems.length && layoutPuzzle(eqs, Number(values.seed))
    if (p) problems.push(...validate(parse(toCsv(p.grid)), { ops }))
    if (!p || problems.length) fail(`${id}: ${problems.join('\n    ') || 'no layout found'}`)
    else {
      writeFileSync(`puzzles/${id}.csv`, toCsv(p.grid))
      console.log(`✓ ${id}  ${eqs.length} problems  ${p.info}`)
      console.log(preview(toCsv(p.grid)))
    }
  }
}
