import { useEffect, useState } from 'react'

import { useShortcutRuntime } from '../../../services/shortcuts/runtime'

// Tracks whether the platform-resolved primary modifier (⌘ on macOS, Ctrl elsewhere)
// is currently held, so tabs can hint their `primary+<n>` switch shortcut.
export function usePrimaryModifierHeld() {
  const { platform } = useShortcutRuntime()
  const [isHeld, setIsHeld] = useState(false)

  useEffect(() => {
    const modifierState = platform === 'mac' ? 'Meta' : 'Control'

    const syncFromEvent = (event: KeyboardEvent) => setIsHeld(event.getModifierState(modifierState))
    // A keyup can be missed when the window loses focus mid-press (e.g. ⌘Tab).
    const reset = () => setIsHeld(false)

    window.addEventListener('keydown', syncFromEvent, true)
    window.addEventListener('keyup', syncFromEvent, true)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', syncFromEvent, true)
      window.removeEventListener('keyup', syncFromEvent, true)
      window.removeEventListener('blur', reset)
    }
  }, [platform])

  return isHeld
}
