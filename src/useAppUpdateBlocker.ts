import { useLayoutEffect } from 'react'
import { holdAppUpdates } from './appUpdates.ts'

export function useAppUpdateBlocker(enabled: boolean) {
  // Acquire the lock during commit, before a worker event can refresh the new screen.
  useLayoutEffect(() => enabled ? holdAppUpdates() : undefined, [enabled])
}
