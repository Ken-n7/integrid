export type OfflineState = 'idle' | 'saving' | 'updating' | 'ready'
let state: OfflineState = 'idle'
const listeners = new Set<() => void>()
export const getOfflineState = () => state
export function subscribeOfflineState(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function setOfflineState(next: OfflineState) { if (state !== next) { state = next; for (const listener of listeners) listener() } }
