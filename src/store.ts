// Each student's save lives on the device; Supabase gets a copy whenever there's internet.
import { createClient } from '@supabase/supabase-js'
import type { Attempt, Rank } from './rules.ts'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_KEY as string | undefined
// No keys = dev mode: any code + PIN signs in and nothing leaves the device.
export const db = url && anonKey ? createClient(url, anonKey) : null

export type Save = { code: string; pin: string; preDone: boolean; attempts: Attempt[]; current: Attempt | null }
export type Store = { who: string | null; saves: Record<string, Save> }

const KEY = 'integrid:v1'

export function load(): Store {
  let store: Store = { who: null, saves: {} }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) store = JSON.parse(raw)
  } catch {
    // blocked or corrupt storage: start fresh
  }
  // A level still open when the app closed counts as quit, so spent hint coins stay spent.
  for (const s of Object.values(store.saves)) {
    if (s.current) s.attempts.push(s.current)
    s.current = null
  }
  return store
}

export function persist(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // full or blocked: keep playing, the server copy still syncs
  }
}

export const newSave = (code: string, pin: string): Save => ({ code, pin, preDone: false, attempts: [], current: null })

export function merge(save: Save, server: Attempt[]): Save {
  const byId = new Map(save.attempts.map((a) => [a.id, a]))
  for (const a of server) byId.set(a.id, { ...a, synced: true })
  return { ...save, attempts: [...byId.values()] }
}

// Sends unsent attempts; gets back the student's whole history (other devices too) and
// everyone's best Expert times. 'bad-login' = code/PIN not on the server. Throws when offline.
export async function sync(save: Save): Promise<{ attempts: Attempt[]; ranking: Rank[] } | 'bad-login'> {
  if (!db) return { attempts: [], ranking: [] }
  const { data, error } = await db.rpc('integrid_sync', {
    p_code: save.code,
    p_pin: save.pin,
    p_attempts: save.attempts.filter((a) => !a.synced),
  })
  if (error) throw error
  return data ?? 'bad-login'
}
