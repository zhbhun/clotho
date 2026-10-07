import { useEffect, useRef } from 'react'

import { useSidebar } from '@/shadcn/sidebar'

// A short armed delay keeps sweeps past the trigger from flashing the panel;
// leaving before it fires cancels the preview.
const HOVER_PREVIEW_DELAY_MS = 150

// Arms the collapsed sidebar's hover preview while the pointer rests on the
// expand trigger. Spread the returned handlers onto that trigger.
export function useSidebarHoverPreview() {
  const { isMobile, state, setHoverPreview } = useSidebar()
  const timerRef = useRef<number | undefined>(undefined)
  // Collapsing remounts the trigger right under the stationary pointer and the
  // browser synthesizes a hover for it; hold the preview until the pointer
  // really moves, so collapsing does not pop the panel straight back open.
  const isHoverSuppressedRef = useRef(false)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  useEffect(() => {
    let lastX = Number.NaN
    let lastY = Number.NaN
    // A layout change replays the previous pointer position verbatim, so only
    // a move with fresh coordinates counts as a real one.
    const handlePointerMove = (event: MouseEvent) => {
      if (event.clientX === lastX && event.clientY === lastY) return
      lastX = event.clientX
      lastY = event.clientY
      isHoverSuppressedRef.current = false
    }
    document.addEventListener('mousemove', handlePointerMove)
    return () => document.removeEventListener('mousemove', handlePointerMove)
  }, [])

  const previousStateRef = useRef(state)
  useEffect(() => {
    if (state === previousStateRef.current) return
    previousStateRef.current = state
    if (state !== 'collapsed') return
    isHoverSuppressedRef.current = true
    window.clearTimeout(timerRef.current)
  }, [state])

  return {
    onMouseEnter: () => {
      if (isMobile || state !== 'collapsed' || isHoverSuppressedRef.current) return
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        if (isHoverSuppressedRef.current) return
        setHoverPreview(true)
      }, HOVER_PREVIEW_DELAY_MS)
    },
    onMouseLeave: () => window.clearTimeout(timerRef.current),
  }
}
