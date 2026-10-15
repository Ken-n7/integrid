// Makes branching crossword puzzles and saves them as puzzles/<level>.sample.csv.
// The researchers review them; renaming a file to <level>.csv (dropping ".sample") approves it
// and removes the SAMPLE tag in the app.
//   npm run generate                        every level + battle-1..3
//   npm run generate -- relax-1             one level
//   npm run generate -- relax-1 --seed 40   another layout (searches seeds 40, 41, … instead of 1, 2, …)
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { generate, rng, toCsv, type GenOptions } from '../src/generate.ts'
import { equations, fmt, parse, validate, type Grid } from '../src/puzzle.ts'
import { ALL_OPS, LEVELS } from '../src/rules.ts'

type Preset = Omit<GenOptions, 'ops'>
const relax: Preset = { width: 7, height: 11, equations: 7, steps: [1], max: 20, factor: 10, hide: 0.45, perEquation: 2 }
const expert: Preset = { width: 9, height: 11, equations: 11, steps: [1], max: 50, factor: 12, hide: 0.5, perEquation: 2 }
const PRESETS: Record<string, Preset> = {
  'relax-1': relax,
  'relax-2': relax,
  'relax-3': { ...relax, max: 100 },
  'relax-4': { ...relax, max: 100 },
  'expert-1': expert,
  'expert-2': { ...expert, max: 144 },
  'expert-3': { ...expert, max: 100, factor: 10 },
  'expert-4': { ...expert, steps: [2], equations: 8, max: 100, factor: 10 }, // multi-step: a + b × c = d
  'expert-5': { ...expert, steps: [1, 2], equations: 12, max: 100, factor: 10, hide: 0.55 },
  battle: { ...expert, max: 100, factor: 10 },
}

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
  const preset = PRESETS[id] ?? PRESETS.battle
  const opts = { ...preset, ops: level?.ops ?? ALL_OPS }
  // battle puzzles share a preset, so give each its own seed range
  const base = firstSeed + (id.startsWith('battle-') ? Number(id.slice(7)) * 1000 : 0)
  // Of the first 30 seeds that work, keep the most open layout (fewest filled squares for its
  // size): that's the branching worksheet look rather than a packed block.
  let best: { seed: number; csv: string; fill: number; info: string } | null = null
  for (let seed = base, found = 0; seed < base + 500 && found < 30; seed++) {
    const p = generate(opts, rng(seed))
    if (!p || p.equations < preset.equations - 1) continue
    const csv = toCsv(p.grid)
    if (validate(parse(csv), { ops: opts.ops, oneOp: level?.mode === 'relax' }).length) continue
    if (!teachesSigns(p.grid, level?.mode === 'relax')) continue
    found++
    const fill = p.grid.flat().filter(Boolean).length / (p.grid.length * p.grid[0].length)
    if (!best || fill < best.fill)
      best = { seed, csv, fill, info: `${p.grid[0].length}×${p.grid.length}  ${p.equations} equations  ${p.blanks} blanks` }
  }
  if (!best) {
    console.error(`✗ ${id}: no good puzzle in 500 seeds; loosen the preset`)
    process.exitCode = 1
    continue
  }
  writeFileSync(`puzzles/${id}.sample.csv`, best.csv)
  console.log(`✓ ${id}  seed ${best.seed}  ${best.info}  ${Math.round(best.fill * 100)}% filled`)
  console.log(preview(best.csv))
}

// The lesson is sign rules: at least a third of the numbers negative, and in Relax every
// sign pair (+)(+) (+)(−) (−)(+) (−)(−) appears at least once.
function teachesSigns(grid: Grid, relax: boolean) {
  const nums = grid.flat().flatMap((c) => (c?.t === 'num' ? [c.v] : []))
  if (nums.filter((v) => v < 0).length < nums.length / 3) return false
  if (!relax) return true
  const pairs = equations(grid).eqs.map((e) =>
    (e.left.ops.length ? e.left : e.right).nums.map(([r, c]) => ((grid[r][c] as { v: number }).v > 0 ? '+' : '−')).join(''),
  )
  return new Set(pairs).size === 4
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
