import { type RefCallback, useCallback, useLayoutEffect, useState } from 'react'

// Floor only covers the pre-measure frame; the measured dock height + gap
// keeps the pinned view snug against the input otherwise.
const DEFAULT_BOTTOM_PADDING = 160
const DOCK_GAP = 36
// The floating pending-message strip is absolutely positioned and therefore
// invisible to the dock measurement. Of its 60px surface, 16px tucks behind
// the composer card, leaving a 44px overlap over the conversation tail.
const PENDING_MESSAGE_CLEARANCE_PX = 44

export function useConversationDock(
  mode: 'ask' | 'prompt',
  hasPendingMessage = false,
): {
  bottomPadding: number
  dockRef: RefCallback<HTMLDivElement>
  scrollVersion: string
} {
  const [dock, setDock] = useState<HTMLDivElement | null>(null)
  const [height, setHeight] = useState(0)
  const dockRef = useCallback((element: HTMLDivElement | null) => setDock(element), [])

  useLayoutEffect(() => {
    if (!dock) return

    const measure = () => {
      const nextHeight = Math.ceil(dock.getBoundingClientRect().height)
      setHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight))
    }
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(dock)
    return () => observer.disconnect()
  }, [dock])

  const pendingClearance = hasPendingMessage ? PENDING_MESSAGE_CLEARANCE_PX : 0
  return {
    bottomPadding: Math.max(DEFAULT_BOTTOM_PADDING, height + DOCK_GAP + pendingClearance),
    dockRef,
    scrollVersion: `${mode}:${height}:${pendingClearance}`,
  }
}
