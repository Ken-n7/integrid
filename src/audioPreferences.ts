const memory = new Map<string, string>()
export function audioPreference(key: string) {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null } catch { return memory.get(key) ?? null }
}
export function saveAudioPreference(key: string, value: string) {
  memory.set(key, value)
  try { localStorage.setItem(key, value) } catch { /* retain the setting for this session */ }
}
export function audioVolume(key: string, fallback: number) {
  const raw = audioPreference(key)
  const value = raw === null ? fallback : Number(raw)
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback
}
