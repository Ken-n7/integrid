// Makes branching crossword puzzles and saves them as puzzles/<level>.sample.csv.
// The researchers review them; renaming a file to <level>.csv (dropping ".sample") approves it
// and removes the SAMPLE tag in the app.
//   npm run generate                        every level + battle-1..3
//   npm run generate -- relax-1             one level
//   npm run generate -- relax-1 --seed 40   another layout (searches seeds 40, 41, … instead of 1, 2, …)
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { makePuzzle } from '../src/generate.ts'
import { fmt, parse } from '../src/puzzle.ts'
import { LEVELS } from '../src/rules.ts'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { seed: { type: 'string', default: '1' } } })
const firstSeed = Number(values.seed)
const targets = positionals.length ? positionals : [...LEVELS.map((l) => l.id), 'battle-1', 'battle-2', 'battle-3']

for (const id of targets) {
  const level = LEVELS.find((l) => l.id === id)
  if (!level && !/^battle-\d+$/.test(id)) {
    console.error(`✗ ${id}: unknown level`)
    process.exitCode = 1
    continue
  }
  // battle puzzles share a preset, so give each its own seed range
  const best = makePuzzle(id, firstSeed + (id.startsWith('battle-') ? Number(id.slice(7)) * 1000 : 0))
  if (!best) {
    console.error(`✗ ${id}: no good puzzle in 500 seeds; loosen the preset`)
    process.exitCode = 1
    continue
  }
  writeFileSync(`puzzles/${id}.sample.csv`, best.csv)
  console.log(`✓ ${id}  seed ${best.seed}  ${best.info}  ${Math.round(best.fill * 100)}% filled`)
  console.log(preview(best.csv))
}

function preview(csv: string) {
  return parse(csv)
    .map(
      (row) =>
        '    ' +
        row
          .map((c) => (!c ? '·' : c.t === 'eq' ? '=' : c.t === 'op' ? c.op : c.hidden ? `[${fmt(c.v)}]` : fmt(c.v)).padStart(6))
          .join(''),
    )
    .join('\n')
}
