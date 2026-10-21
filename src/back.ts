// Android's back gesture (and the browser's back button) does what the on-screen back does.
// Screens and pop-ups register their back action; an open pop-up goes first. Where nothing is
// registered (the start and home screens) the gesture leaves the app as usual.
// How: while something is registered, one extra history entry sits on top. The gesture pops it,
// the action runs, and a fresh entry goes back on. Browsers only honor entries added after the
// person has tapped the page, which students always have by the time any screen registers.
import { useEffect, useEffectEvent } from 'react'

type Kind = 'screen' | 'popup'
const stacks: Record<Kind, (() => void)[]> = { screen: [], popup: [] }
const top = () => stacks.popup.at(-1) ?? stacks.screen.at(-1)
let armed = history.state?.integridBack === true // a reload can land on our extra entry
let skip = false

function sync() {
  // A link that swaps the page's entry (the admin link) takes our entry with it: trust the real one.
  if (!skip) armed = history.state?.integridBack === true
  if (top() && !armed) {
    history.pushState({ integridBack: true }, '')
    armed = true
  } else if (!top() && armed && history.state?.integridBack) {
    // nothing left to go back to inside the app: drop the entry so one gesture leaves
    armed = false
    skip = true
    history.back()
  }
}
sync()

addEventListener('popstate', () => {
  if (skip) return void (skip = false)
  armed = false
  top()?.()
  setTimeout(sync) // once React has drawn the screen the action led to
})

export function useBack(action: () => void, kind: Kind = 'screen', enabled = true) {
  const run = useEffectEvent(action)
  useEffect(() => {
    if (!enabled) return
    const handler = () => run()
    stacks[kind].push(handler)
    sync()
    return () => {
      stacks[kind].splice(stacks[kind].indexOf(handler), 1)
      setTimeout(sync) // later, so the next screen (or React's dev re-run) registers first
    }
  }, [kind, enabled])
}
