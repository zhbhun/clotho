import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversationAutoScroll } from './use-conversation-auto-scroll'
import { useConversationDock } from './use-conversation-dock'

const resizeObservers: TestResizeObserver[] = []
let dockHeight = 0

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

  resize(element: Element) {
    if (!this.observed.has(element)) return
    this.callback([], this as unknown as ResizeObserver)
  }
}

function DockHarness({ mode }: { mode: 'ask' | 'prompt' }) {
  const { bottomPadding, dockRef, scrollVersion } = useConversationDock(mode)

  return (
    <>
      <output data-testid="padding">{bottomPadding}</output>
      <output data-testid="version">{scrollVersion}</output>
      <div data-testid="dock" ref={dockRef} />
    </>
  )
}

function AutoScrollDockHarness({ mode }: { mode: 'ask' | 'prompt' }) {
  const { dockRef, scrollVersion } = useConversationDock(mode)
  const { viewportRef } = useConversationAutoScroll(scrollVersion)

  return (
    <>
      <div data-testid="viewport" ref={viewportRef} />
      <div data-testid="dock" ref={dockRef} />
    </>
  )
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

beforeEach(() => {
  dockHeight = 0
  resizeObservers.length = 0
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return new DOMRect(
      0,
      0,
      600,
      this instanceof HTMLElement && this.dataset.testid === 'dock' ? dockHeight : 0,
    )
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useConversationDock', () => {
  it('expands the conversation bottom padding to clear a tall dock', () => {
    render(<DockHarness mode="prompt" />)
    const dock = screen.getByTestId('dock')

    expect(screen.getByTestId('padding')).toHaveTextContent('288')

    dockHeight = 420
    act(() => resizeObservers.forEach((observer) => observer.resize(dock)))

    expect(screen.getByTestId('padding')).toHaveTextContent('432')
  })

  it('changes its scroll version when the dock switches modes at the same height', () => {
    const { rerender } = render(<DockHarness mode="prompt" />)
    const promptVersion = screen.getByTestId('version').textContent

    rerender(<DockHarness mode="ask" />)

    expect(screen.getByTestId('version').textContent).not.toBe(promptVersion)
  })

  it('follows a dock mode switch only while the user has not scrolled', () => {
    const { rerender } = render(<AutoScrollDockHarness mode="ask" />)
    const viewport = screen.getByTestId('viewport')
    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })

    rerender(<AutoScrollDockHarness mode="prompt" />)
    expect(viewport.scrollTop).toBe(400)

    viewport.scrollTop = 200
    fireEvent.wheel(viewport)
    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 700 })
    rerender(<AutoScrollDockHarness mode="ask" />)

    expect(viewport.scrollTop).toBe(200)
  })

  it('follows dock height changes only while the user has not scrolled', () => {
    render(<AutoScrollDockHarness mode="ask" />)
    const viewport = screen.getByTestId('viewport')
    const dock = screen.getByTestId('dock')
    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 500 })

    dockHeight = 420
    act(() => resizeObservers.forEach((observer) => observer.resize(dock)))
    expect(viewport.scrollTop).toBe(400)

    viewport.scrollTop = 200
    fireEvent.wheel(viewport)
    setScrollMetrics(viewport, { clientHeight: 100, scrollHeight: 700 })
    dockHeight = 520
    act(() => resizeObservers.forEach((observer) => observer.resize(dock)))

    expect(viewport.scrollTop).toBe(200)
  })
})
