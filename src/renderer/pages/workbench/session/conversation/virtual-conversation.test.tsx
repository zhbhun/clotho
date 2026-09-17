import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversationAutoScroll } from '../use-conversation-auto-scroll'
import { type VirtualConversationHandle, VirtualConversationList } from './virtual-conversation'

type TestRow = {
  key: string
  label: string
  turnId: string
}

const resizeObservers: TestResizeObserver[] = []
const rowHeights = new Map<string, number>()

class TestResizeObserver {
  private readonly callback: ResizeObserverCallback
  private readonly observed = new Set<Element>()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    resizeObservers.push(this)
  }

  disconnect() {
    this.observed.clear()
  }

  observe(element: Element) {
    this.observed.add(element)
  }

  unobserve(element: Element) {
    this.observed.delete(element)
  }

  resize(element: Element, height: number) {
    if (!this.observed.has(element)) return
    this.callback(
      [
        {
          borderBoxSize: [{ blockSize: height, inlineSize: 600 }],
          target: element,
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    )
  }
}

function resizeElement(element: Element, height: number) {
  resizeObservers.forEach((observer) => observer.resize(element, height))
}

function VirtualListHarness({
  onHandle,
  onTotalSizeChange,
  onVisibleTurnIdsChange,
  rows,
  scrollMargin,
  viewportTestId = 'viewport',
}: {
  onHandle?: (handle: VirtualConversationHandle | null) => void
  onTotalSizeChange?: (size: number) => void
  onVisibleTurnIdsChange?: (ids: Set<string>) => void
  rows: TestRow[]
  scrollMargin?: number
  viewportTestId?: string
}) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const listRef = useRef<VirtualConversationHandle>(null)

  useEffect(() => {
    onHandle?.(listRef.current)
  }, [onHandle, viewport])

  return (
    <div data-testid={viewportTestId} ref={setViewport}>
      <VirtualConversationList
        estimateSize={() => 50}
        ref={listRef}
        rows={rows}
        scrollMargin={scrollMargin}
        viewport={viewport}
        viewKey="root"
        onTotalSizeChange={onTotalSizeChange}
        onVisibleTurnIdsChange={onVisibleTurnIdsChange}
        renderRow={(row) => <button type="button">{row.label}</button>}
      />
    </div>
  )
}

function ScrollRestoreHarness({ rows, viewKey }: { rows: TestRow[]; viewKey: string }) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const listRef = useRef<VirtualConversationHandle>(null)
  const { viewportRef } = useConversationAutoScroll(rows, viewKey, listRef)
  const handleViewportRef = useCallback(
    (element: HTMLDivElement | null) => {
      viewportRef(element)
      setViewport(element)
    },
    [viewportRef],
  )

  return (
    <div data-testid="viewport" ref={handleViewportRef}>
      <VirtualConversationList
        estimateSize={(row) => rowHeights.get(row.key) ?? 50}
        key={viewKey}
        ref={listRef}
        rows={rows}
        viewport={viewport}
        viewKey={viewKey}
        renderRow={(row) => <button type="button">{row.label}</button>}
      />
    </div>
  )
}

beforeEach(() => {
  resizeObservers.length = 0
  rowHeights.clear()
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.testid === 'viewport' ? 200 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.testid === 'viewport' ? 600 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.dataset.testid === 'viewport') return 200
    const rowKey = this.dataset.conversationVirtualRow
    return rowKey ? (rowHeights.get(rowKey) ?? 50) : 50
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.testid === 'viewport' ? 600 : 600
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.testid === 'viewport' ? 5_000 : 0
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (!(this instanceof HTMLElement)) return new DOMRect(0, 0, 600, 50)
    if (this.dataset.testid === 'viewport') return new DOMRect(0, 0, 600, 200)
    const rowKey = this.dataset.conversationVirtualRow
    return new DOMRect(0, 0, 600, rowKey ? (rowHeights.get(rowKey) ?? 50) : 50)
  })
  HTMLElement.prototype.scrollTo = vi.fn(function (
    this: HTMLElement,
    optionsOrX?: ScrollToOptions | number,
    y?: number,
  ) {
    this.scrollTop =
      typeof optionsOrX === 'number' ? (y ?? this.scrollTop) : (optionsOrX?.top ?? this.scrollTop)
  }) as typeof HTMLElement.prototype.scrollTo
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('VirtualConversationList', () => {
  it('renders every row when the mounted viewport has no measurable height', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))

    render(<VirtualListHarness rows={rows} viewportTestId="zero-height-viewport" />)

    expect(document.querySelectorAll('[data-conversation-virtual-row]')).toHaveLength(rows.length)
    expect(screen.getByText('Row 0')).toBeInTheDocument()
    expect(screen.getByText('Row 99')).toBeInTheDocument()
  })

  it('mounts only the viewport window for a long conversation', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))

    render(<VirtualListHarness rows={rows} />)

    const mountedRows = document.querySelectorAll('[data-conversation-virtual-row]')
    expect(mountedRows.length).toBeGreaterThan(0)
    expect(mountedRows.length).toBeLessThan(rows.length)
  })

  it('keeps an interacted row mounted after it leaves the virtual window', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))
    render(<VirtualListHarness rows={rows} />)
    const viewport = screen.getByTestId('viewport')
    const firstRow = screen.getByText('Row 0').closest('[data-conversation-virtual-row]')

    expect(firstRow).not.toBeNull()
    fireEvent.pointerDown(firstRow as HTMLElement)
    viewport.scrollTop = 4_000
    fireEvent.scroll(viewport)

    expect(screen.getByText('Row 0')).toBeInTheDocument()
    expect(screen.getByText('Row 80')).toBeInTheDocument()
  })

  it('keeps a focused row mounted after it leaves the virtual window', () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))
    render(<VirtualListHarness rows={rows} />)
    const viewport = screen.getByTestId('viewport')
    screen.getByRole('button', { name: 'Row 0' }).focus()
    viewport.scrollTop = 4_000
    fireEvent.scroll(viewport)

    expect(screen.getByText('Row 0')).toBeInTheDocument()
    expect(screen.getByText('Row 80')).toBeInTheDocument()
  })

  it('scrolls to an unmounted turn through its stable row index', () => {
    let handle: VirtualConversationHandle | null = null
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))
    render(
      <VirtualListHarness
        rows={rows}
        onHandle={(nextHandle) => {
          handle = nextHandle
        }}
      />,
    )
    const viewport = screen.getByTestId('viewport')
    const capturedHandle = handle as VirtualConversationHandle | null

    capturedHandle?.scrollToTurn('turn-80', 'auto')

    expect(viewport.scrollTo).toHaveBeenCalledWith({ behavior: 'auto', top: 4_000 })
  })

  it('round-trips the top visible row and its intra-row offset', () => {
    let handle: VirtualConversationHandle | null = null
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))
    render(
      <VirtualListHarness
        rows={rows}
        onHandle={(nextHandle) => {
          handle = nextHandle
        }}
      />,
    )
    const viewport = screen.getByTestId('viewport')
    viewport.scrollTop = 115
    fireEvent.scroll(viewport)
    const capturedHandle = handle as VirtualConversationHandle | null

    const anchor = capturedHandle?.captureScrollAnchor()

    expect(anchor).toEqual({ offset: 15, rowKey: 'row-2' })
    expect(capturedHandle?.restoreScrollAnchor(anchor!)).toBe(true)
    expect(viewport.scrollTo).toHaveBeenLastCalledWith({ behavior: 'auto', top: 115 })
  })

  it('captures the top-visible row instead of a clamped trailing row at the bottom', () => {
    let handle: VirtualConversationHandle | null = null
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))
    render(
      <VirtualListHarness
        rows={rows}
        onHandle={(nextHandle) => {
          handle = nextHandle
        }}
      />,
    )
    const viewport = screen.getByTestId('viewport')
    viewport.scrollTop = 4_800
    fireEvent.scroll(viewport)
    const capturedHandle = handle as VirtualConversationHandle | null

    expect(capturedHandle?.captureScrollAnchor()).toEqual({ offset: 0, rowKey: 'row-96' })
  })

  it('accounts for content above the virtual list when positioning rows and turns', () => {
    let handle: VirtualConversationHandle | null = null
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))
    render(
      <VirtualListHarness
        rows={rows}
        scrollMargin={44}
        onHandle={(nextHandle) => {
          handle = nextHandle
        }}
      />,
    )
    const capturedHandle = handle as VirtualConversationHandle | null
    const firstRow = screen
      .getByText('Row 0')
      .closest<HTMLElement>('[data-conversation-virtual-row]')

    expect(firstRow).toHaveStyle({ transform: 'translate3d(0, 0px, 0)' })
    capturedHandle?.scrollToTurn('turn-80', 'auto')
    expect(screen.getByTestId('viewport').scrollTo).toHaveBeenLastCalledWith({
      behavior: 'auto',
      top: 4_044,
    })
  })

  it('restores the same root row offset after switching views and changing row heights', () => {
    const rootRows = Array.from({ length: 100 }, (_, index) => ({
      key: `root-row-${index}`,
      label: `Root row ${index}`,
      turnId: `root-turn-${index}`,
    }))
    const agentRows = Array.from({ length: 100 }, (_, index) => ({
      key: `agent-row-${index}`,
      label: `Agent row ${index}`,
      turnId: `agent-turn-${index}`,
    }))
    const { rerender } = render(<ScrollRestoreHarness rows={rootRows} viewKey="root" />)
    const viewport = screen.getByTestId('viewport')

    viewport.scrollTop = 115
    fireEvent.scroll(viewport)

    rerender(<ScrollRestoreHarness rows={agentRows} viewKey="agent" />)
    expect(viewport.scrollTop).toBe(0)
    viewport.scrollTop = 70
    fireEvent.scroll(viewport)

    rootRows.forEach((row) => rowHeights.set(row.key, 80))
    rerender(<ScrollRestoreHarness rows={rootRows} viewKey="root" />)

    expect(viewport.scrollTop).toBe(175)
  })

  it('reports the measured virtual content size', () => {
    const onTotalSizeChange = vi.fn()
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))

    render(<VirtualListHarness rows={rows} onTotalSizeChange={onTotalSizeChange} />)

    expect(onTotalSizeChange).toHaveBeenLastCalledWith(5_000)
  })

  it('updates the virtual content size when a mounted row changes height', async () => {
    const onTotalSizeChange = vi.fn()
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))
    render(<VirtualListHarness rows={rows} onTotalSizeChange={onTotalSizeChange} />)
    const firstRow = screen
      .getByText('Row 0')
      .closest<HTMLElement>('[data-conversation-virtual-row]')

    act(() => resizeElement(firstRow!, 120))

    await waitFor(() => expect(onTotalSizeChange).toHaveBeenLastCalledWith(5_070))
  })

  it('repositions later rows before a resize observer callback yields', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))
    render(<VirtualListHarness rows={rows} />)
    const firstRow = screen
      .getByText('Row 0')
      .closest<HTMLElement>('[data-conversation-virtual-row]')
    const secondRow = screen
      .getByText('Row 1')
      .closest<HTMLElement>('[data-conversation-virtual-row]')
    const initialTransform = secondRow?.style.transform

    act(() => {
      resizeElement(firstRow!, 120)
      expect(secondRow?.style.transform).not.toBe(initialTransform)
      expect(secondRow?.style.transform).toContain('120px')
    })
  })

  it('reports visible turn ids without including retained offscreen rows', async () => {
    let visibleIds = new Set<string>()
    const rows = Array.from({ length: 100 }, (_, index) => ({
      key: `row-${index}`,
      label: `Row ${index}`,
      turnId: `turn-${index}`,
    }))
    render(
      <VirtualListHarness
        rows={rows}
        onVisibleTurnIdsChange={(ids) => {
          visibleIds = ids
        }}
      />,
    )
    const viewport = screen.getByTestId('viewport')
    fireEvent.pointerDown(screen.getByText('Row 0'))
    viewport.scrollTop = 4_000
    fireEvent.scroll(viewport)

    await waitFor(() => expect(visibleIds.has('turn-80')).toBe(true))
    expect(visibleIds.has('turn-0')).toBe(false)
  })
})
