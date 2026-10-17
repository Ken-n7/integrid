// Makes branching crossword puzzles and saves them as puzzles/<level>.sample.csv.
// They're placeholders: the researchers' own puzzle, puzzles/<level>.csv, replaces the sample and
// is locked for the study.
//   npm run generate                        every level + battle-1..3
//   npm run generate -- relax-1             one level
//   npm run generate -- relax-1 --seed 40   another layout (searches seeds 40, 41, … instead of 1, 2, …)
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { makePuzzle, preview } from '../src/generate.ts'
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
  // each level its own seed range: levels sharing a preset (Expert 3 and 4, the battles) still differ
  const best = makePuzzle(id, firstSeed + 1000 * (LEVELS.findIndex((l) => l.id === id) + 1 || 20 + Number(id.slice(7))))
  if (!best) {
    console.error(`✗ ${id}: no good puzzle in 500 seeds; loosen the preset`)
    process.exitCode = 1
    continue
  }
  writeFileSync(`puzzles/${id}.sample.csv`, best.csv)
  console.log(`✓ ${id}  seed ${best.seed}  ${best.info}  ${Math.round(best.fill * 100)}% filled`)
  console.log(preview(best.csv))
}
