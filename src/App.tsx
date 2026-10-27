import { lazy, Suspense, useEffect, useState } from 'react'
import { Landing } from './Landing.tsx'
import { LoadingScreen } from './LoadingScreen.tsx'
import { installNavigationSounds } from './navigationSounds.ts'
import { setMusicScene, startMusic } from './music.ts'
import { Deco } from './ui.tsx'
import { startAppUpdates } from './appUpdates.ts'

const openStudent = () => {
  // Fetch both in parallel after Start intent, so the first puzzle has no extra code wait.
  void import('./Game.tsx').catch(() => {})
  return import('./StudentApp.tsx')
}
const StudentApp = lazy(openStudent)
const Admin = lazy(() => import('./Admin.tsx').then(({ Admin }) => ({ default: Admin })))

// The first screen does not import puzzle logic, CSVs, teacher tools or the backend SDK.
export default function App() {
  const [entered, setEntered] = useState(false)
  const [admin, setAdmin] = useState(() => location.hash === '#admin')
  useEffect(() => { if (!admin && !entered) setMusicScene('menu') }, [admin, entered])
  useEffect(installNavigationSounds, [])
  useEffect(() => {
    dispatchEvent(new Event('integrid:ready'))
    if (import.meta.env.PROD) startAppUpdates()
  }, [])
  useEffect(() => {
    const onHash = () => { const next = location.hash === '#admin'; setAdmin(next); if (next) setEntered(false) }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  return <Suspense fallback={<LoadingScreen title={admin ? 'Opening your classroom' : 'Opening your adventure'} detail={admin ? 'Getting your teacher tools ready.' : 'Getting your next challenge ready.'} />}>
    {admin ? <Admin /> : <>
      {entered ? <StudentApp /> : <Landing onStart={() => { void startMusic(); setEntered(true) }} onIntent={() => { void openStudent().catch(() => {}) }} />}
      <div className="upright" role="alert"><Deco>📱</Deco><b>Turn your phone upright</b><span>INTEGRID plays standing up.</span></div>
    </>}
  </Suspense>
}
