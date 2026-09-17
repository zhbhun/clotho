import {
  type RefCallback,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import type { ConversationScrollAnchor } from './conversation/virtual-conversation'

const BOTTOM_DISTANCE_THRESHOLD_PX = 4
const CONTENT_TOP_THRESHOLD_PX = 2

function isAtBottom(viewport: HTMLElement) {
  const distanceFromBottom = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop
  return distanceFromBottom <= BOTTOM_DISTANCE_THRESHOLD_PX
}

function hasLeftTopEdge(viewport: HTMLElement) {
  return viewport.scrollTop > CONTENT_TOP_THRESHOLD_PX
}

function updateScrolledState(
  setState: (updater: (current: boolean) => boolean) => void,
  viewport: HTMLElement,
) {
  const next = hasLeftTopEdge(viewport)
  setState((current) => (current === next ? current : next))
}

export function useConversationAutoScroll(
  contentVersion: unknown,
  viewKey = 'root',
  scrollAnchorRef?: RefObject<ConversationScrollAnchorController | null>,
): {
  isContentScrolled: boolean
  pauseAutoScroll: () => void
  resetAutoScroll: () => void
  viewportRef: RefCallback<HTMLDivElement>
} {
  const [isContentScrolled, setIsContentScrolled] = useState(false)
  const shouldAutoScrollRef = useRef(true)
  const autoScrollByViewRef = useRef(new Map<string, boolean>([[viewKey, true]]))
  const scrollAnchorsRef = useRef(new Map<string, ConversationScrollAnchor>())
  const scrollPositionsRef = useRef(new Map<string, number>())
  const viewKeyRef = useRef(viewKey)
  const viewportElementRef = useRef<HTMLDivElement | null>(null)
  const removeViewportListenersRef = useRef<(() => void) | null>(null)

  const scrollToBottom = useCallback(() => {
    const viewport = viewportElementRef.current
    if (!shouldAutoScrollRef.current || !viewport) return

    viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    updateScrolledState(setIsContentScrolled, viewport)
    scrollPositionsRef.current.set(viewKeyRef.current, viewport.scrollTop)
  }, [])

  const resetAutoScroll = useCallback(() => {
    shouldAutoScrollRef.current = true
    autoScrollByViewRef.current.set(viewKeyRef.current, true)
    scrollToBottom()
  }, [scrollToBottom])

  const pauseAutoScroll = useCallback(() => {
    shouldAutoScrollRef.current = false
    autoScrollByViewRef.current.set(viewKeyRef.current, false)
  }, [])

  const viewportRef = useCallback(
    (viewport: HTMLDivElement | null) => {
      removeViewportListenersRef.current?.()
      removeViewportListenersRef.current = null
      viewportElementRef.current = viewport
      if (!viewport) {
        setIsContentScrolled((current) => (current ? false : current))
        return
      }

      updateScrolledState(setIsContentScrolled, viewport)

      const handleScroll = () => {
        updateScrolledState(setIsContentScrolled, viewport)
        if (!isAtBottom(viewport)) {
          shouldAutoScrollRef.current = false
          autoScrollByViewRef.current.set(viewKeyRef.current, false)
        }
        scrollPositionsRef.current.set(viewKeyRef.current, viewport.scrollTop)
        const anchor = scrollAnchorRef?.current?.captureScrollAnchor()
        if (anchor) scrollAnchorsRef.current.set(viewKeyRef.current, anchor)
      }
      const handleWheel = () => {
        pauseAutoScroll()
      }
      const handleTouchMove = () => {
        pauseAutoScroll()
      }

      viewport.addEventListener('scroll', handleScroll)
      viewport.addEventListener('wheel', handleWheel, { passive: true })
      viewport.addEventListener('touchmove', handleTouchMove, { passive: true })

      removeViewportListenersRef.current = () => {
        viewport.removeEventListener('scroll', handleScroll)
        viewport.removeEventListener('wheel', handleWheel)
        viewport.removeEventListener('touchmove', handleTouchMove)
      }
    },
    [pauseAutoScroll, scrollAnchorRef],
  )

  useLayoutEffect(() => {
    const viewport = viewportElementRef.current
    const previousViewKey = viewKeyRef.current
    if (!viewport || previousViewKey === viewKey) return

    scrollPositionsRef.current.set(previousViewKey, viewport.scrollTop)
    viewKeyRef.current = viewKey
    const savedPosition = scrollPositionsRef.current.get(viewKey)
    const savedAnchor = scrollAnchorsRef.current.get(viewKey)
    const didRestoreAnchor = Boolean(
      savedAnchor && scrollAnchorRef?.current?.restoreScrollAnchor(savedAnchor),
    )
    if (!didRestoreAnchor) viewport.scrollTop = savedPosition ?? 0
    scrollPositionsRef.current.set(viewKey, viewport.scrollTop)
    updateScrolledState(setIsContentScrolled, viewport)
    shouldAutoScrollRef.current = autoScrollByViewRef.current.get(viewKey) ?? false
  }, [scrollAnchorRef, viewKey])

  useEffect(() => {
    scrollToBottom()
  }, [contentVersion, scrollToBottom])

  useEffect(
    () => () => {
      removeViewportListenersRef.current?.()
    },
    [],
  )

  return { isContentScrolled, pauseAutoScroll, resetAutoScroll, viewportRef }
}

export interface ConversationScrollAnchorController {
  captureScrollAnchor: () => ConversationScrollAnchor | null
  restoreScrollAnchor: (anchor: ConversationScrollAnchor) => boolean
}
