// After a screen change, put focus on the new screen's heading so a screen reader announces it.
export function focusScreen() {
  const target = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main')
  if (!target) return
  target.tabIndex = -1
  target.focus({ preventScroll: true })
}
