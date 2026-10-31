import { PRE_ASSESSMENT } from './content.ts'

// A five-question practice check, kept separate from the paper research instrument.
export const PRACTICE_VERSION = 'integer-rules-v2'
export type PracticeResult = {
  id: string; version: string; answers: number[]; correct: boolean[]; score: number; total: number
  started_at: string; submitted_at: string; synced?: boolean
}
const validAnswers = (answers: unknown): answers is number[] => Array.isArray(answers) && answers.length === PRE_ASSESSMENT.length && answers.every((answer, i) => Number.isInteger(answer) && answer >= 0 && answer < PRE_ASSESSMENT[i].choices.length)
export function makePracticeResult(id: string, answers: number[], started_at: string, submitted_at: string): PracticeResult {
  if (!validAnswers(answers) || !Number.isFinite(Date.parse(started_at)) || !Number.isFinite(Date.parse(submitted_at)) || Date.parse(submitted_at) < Date.parse(started_at)) throw new Error('Invalid practice submission.')
  const correct = answers.map((answer, i) => answer === PRE_ASSESSMENT[i].answer)
  return { id, version: PRACTICE_VERSION, answers: [...answers], correct, score: correct.filter(Boolean).length, total: answers.length, started_at, submitted_at }
}
export function readPracticeResult(value: unknown): PracticeResult | null {
  if (!value || typeof value !== 'object') return null
  const r = value as PracticeResult
  if (typeof r.id !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(r.id) || typeof r.version !== 'string' || !r.version.length || r.version.length > 40 || !validAnswers(r.answers)) return null
  if (!Array.isArray(r.correct) || r.correct.length !== r.answers.length || !r.correct.every(v => typeof v === 'boolean') || r.total !== r.answers.length || r.score !== r.correct.filter(Boolean).length) return null
  if (typeof r.started_at !== 'string' || typeof r.submitted_at !== 'string' || !Number.isFinite(Date.parse(r.started_at)) || !Number.isFinite(Date.parse(r.submitted_at)) || Date.parse(r.submitted_at) < Date.parse(r.started_at)) return null
  if (r.version === PRACTICE_VERSION && r.correct.some((v, i) => v !== (r.answers[i] === PRE_ASSESSMENT[i].answer))) return null
  return { id: r.id, version: r.version, answers: [...r.answers], correct: [...r.correct], score: r.score, total: r.total, started_at: r.started_at, submitted_at: r.submitted_at, synced: r.synced === true }
}
export function mergePractice(local: PracticeResult[], server: PracticeResult[]) {
  const byId = new Map(local.map(result => [result.id, result]))
  for (const result of server) byId.set(result.id, { ...result, synced: true })
  return [...byId.values()].sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at) || a.id.localeCompare(b.id))
}
type PracticeClient = { rpc: (name: string, args: { p_code: string; p_pin: string; p_results: PracticeResult[] }) => PromiseLike<{ data: unknown; error: unknown }> }
export async function syncPractice(save: { code: string; pin: string; practice?: PracticeResult[] }, client: PracticeClient): Promise<PracticeResult[] | 'bad-login'> {
  const pending = (save.practice ?? []).filter(result => !result.synced)
  let latest: PracticeResult[] = []
  for (let from = 0; from < Math.max(1, pending.length); from += 100) {
    const batch = pending.slice(from, from + 100)
    const { data, error } = await client.rpc('integrid_practice_sync', { p_code: save.code, p_pin: save.pin, p_results: batch })
    if (error) throw error
    if (data === null) return 'bad-login'
    if (!Array.isArray(data)) throw new Error('Practice results were not confirmed saved.')
    latest = data.map(readPracticeResult).filter((result): result is PracticeResult => result !== null)
    if (latest.length !== data.length || batch.some(result => !latest.some(saved => saved.id === result.id))) throw new Error('Practice results were not confirmed saved.')
  }
  return latest
}
