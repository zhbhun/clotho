import { type RefObject, useEffect } from 'react'

const SCROLLBAR_VISIBLE_AFTER_LAST_SCROLL_MS = 1000
export const SCROLLBAR_SELECTOR = '[data-slot="scroll-area-scrollbar"]'

/**
 * Base UI's Scrollbar has no Radix type="scroll" auto-hide state machine.
 * Synthesize the same data-state="visible"/"hidden" contract on the scrollbar element
 * so transient-scroll-area.css keeps its existing animation rules: visible after a manual
 * scroll input, then hidden one second after the last input or scrollbar hover.
 */
export function useTransientScrollbarVisibility(
  rootRef: RefObject<HTMLDivElement | null>,
  trackScroll = false,
) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const belongsToRoot = (element: Element) =>
      element.closest('[data-transient-scroll-area]') === root
    const scrollbars = [...root.querySelectorAll<HTMLElement>(SCROLLBAR_SELECTOR)].filter(
      belongsToRoot,
    )

    let hideTimer: number | undefined
    const setVisible = () => {
      for (const scrollbar of scrollbars) {
        scrollbar.setAttribute('data-state', 'visible')
      }
    }
    const setHidden = () => {
      for (const scrollbar of scrollbars) {
        scrollbar.setAttribute('data-state', 'hidden')
      }
    }
    const scheduleHide = () => {
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(setHidden, SCROLLBAR_VISIBLE_AFTER_LAST_SCROLL_MS)
    }

    const showForManualScroll = (event: Event) => {
      if (!(event.target instanceof Element) || !belongsToRoot(event.target)) return
      setVisible()
      scheduleHide()
    }
    const handleWheel = (event: WheelEvent) => showForManualScroll(event)
    const handleTouchMove = (event: TouchEvent) => showForManualScroll(event)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, [contenteditable="true"]'))
      ) {
        return
      }

      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'PageDown' ||
        event.key === 'PageUp' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === ' '
      ) {
        showForManualScroll(event)
      }
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest(SCROLLBAR_SELECTOR)) return

      showForManualScroll(event)
    }
    const handlePointerEnter = () => window.clearTimeout(hideTimer)
    const handlePointerLeave = () => scheduleHide()

    root.addEventListener('wheel', handleWheel, { passive: true })
    if (trackScroll) root.addEventListener('scroll', showForManualScroll, true)
    root.addEventListener('touchmove', handleTouchMove, { passive: true })
    root.addEventListener('keydown', handleKeyDown)
    root.addEventListener('pointerdown', handlePointerDown, true)
    for (const scrollbar of scrollbars) {
      scrollbar.addEventListener('pointerenter', handlePointerEnter)
      scrollbar.addEventListener('pointerleave', handlePointerLeave)
    }
    return () => {
      root.removeEventListener('wheel', handleWheel)
      if (trackScroll) root.removeEventListener('scroll', showForManualScroll, true)
      root.removeEventListener('touchmove', handleTouchMove)
      root.removeEventListener('keydown', handleKeyDown)
      root.removeEventListener('pointerdown', handlePointerDown, true)
      for (const scrollbar of scrollbars) {
        scrollbar.removeEventListener('pointerenter', handlePointerEnter)
        scrollbar.removeEventListener('pointerleave', handlePointerLeave)
      }
      window.clearTimeout(hideTimer)
    }
  }, [rootRef, trackScroll])
}
