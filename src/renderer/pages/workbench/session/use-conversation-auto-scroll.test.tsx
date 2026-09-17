import { fireEvent, render } from '@testing-library/react'
import { type RefObject, useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  type ConversationScrollAnchorController,
  useConversationAutoScroll,
} from './use-conversation-auto-scroll'

function AutoScrollHarness({
  contentVersion,
  onResetReady,
  scrollAnchorRef,
  showViewport = true,
  viewKey = 'root',
}: {
  contentVersion: number
  onResetReady: (resetAutoScroll: () => void) => void
  scrollAnchorRef?: RefObject<ConversationScrollAnchorController | null>
  showViewport?: boolean
  viewKey?: string
}) {
  const { isContentScrolled, resetAutoScroll, viewportRef } = useConversationAutoScroll(
    contentVersion,
    viewKey,
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

describe('useConversationAutoScroll', () => {
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
})
