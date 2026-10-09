import { act, fireEvent, render } from '@testing-library/react'
import { type RefObject, useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type ConversationScrollAnchorController,
  clearConversationScrollStates,
  useConversationAutoScroll,
} from './use-conversation-auto-scroll'

function AutoScrollHarness({
  contentVersion,
  onResetReady,
  scrollAnchorRef,
  sessionKey = 'session',
  showViewport = true,
  viewKey = 'root',
}: {
  contentVersion: number
  onResetReady: (resetAutoScroll: () => void) => void
  scrollAnchorRef?: RefObject<ConversationScrollAnchorController | null>
  sessionKey?: string
  showViewport?: boolean
  viewKey?: string
}) {
  const { isContentScrolled, resetAutoScroll, viewportRef } = useConversationAutoScroll(
    contentVersion,
    viewKey,
    sessionKey,
    scrollAnchorRef,
  )

  useEffect(() => {
    onResetReady(resetAutoScroll)
  }, [onResetReady, resetAutoScroll])

  return showViewport ? (
    <div
      data-content-scrolled={isContentScrolled ? 'true' : 'false'}
      data-testid="viewport"
      ref={viewportRef}
    >
      <div>{contentVersion}</div>
    </div>
  ) : null
}

function setScrollMetrics(
  element: HTMLElement,
  { clientHeight, scrollHeight }: { clientHeight: number; scrollHeight: number },
) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
  })
}

class ContentObserverRecorder {
  static instances: ContentObserverRecorder[] = []

  private callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ContentObserverRecorder.instances.push(this)
  }

  observe() {}
  unobserve() {}
  disconnect() {}

  trigger() {
    this.callback([] as ResizeObserverEntry[], this as unknown as ResizeObserver)
  }
}

describe('useConversationAutoScroll', () => {
  beforeEach(() => {
    clearConversationScrollStates()
  })

  it('reports whether the content has left the top edge', () => {
    const onResetReady = () => {}
    const { getByTestId } = render(
      <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} />,
    )
    const viewport = getByTestId('viewport')

    expect(viewport).toHaveAttribute('data-content-scrolled', 'false')

    viewport.scrollTop = 3
    fireEvent.scroll(viewport)
    expect(viewport).toHaveAttribute('data-content-scrolled', 'true')

    viewport.scrollTop = 0
    fireEvent.scroll(viewport)
    expect(viewport).toHaveAttribute('data-content-scrolled', 'false')
  })

  it('follows content growth while the user has not scrolled', () => {
    const onResetReady = () => {}
    const { getByTestId, rerender } = render(
      <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} />,
    )
    const viewport = getByTestId('viewport')

    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
    rerender(<AutoScrollHarness contentVersion={1} onResetReady={onResetReady} />)
    expect(viewport.scrollTop).toBe(400)

    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 700 })
    rerender(<AutoScrollHarness contentVersion={2} onResetReady={onResetReady} />)
    expect(viewport.scrollTop).toBe(600)
  })

  it('stops following after a manual scroll until the next reset', () => {
    let resetAutoScroll = () => {}
    const onResetReady = (reset: () => void) => {
      resetAutoScroll = reset
    }
    const { getByTestId, rerender } = render(
      <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} />,
    )
    const viewport = getByTestId('viewport')

    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
    rerender(<AutoScrollHarness contentVersion={1} onResetReady={onResetReady} />)
    viewport.scrollTop = 200
    fireEvent.scroll(viewport)

    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 700 })
    rerender(<AutoScrollHarness contentVersion={2} onResetReady={onResetReady} />)
    expect(viewport.scrollTop).toBe(200)

    resetAutoScroll()
    expect(viewport.scrollTop).toBe(600)
  })

  it('resumes following after a manual scroll back to the bottom settles', () => {
    vi.useFakeTimers()
    try {
      const onResetReady = () => {}
      const { getByTestId, rerender } = render(
        <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} />,
      )
      const viewport = getByTestId('viewport')

      setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
      rerender(<AutoScrollHarness contentVersion={1} onResetReady={onResetReady} />)
      viewport.scrollTop = 200
      fireEvent.scroll(viewport)

      setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 700 })
      rerender(<AutoScrollHarness contentVersion={2} onResetReady={onResetReady} />)
      expect(viewport.scrollTop).toBe(200)

      viewport.scrollTop = 600
      fireEvent.scroll(viewport)
      act(() => {
        vi.advanceTimersByTime(200)
      })

      setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 900 })
      rerender(<AutoScrollHarness contentVersion={3} onResetReady={onResetReady} />)
      expect(viewport.scrollTop).toBe(800)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps auto-scroll paused when the user leaves the bottom before the resume settles', () => {
    vi.useFakeTimers()
    try {
      const onResetReady = () => {}
      const { getByTestId, rerender } = render(
        <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} />,
      )
      const viewport = getByTestId('viewport')

      setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
      rerender(<AutoScrollHarness contentVersion={1} onResetReady={onResetReady} />)
      viewport.scrollTop = 200
      fireEvent.scroll(viewport)

      viewport.scrollTop = 400
      fireEvent.scroll(viewport)
      viewport.scrollTop = 150
      fireEvent.scroll(viewport)
      act(() => {
        vi.advanceTimersByTime(200)
      })

      setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 700 })
      rerender(<AutoScrollHarness contentVersion={2} onResetReady={onResetReady} />)
      expect(viewport.scrollTop).toBe(150)
    } finally {
      vi.useRealTimers()
    }
  })

  it('tracks manual scrolling when the viewport mounts after the hook', () => {
    const onResetReady = () => {}
    const { getByTestId, rerender } = render(
      <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} showViewport={false} />,
    )

    rerender(<AutoScrollHarness contentVersion={1} onResetReady={onResetReady} />)
    const viewport = getByTestId('viewport')
    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
    rerender(<AutoScrollHarness contentVersion={2} onResetReady={onResetReady} />)
    viewport.scrollTop = 200
    fireEvent.scroll(viewport)

    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 700 })
    rerender(<AutoScrollHarness contentVersion={3} onResetReady={onResetReady} />)
    expect(viewport.scrollTop).toBe(200)
  })

  it('follows content growth in the resize-observer frame and stays paused after manual scroll', () => {
    const OriginalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = ContentObserverRecorder as unknown as typeof ResizeObserver
    try {
      const onResetReady = () => {}
      const { getByTestId } = render(
        <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} />,
      )
      const viewport = getByTestId('viewport')
      setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
      const observer = ContentObserverRecorder.instances.at(-1)

      act(() => {
        observer?.trigger()
      })
      expect(viewport.scrollTop).toBe(400)

      viewport.scrollTop = 200
      fireEvent.scroll(viewport)
      setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 700 })

      act(() => {
        observer?.trigger()
      })
      expect(viewport.scrollTop).toBe(200)
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver
    }
  })

  it('restores an independent scroll position for the root and each subagent', () => {
    const onResetReady = () => {}
    const { getByTestId, rerender } = render(
      <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} viewKey="root" />,
    )
    const viewport = getByTestId('viewport')
    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
    viewport.scrollTop = 180
    fireEvent.scroll(viewport)

    rerender(<AutoScrollHarness contentVersion={1} onResetReady={onResetReady} viewKey="agent-1" />)
    expect(viewport.scrollTop).toBe(0)

    viewport.scrollTop = 70
    fireEvent.scroll(viewport)
    rerender(<AutoScrollHarness contentVersion={2} onResetReady={onResetReady} viewKey="root" />)
    expect(viewport.scrollTop).toBe(180)

    rerender(<AutoScrollHarness contentVersion={3} onResetReady={onResetReady} viewKey="agent-1" />)
    expect(viewport.scrollTop).toBe(70)
  })

  it('prefers a stable row anchor over a raw scroll offset when restoring a view', () => {
    let viewport: HTMLElement | null = null
    let currentAnchor = { offset: 12, rowKey: 'root-row' }
    const controller: ConversationScrollAnchorController = {
      captureScrollAnchor: vi.fn(() => currentAnchor),
      restoreScrollAnchor: vi.fn((anchor) => {
        if (!viewport) return false
        viewport.scrollTop = anchor.rowKey === 'root-row' ? 33 : 44
        return true
      }),
    }
    const scrollAnchorRef = { current: controller }
    const onResetReady = () => {}
    const { getByTestId, rerender } = render(
      <AutoScrollHarness
        contentVersion={0}
        onResetReady={onResetReady}
        scrollAnchorRef={scrollAnchorRef}
        viewKey="root"
      />,
    )
    viewport = getByTestId('viewport')
    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
    viewport.scrollTop = 180
    fireEvent.scroll(viewport)

    currentAnchor = { offset: 7, rowKey: 'agent-row' }
    rerender(
      <AutoScrollHarness
        contentVersion={1}
        onResetReady={onResetReady}
        scrollAnchorRef={scrollAnchorRef}
        viewKey="agent-1"
      />,
    )
    viewport.scrollTop = 70
    fireEvent.scroll(viewport)

    rerender(
      <AutoScrollHarness
        contentVersion={2}
        onResetReady={onResetReady}
        scrollAnchorRef={scrollAnchorRef}
        viewKey="root"
      />,
    )

    expect(controller.restoreScrollAnchor).toHaveBeenLastCalledWith({
      offset: 12,
      rowKey: 'root-row',
    })
    expect(viewport.scrollTop).toBe(33)
  })

  it('reopens a session at its saved offset instead of snapping to the bottom', () => {
    const onResetReady = () => {}
    const first = render(
      <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} sessionKey="restore" />,
    )
    const firstViewport = first.getByTestId('viewport')
    setScrollMetrics(firstViewport, { clientHeight: 100, scrollHeight: 500 })
    firstViewport.scrollTop = 180
    fireEvent.scroll(firstViewport)
    first.unmount()

    const second = render(
      <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} sessionKey="restore" />,
    )
    const viewport = second.getByTestId('viewport')
    expect(viewport.scrollTop).toBe(0)

    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
    second.rerender(
      <AutoScrollHarness contentVersion={1} onResetReady={onResetReady} sessionKey="restore" />,
    )
    expect(viewport.scrollTop).toBe(180)
  })

  it('reopens a session at the bottom when it was left there', () => {
    const onResetReady = () => {}
    const first = render(
      <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} sessionKey="bottom" />,
    )
    const firstViewport = first.getByTestId('viewport')
    setScrollMetrics(firstViewport, { clientHeight: 100, scrollHeight: 500 })
    first.rerender(
      <AutoScrollHarness contentVersion={1} onResetReady={onResetReady} sessionKey="bottom" />,
    )
    expect(firstViewport.scrollTop).toBe(400)
    first.unmount()

    const second = render(
      <AutoScrollHarness contentVersion={1} onResetReady={onResetReady} sessionKey="bottom" />,
    )
    const viewport = second.getByTestId('viewport')
    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
    second.rerender(
      <AutoScrollHarness contentVersion={2} onResetReady={onResetReady} sessionKey="bottom" />,
    )
    expect(viewport.scrollTop).toBe(400)
  })

  it('cancels a pending restore when the user scrolls with the wheel', () => {
    const onResetReady = () => {}
    const first = render(
      <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} sessionKey="cancel" />,
    )
    const firstViewport = first.getByTestId('viewport')
    setScrollMetrics(firstViewport, { clientHeight: 100, scrollHeight: 500 })
    firstViewport.scrollTop = 180
    fireEvent.scroll(firstViewport)
    first.unmount()

    const second = render(
      <AutoScrollHarness contentVersion={0} onResetReady={onResetReady} sessionKey="cancel" />,
    )
    const viewport = second.getByTestId('viewport')
    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })
    fireEvent.wheel(viewport)
    second.rerender(
      <AutoScrollHarness contentVersion={1} onResetReady={onResetReady} sessionKey="cancel" />,
    )
    expect(viewport.scrollTop).toBe(0)
  })
})
