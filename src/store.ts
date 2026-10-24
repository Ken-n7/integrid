// Each student's save lives on the device; Supabase gets a copy whenever there's internet.
import { createClient } from '@supabase/supabase-js'
import { BATTLES, HEARTS, LEVELS, type Attempt, type Rank } from './rules.ts'

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
const url = env?.VITE_SUPABASE_URL
const anonKey = env?.VITE_SUPABASE_KEY
// No keys = dev mode: any code + PIN signs in and nothing leaves the device.
export const db = url && anonKey ? createClient(url, anonKey) : null

// A level still being played, with its boxes (cell → solved with a hint?), so closing the app
// mid-level can be continued.
export type Pending = Attempt & { filled: Record<string, boolean> }
export type Save = { code: string; pin: string; introDone: boolean; howtoDone: boolean; preDone: boolean; attempts: Attempt[]; current: Pending | null }
export type Store = { who: string | null; saves: Record<string, Save> }

const KEY = 'integrid:v1'

// crypto.randomUUID only exists on https/localhost; phones testing over LAN http need the fallback
export const uuid = () =>
  crypto.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16))

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const whole = (v: unknown): v is number => Number.isSafeInteger(v)
const attempt = (v: unknown): v is Attempt =>
  record(v) && typeof v.id === 'string' && typeof v.level === 'string' && [...LEVELS, ...BATTLES].some((l) => l.id === v.level) &&
  ['win', 'lose', 'quit'].includes(v.result as string) && whole(v.seconds) && v.seconds >= 0 && whole(v.wrong) && v.wrong >= 0 &&
  whole(v.hints) && v.hints >= 0 && whole(v.coins) && typeof v.at === 'string' && Number.isFinite(Date.parse(v.at)) &&
  Array.isArray(v.mistakes) && v.mistakes.every((m) => Array.isArray(m) && m.length === 2 && m.every(whole))
const board = (v: unknown): v is Record<string, boolean> => record(v) && Object.entries(v).every(([k, x]) => /^\d+,\d+$/.test(k) && typeof x === 'boolean')

// The level left open is given up: it counts as quit, its spent hint coins included.
export function abandon(save: Save): Save {
  if (!save.current) return save
  const { filled: _, ...quit } = save.current
  return { ...save, current: null, attempts: [...save.attempts, quit] }
}

// Recover valid learners and finished attempts independently if part of the device's cache breaks.
export function readStore(raw: string | null): Store {
  const store: Store = { who: null, saves: {} }
  try {
    const saved: unknown = raw ? JSON.parse(raw) : null
    if (!record(saved) || !record(saved.saves)) return store
    for (const [code, s] of Object.entries(saved.saves)) {
      if (!/^[A-Z0-9-]{1,12}$/.test(code) || !record(s) || s.code !== code || typeof s.pin !== 'string' || !/^\d{4}$/.test(s.pin) || !Array.isArray(s.attempts)) continue
      const attempts = s.attempts.filter(attempt)
      const c = s.current
      const filled = record(c) ? c.filled : null
      const open = attempt(c) && !attempts.some((a) => a.id === c.id) ? { ...c, filled: board(filled) ? filled : {} } : null
      // Older versions showed both guides on every Start. Existing students have already
      // been introduced; migrate them without another tour, keeping the assessment gate.
      const legacyGuides = !('introDone' in s) && !('howtoDone' in s)
      const familiar = legacyGuides || s.preDone === true || attempts.length > 0 || open !== null
      const howtoDone = s.howtoDone === true || familiar
      const save: Save = { code, pin: s.pin, introDone: s.introDone === true || howtoDone, howtoDone, preDone: s.preDone === true, attempts, current: open }
      // A Relax or Expert level open when the app closed waits to be continued. Anything else
      // (a battle, an older save without its boxes) counts as quit, spent hint coins included.
      const resumable = open && board(filled) && LEVELS.some((l) => l.id === open.level) && open.wrong < HEARTS
      store.saves[code] = resumable ? save : abandon(save)
    }
    if (typeof saved.who === 'string' && Object.hasOwn(store.saves, saved.who)) store.who = saved.who
  } catch {
    // Unreadable JSON starts at sign-in; it never traps the app on a crashing reload screen.
  }
  return store
}

export function load(): Store {
  try {
    return readStore(localStorage.getItem(KEY))
  } catch {
    return { who: null, saves: {} } // storage disabled on this device
  }
}

export function persist(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // full or blocked: keep playing, the server copy still syncs
  }
}

export const newSave = (code: string, pin: string): Save => ({ code, pin, introDone: false, howtoDone: false, preDone: false, attempts: [], current: null })

// Resume only the unfinished introduction/assessment; completed guides live in Settings.
export const startScreen = (save: Save) => !save.introDone ? 'intro' : !save.howtoDone ? 'howto' : !save.preDone ? 'pre' : 'modes'

export function merge(save: Save, server: Attempt[]): Save {
  const byId = new Map(save.attempts.map((a) => [a.id, a]))
  for (const a of server) byId.set(a.id, { ...a, synced: true })
  // preDone only lives on the device; any played level on the server means the pre-assessment
  // was finished (it gates Level 1), so a new phone or cleared browser doesn't ask again.
  const familiar = save.preDone || save.attempts.length > 0 || save.current !== null || server.length > 0
  return { ...save, introDone: save.introDone || save.howtoDone || familiar, howtoDone: save.howtoDone || familiar, preDone: save.preDone || server.length > 0, attempts: [...byId.values()] }
}

// Sends unsent attempts; gets back the student's whole history (other devices too) and
// everyone's best Expert times. 'bad-login' = code/PIN not on the server. Throws when offline.
type SyncResult = { attempts: Attempt[]; ranking: Rank[] }
type SyncClient = { rpc: (name: string, args: { p_code: string; p_pin: string; p_attempts: Attempt[] }) => PromiseLike<{ data: SyncResult | null; error: unknown }> }
export async function sync(save: Save, client: SyncClient | null = db): Promise<SyncResult | 'bad-login'> {
  if (!client) return { attempts: [], ranking: [] }
  const pending = save.attempts.filter((a) => !a.synced)
  let latest: SyncResult = { attempts: [], ranking: [] }
  // The RPC accepts at most 500 attempts. Retrying a partly sent batch is safe: IDs are unique.
  for (let from = 0; from < Math.max(1, pending.length); from += 500) {
    const { data, error } = await client.rpc('integrid_sync', { p_code: save.code, p_pin: save.pin, p_attempts: pending.slice(from, from + 500) })
    if (error) throw error
    if (!data) return 'bad-login'
    latest = data
  }
  return latest
}
