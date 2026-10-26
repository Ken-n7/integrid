import { useEffect } from 'react'

// Browser-controlled confirmation also covers closing or reloading a tab with unsaved work.
export function useBeforeUnload(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [enabled])
}
