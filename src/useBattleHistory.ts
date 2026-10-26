import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from './store.ts'
import { HISTORY_COLUMNS, mergeBattleRecords, readBattleRecord, readHistoryCache, type BattleRecord, type HistoryCache } from './battleHistory.ts'
import { useBeforeUnload } from './useBeforeUnload.ts'

export function useBattleHistory(teacherId?: string) {
  const key = `integrid:battle-history:${teacherId ?? 'preview'}`
  const [cache, setCache] = useState<HistoryCache>(() => {
    try { return readHistoryCache(localStorage.getItem(key)) } catch { return readHistoryCache(null) }
  })
  const latest = useRef(cache)
  const busy = useRef(false)
  const retry = useRef<(() => Promise<void>) | null>(null)
  const mounted = useRef(true)
  const [syncing, setSyncing] = useState(false)
  const [cloudIssue, setCloudIssue] = useState('')
  const [storageIssue, setStorageIssue] = useState('')
  useBeforeUnload(!!storageIssue)
  const commit = useCallback((next: HistoryCache) => {
    latest.current = next
    if (mounted.current) setCache(next)
    try {
      // Keep every pending round, plus the most recent synced copies for offline browsing.
      const pending = new Set(next.pending)
      const stored = db ? next.records.filter((r, i) => i < 200 || pending.has(r.id)) : next.records
      localStorage.setItem(key, JSON.stringify({ ...next, records: stored }))
      if (mounted.current) setStorageIssue('')
    } catch {
      if (mounted.current) setStorageIssue('Couldn’t save history on this device. Keep this page open and download the CSV to keep a copy.')
    }
  }, [key])
  const sync = useCallback(async (): Promise<void> => {
    if (!db || !teacherId || busy.current) return
    busy.current = true
    if (mounted.current) { setSyncing(true); setCloudIssue('') }
    let ok = false
    try {
      const sent = latest.current.pending
      if (sent.length) {
        const ids = new Set(sent)
        const rows = latest.current.records.filter((r) => ids.has(r.id)).map((r) => ({ ...r, host_id: teacherId }))
        const { error } = await db.from('battle_history').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
        if (error) throw error
        commit({ ...latest.current, pending: latest.current.pending.filter((id) => !ids.has(id)) })
      }
      const records: BattleRecord[] = []
      for (let from = 0; ; from += 500) {
        const { data, error } = await db.from('battle_history').select(HISTORY_COLUMNS).order('ended_at', { ascending: false }).order('id').range(from, from + 499)
        if (error) throw error
        for (const value of data ?? []) { const r = readBattleRecord(value); if (r) records.push(r) }
        if ((data?.length ?? 0) < 500) break
      }
      commit({ ...latest.current, records: mergeBattleRecords(latest.current.records, records, latest.current.records.filter((r) => latest.current.pending.includes(r.id))) })
      ok = true
    } catch {
      if (mounted.current) setCloudIssue('Cloud history is unavailable. Rounds saved on this device remain here and will retry when you reconnect.')
    } finally {
      busy.current = false
      if (mounted.current) setSyncing(false)
      if (ok && mounted.current && latest.current.pending.length) queueMicrotask(() => void retry.current?.())
    }
  }, [teacherId, commit])
  const record = useCallback((round: BattleRecord) => {
    const current = latest.current
    if (current.records.some((r) => r.id === round.id)) return
    commit({ version: 1, records: mergeBattleRecords(current.records, [round]), pending: db ? [...current.pending, round.id] : [] })
  }, [commit])
  useEffect(() => {
    mounted.current = true
    retry.current = sync
    void sync()
    const online = () => void sync()
    const storage = (event: StorageEvent) => {
      if (event.key !== key || !event.newValue) return
      const incoming = readHistoryCache(event.newValue), current = latest.current
      const next: HistoryCache = { version: 1, records: mergeBattleRecords(current.records, incoming.records), pending: [...new Set([...current.pending, ...incoming.pending])].sort() }
      if (JSON.stringify(next) !== JSON.stringify(current)) commit(next)
    }
    addEventListener('online', online)
    addEventListener('storage', storage)
    return () => { mounted.current = false; retry.current = null; removeEventListener('online', online); removeEventListener('storage', storage) }
  }, [sync, key, commit])
  useEffect(() => { if (cache.pending.length) void sync() }, [cache.pending.length, sync])
  return { records: cache.records, pending: cache.pending.length, syncing, cloudIssue, storageIssue, record, sync, cloud: !!db }
}
