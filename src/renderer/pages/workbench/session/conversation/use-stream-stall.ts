import { useEffect, useRef, useState } from 'react'

/** Quiet window after which a still-typing text item counts as stalled. */
export const STREAM_STALL_THRESHOLD_MS = 2000

/**
 * True while `isActive` and `text` has not changed for the stall threshold.
 * The model pauses between a finished text segment and its next step; this
 * lets the timeline show a Thinking placeholder through that quiet window
 * even while the tail text item is still its `stream-` placeholder.
 */
export function useStreamTextStall(
  text: string | undefined,
  isActive: boolean,
  idleMs: number = STREAM_STALL_THRESHOLD_MS,
): boolean {
  const [isStalled, setIsStalled] = useState(false)
  const lastChangeAtRef = useRef<number | null>(null)

  useEffect(() => {
    lastChangeAtRef.current = Date.now()
    setIsStalled(false)
  }, [text])

  useEffect(() => {
    if (!isActive) {
      lastChangeAtRef.current = null
      setIsStalled(false)
      return
    }
    lastChangeAtRef.current ??= Date.now()
    const timer = window.setInterval(() => {
      const lastChangeAt = lastChangeAtRef.current
      setIsStalled(lastChangeAt !== null && Date.now() - lastChangeAt >= idleMs)
    }, 500)
    return () => window.clearInterval(timer)
  }, [idleMs, isActive])

  return isStalled
}
