import '@fontsource-variable/nunito'
import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles.css'

// If drawing a screen ever fails, show a way out instead of a blank page.
class Crash extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError = () => ({ failed: true })
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="screen center">
        <h1>Something went wrong</h1>
        <p className="sub">Finished levels are saved on this phone.</p>
        <button className="big" onClick={() => location.reload()} autoFocus>
          Reload
        </button>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
)
