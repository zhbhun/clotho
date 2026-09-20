import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Focus origins of the currently running dialog flow, shared by all dialog
 * roots, with the number of dialogs the flow is currently running. When a
 * dialog's own origin is already gone by the time it closes (it opened from a
 * popup that died in the same breath, e.g. a picker spawning a form dialog),
 * the flow is walked newest-first for the nearest origin still connected. The
 * flow ends, and the chain is cleared, when its last dialog closes —
 * unrelated dialogs never inherit a stale origin.
 */
const flowOrigins: HTMLElement[] = []
let flowDepth = 0

/**
 * Captures the focused element while the dialog opens and restores it on
 * keyboard dismissal; pointer dismissal keeps the clicked focus. Restoring
 * returns `false` when there is no valid origin, which opts out of Base UI's
 * fallback of restoring a stale element from its shared previously-focused
 * list. Attach to a dialog root so `open` tracks the dialog state; unmanaged
 * opens are still captured through the root's `onOpenChange`.
 */
export function useDialogFocusReturn(open?: boolean) {
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const hasCapturedRef = useRef(false)
  const hasHandledCloseRef = useRef(false)

  const captureReturnFocus = useCallback(() => {
    if (hasCapturedRef.current) return
    const activeElement = document.activeElement
    const origin =
      activeElement instanceof HTMLElement &&
      activeElement.isConnected &&
      activeElement !== document.body
        ? activeElement
        : null
    hasCapturedRef.current = true
    hasHandledCloseRef.current = false
    flowDepth += 1
    if (origin) {
      returnFocusRef.current = origin
      flowOrigins.push(origin)
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    captureReturnFocus()
  }, [captureReturnFocus, open])

  const finalFocus = useCallback((closeType: string) => {
    // Base UI runs this cleanup once when the popup stops being mounted and
    // again when it unmounts; only the first call may act on the flow.
    if (hasHandledCloseRef.current) return false
    hasHandledCloseRef.current = true

    const ownFocus = returnFocusRef.current
    let returnFocus = ownFocus?.isConnected ? ownFocus : null
    if (!returnFocus) {
      for (let index = flowOrigins.length - 1; index >= 0; index -= 1) {
        const candidate = flowOrigins[index]
        if (candidate !== ownFocus && candidate.isConnected) {
          returnFocus = candidate
          break
        }
      }
    }
    returnFocusRef.current = null
    hasCapturedRef.current = false
    flowDepth = Math.max(0, flowDepth - 1)
    if (flowDepth === 0) {
      flowOrigins.length = 0
    }

    if (closeType !== 'keyboard' || !returnFocus) return false
    // A tabIndex=-1 container focused by a blank-area click is not tabbable,
    // so Base UI would redirect the return target to its first tabbable
    // descendant (e.g. the sidebar toggle). Focus such click-only containers
    // directly — invisibly — instead of handing them to Base UI.
    if (returnFocus.tabIndex < 0) {
      returnFocus.focus({ focusVisible: false, preventScroll: true })
      return false
    }
    return returnFocus
  }, [])

  return { captureReturnFocus, finalFocus }
}
