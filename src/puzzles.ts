// Puzzle files: the researchers' relax-1.csv replaces the placeholder relax-1.sample.csv.
const files = import.meta.glob('../puzzles/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
export const puzzleFor = (id: string) => {
  const csv = files[`../puzzles/${id}.csv`] ?? files[`../puzzles/${id}.sample.csv`]
  return csv ? { csv, sample: !files[`../puzzles/${id}.csv`] } : null
}
