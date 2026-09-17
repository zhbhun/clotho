import { type RefCallback, useCallback, useLayoutEffect, useState } from 'react'

const DEFAULT_BOTTOM_PADDING = 288
const DOCK_GAP = 12

export function useConversationDock(mode: 'ask' | 'prompt'): {
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

  return {
    bottomPadding: Math.max(DEFAULT_BOTTOM_PADDING, height + DOCK_GAP),
    dockRef,
    scrollVersion: `${mode}:${height}`,
  }
}
