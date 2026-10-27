import type { VirtualItem } from '@tanstack/virtual-core'
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
// Auto-scroll resumes only after the scroll settles at the bottom, so an
// ongoing wheel/touch gesture or its momentum is not fought by content growth.
const RESUME_AUTO_SCROLL_IDLE_MS = 200
// Saved states only serve open session tabs; keep the cache bounded so closed
// sessions do not accumulate.
const SCROLL_STATE_CACHE_LIMIT = 24
// A pending restore only retries while the conversation is still laying out;
// stop instead of yanking the scroll long after the tab switch.
const RESTORE_MAX_ATTEMPTS = 10

interface ConversationScrollState {
  anchors: Map<string, ConversationScrollAnchor>
  autoScroll: Map<string, boolean>
  // Measured row heights per view, snapshotted from the virtualizer before the
  // tab unmounts; the next mount seeds its virtualizer with them so a restored
  // anchor lands on measured coordinates instead of estimate-built ones.
  measurements: Map<string, VirtualItem[]>
  positions: Map<string, number>
}

// Session views remount on every tab switch (the provider is keyed by
// sessionId), so per-session scroll state has to outlive the hook instance.
const scrollStatesBySession = new Map<string, ConversationScrollState>()

export function clearConversationScrollStates() {
  scrollStatesBySession.clear()
}

function getConversationScrollState(sessionKey: string) {
  let state = scrollStatesBySession.get(sessionKey)
  if (!state) {
    state = {
      anchors: new Map(),
      autoScroll: new Map(),
      measurements: new Map(),
      positions: new Map(),
    }
    scrollStatesBySession.set(sessionKey, state)
    if (scrollStatesBySession.size > SCROLL_STATE_CACHE_LIMIT) {
      const oldestKey = scrollStatesBySession.keys().next().value
      if (oldestKey !== undefined) scrollStatesBySession.delete(oldestKey)
    }
  }
  return state
}

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
  sessionKey: string,
  scrollAnchorRef?: RefObject<ConversationScrollAnchorController | null>,
): {
  initialMeasurements: VirtualItem[] | undefined
  isAutoScrollActive: () => boolean
  isContentScrolled: boolean
  pauseAutoScroll: () => void
  resetAutoScroll: () => void
  saveMeasurements: (viewKey: string, measurements: VirtualItem[]) => void
  viewportRef: RefCallback<HTMLDivElement>
} {
  const [isContentScrolled, setIsContentScrolled] = useState(false)
  // The conversation viewport element reaches the virtual list one commit after
  // mount (via state), so restore retries must also fire when it attaches.
  const [hasViewport, setHasViewport] = useState(false)
  const sessionState = getConversationScrollState(sessionKey)
  const shouldAutoScrollRef = useRef(true)
  const autoScrollByViewRef = useRef(sessionState.autoScroll)
  const scrollAnchorsRef = useRef(sessionState.anchors)
  const scrollPositionsRef = useRef(sessionState.positions)
  const viewKeyRef = useRef(viewKey)
  const viewportElementRef = useRef<HTMLDivElement | null>(null)
  const removeViewportListenersRef = useRef<(() => void) | null>(null)
  const resumeTimerRef = useRef<number | null>(null)
  const pendingRestoreRef = useRef<{
    anchor?: ConversationScrollAnchor
    attempts: number
    position?: number
  } | null>(null)

  const scrollToBottom = useCallback(() => {
    const viewport = viewportElementRef.current
    if (!shouldAutoScrollRef.current || !viewport) return

    viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    updateScrolledState(setIsContentScrolled, viewport)
    scrollPositionsRef.current.set(viewKeyRef.current, viewport.scrollTop)
  }, [])

  const cancelAutoScrollResume = useCallback(() => {
    if (resumeTimerRef.current === null) return
    window.clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = null
  }, [])

  const scheduleAutoScrollResume = useCallback(() => {
    if (shouldAutoScrollRef.current) return
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null
      shouldAutoScrollRef.current = true
      autoScrollByViewRef.current.set(viewKeyRef.current, true)
    }, RESUME_AUTO_SCROLL_IDLE_MS)
  }, [])

  const resetAutoScroll = useCallback(() => {
    cancelAutoScrollResume()
    pendingRestoreRef.current = null
    shouldAutoScrollRef.current = true
    autoScrollByViewRef.current.set(viewKeyRef.current, true)
    scrollToBottom()
  }, [cancelAutoScrollResume, scrollToBottom])

  const pauseAutoScroll = useCallback(() => {
    cancelAutoScrollResume()
    shouldAutoScrollRef.current = false
    autoScrollByViewRef.current.set(viewKeyRef.current, false)
  }, [cancelAutoScrollResume])

  const viewportRef = useCallback(
    (viewport: HTMLDivElement | null) => {
      removeViewportListenersRef.current?.()
      removeViewportListenersRef.current = null
      viewportElementRef.current = viewport
      setHasViewport(Boolean(viewport))
      if (!viewport) {
        setIsContentScrolled((current) => (current ? false : current))
        return
      }

      updateScrolledState(setIsContentScrolled, viewport)

      const handleScroll = () => {
        updateScrolledState(setIsContentScrolled, viewport)
        if (isAtBottom(viewport)) scheduleAutoScrollResume()
        else pauseAutoScroll()
        scrollPositionsRef.current.set(viewKeyRef.current, viewport.scrollTop)
        const anchor = scrollAnchorRef?.current?.captureScrollAnchor()
        if (anchor) scrollAnchorsRef.current.set(viewKeyRef.current, anchor)
      }
      // Direct gestures cancel a pending restore: from then on the user, not
      // the saved offset, decides where the conversation sits. Programmatic
      // scrolls (the restore itself) must not cancel it.
      const handleWheel = () => {
        pendingRestoreRef.current = null
        if (isAtBottom(viewport)) scheduleAutoScrollResume()
        else pauseAutoScroll()
      }
      const handleTouchMove = () => {
        pendingRestoreRef.current = null
        if (isAtBottom(viewport)) scheduleAutoScrollResume()
        else pauseAutoScroll()
      }

      // Follow content growth in the frame it lays out: the observer callback
      // runs after layout and before paint, so the correction lands in the
      // same paint as the growth instead of trailing it by a visible frame.
      let contentObserver: ResizeObserver | null = null
      const content = viewport.firstElementChild
      if (content && typeof ResizeObserver === 'function') {
        contentObserver = new ResizeObserver(() => scrollToBottom())
        contentObserver.observe(content)
      }

      const removeViewport = () => {
        cancelAutoScrollResume()
        viewport.removeEventListener('scroll', handleScroll)
        viewport.removeEventListener('wheel', handleWheel)
        viewport.removeEventListener('touchmove', handleTouchMove)
        contentObserver?.disconnect()
      }

      viewport.addEventListener('scroll', handleScroll)
      viewport.addEventListener('wheel', handleWheel, { passive: true })
      viewport.addEventListener('touchmove', handleTouchMove, { passive: true })

      removeViewportListenersRef.current = removeViewport
    },
    [
      cancelAutoScrollResume,
      pauseAutoScroll,
      scheduleAutoScrollResume,
      scrollToBottom,
      scrollAnchorRef,
    ],
  )

  useLayoutEffect(() => {
    const viewport = viewportElementRef.current
    const previousViewKey = viewKeyRef.current
    if (!viewport || previousViewKey === viewKey) return

    cancelAutoScrollResume()
    pendingRestoreRef.current = null
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
  }, [cancelAutoScrollResume, scrollAnchorRef, viewKey])

  // Mount: sessions remount on every tab switch, so reopen at the saved
  // reading position instead of letting the auto-scroll default snap to the
  // bottom. Declared before the version-driven correction below so the
  // restored flag wins on the very first commit.
  useLayoutEffect(() => {
    const savedAutoScroll = autoScrollByViewRef.current.get(viewKeyRef.current)
    shouldAutoScrollRef.current = savedAutoScroll ?? true
    if (savedAutoScroll === false) {
      pendingRestoreRef.current = {
        anchor: scrollAnchorsRef.current.get(viewKeyRef.current),
        attempts: 0,
        position: scrollPositionsRef.current.get(viewKeyRef.current),
      }
    }
    const viewport = viewportElementRef.current
    if (viewport) updateScrolledState(setIsContentScrolled, viewport)
  }, [])

  // Retry the restore while the conversation lays out: the anchor applies once
  // its row exists and the virtualizer has a scroll element. The raw offset is
  // only a fallback for views without an anchor — applying it while the anchor
  // is still waiting would pin the position on estimate-built coordinates.
  useLayoutEffect(() => {
    const pending = pendingRestoreRef.current
    const viewport = viewportElementRef.current
    if (!pending || !viewport) return

    let restored = false
    if (pending.anchor && scrollAnchorRef?.current) {
      restored = scrollAnchorRef.current.restoreScrollAnchor(pending.anchor)
    }
    if (!restored && !pending.anchor && pending.position !== undefined) {
      restored = viewport.scrollHeight - viewport.clientHeight >= pending.position
      if (restored) viewport.scrollTop = pending.position
    }
    if (restored) {
      pendingRestoreRef.current = null
      scrollPositionsRef.current.set(viewKeyRef.current, viewport.scrollTop)
      updateScrolledState(setIsContentScrolled, viewport)
      return
    }
    pending.attempts += 1
    if (pending.attempts >= RESTORE_MAX_ATTEMPTS) pendingRestoreRef.current = null
  }, [contentVersion, hasViewport, scrollAnchorRef])

  // Before paint: a correction that lands after paint is visible as a jump —
  // the user sees the unscrolled content first, then the whole list shift.
  useLayoutEffect(() => {
    scrollToBottom()
  }, [contentVersion, scrollToBottom])

  useEffect(
    () => () => {
      removeViewportListenersRef.current?.()
    },
    [],
  )

  // Stable read of the live pin state; the virtualizer consults it during
  // resize compensation so the two scroll writers never correct together.
  const isAutoScrollActive = useCallback(() => shouldAutoScrollRef.current, [])

  const saveMeasurements = useCallback(
    (savedViewKey: string, measurements: VirtualItem[]) => {
      if (!measurements.length) return
      sessionState.measurements.set(savedViewKey, measurements)
    },
    [sessionState],
  )

  // Read once per mount: the seeded virtualizer mutates nothing the snapshot
  // shares, but a later remount must still see the latest saved heights.
  const initialMeasurements = sessionState.measurements.get(viewKey)

  return {
    initialMeasurements,
    isAutoScrollActive,
    isContentScrolled,
    pauseAutoScroll,
    resetAutoScroll,
    saveMeasurements,
    viewportRef,
  }
}

export interface ConversationScrollAnchorController {
  captureScrollAnchor: () => ConversationScrollAnchor | null
  restoreScrollAnchor: (anchor: ConversationScrollAnchor) => boolean
}
