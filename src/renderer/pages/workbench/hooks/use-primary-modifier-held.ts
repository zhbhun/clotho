import { useEffect, useRef, useState } from 'react'

import { useShortcutRuntime } from '../../../services/shortcuts/runtime'

// `primary+<n>` is quick to hit by accident, so the badges appear only once the
// modifier has been held like a deliberate hint request.
export const PRIMARY_HINT_HOLD_MS = 1_000

// Tracks whether the platform-resolved primary modifier (⌘ on macOS, Ctrl elsewhere)
// has been held long enough that tabs may hint their `primary+<n>` switch shortcut.
export function usePrimaryModifierHeld() {
  const { platform } = useShortcutRuntime()
  const [isHeld, setIsHeld] = useState(false)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const modifierState = platform === 'mac' ? 'Meta' : 'Control'

    const cancelPendingHold = () => {
      if (holdTimerRef.current === null) return
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }

    const syncFromEvent = (event: KeyboardEvent) => {
      if (!event.getModifierState(modifierState)) {
        cancelPendingHold()
        setIsHeld(false)
        return
      }
      if (holdTimerRef.current !== null) return
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null
        setIsHeld(true)
      }, PRIMARY_HINT_HOLD_MS)
    }
    // A keyup can be missed when the window loses focus mid-press (e.g. ⌘Tab).
    const reset = () => {
      cancelPendingHold()
      setIsHeld(false)
    }

    window.addEventListener('keydown', syncFromEvent, true)
    window.addEventListener('keyup', syncFromEvent, true)
    window.addEventListener('blur', reset)
    return () => {
      cancelPendingHold()
      window.removeEventListener('keydown', syncFromEvent, true)
      window.removeEventListener('keyup', syncFromEvent, true)
      window.removeEventListener('blur', reset)
    }
  }, [platform])

  return isHeld
}
