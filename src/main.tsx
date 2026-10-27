import './fonts.css'
import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { LoadingScreen } from './LoadingScreen.tsx'
import './styles.css'

// If drawing a screen ever fails, show a way out instead of a blank page.
class Crash extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError = () => ({ failed: true })
  render() {
    if (!this.state.failed) return this.props.children
    return <LoadingScreen title="Let’s try that again" detail="Your saved progress is safe. Reload to open your adventure." retryNow />
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
)
