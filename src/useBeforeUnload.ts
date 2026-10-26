import { useLayoutEffect } from 'react'
import { useAppUpdateBlocker } from './useAppUpdateBlocker.ts'

// Browser-controlled confirmation also covers closing or reloading a tab with unsaved work.
export function useBeforeUnload(enabled: boolean) {
  useAppUpdateBlocker(enabled)
  useLayoutEffect(() => {
    if (!enabled) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [enabled])
}
