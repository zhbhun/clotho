import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UI_STORAGE_KEY } from '../services/ui-storage'
import { ResizableSidebarProvider, useSidebarResize } from './resizable-sidebar'

function Probe() {
  const resize = useSidebarResize()
  if (!resize) return null
  return (
    <div
      data-max-width={resize.maxWidth}
      data-min-width={resize.minWidth}
      data-testid="probe"
      data-width={resize.width}
    >
      <button data-testid="drag-past-max" onClick={() => resize.resize(500)} type="button" />
      <button data-testid="finish-resize" onClick={() => resize.finishResize()} type="button" />
    </div>
  )
}

function stubViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
}

function setStoredSidebarWidth(width: number) {
  window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ sidebarWidth: width }))
}

function renderProvider() {
  render(
    <ResizableSidebarProvider>
      <Probe />
    </ResizableSidebarProvider>,
  )
  return () => {
    const probe = document.querySelector('[data-testid="probe"]')
    if (!probe) throw new Error('probe not found')
    return probe
  }
}

function triggerWindowResize() {
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

function sidebarWrapper() {
  const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]')
  if (!wrapper) throw new Error('sidebar wrapper not found')
  return wrapper
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
  window.localStorage.clear()
  stubViewport(1024)
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
})

describe('ResizableSidebarProvider', () => {
  it('caps the sidebar at a third of the window width', () => {
    stubViewport(900)
    renderProvider()

    expect(document.querySelector('[data-testid="probe"]')?.getAttribute('data-max-width')).toBe(
      '300',
    )
  })

  it('keeps the absolute width cap when the window is wide', () => {
    stubViewport(1300)
    renderProvider()

    expect(document.querySelector('[data-testid="probe"]')?.getAttribute('data-max-width')).toBe(
      '400',
    )
  })

  it('compresses the stored width on a narrow window and restores it once the window grows', () => {
    setStoredSidebarWidth(400)
    stubViewport(900)
    const getProbe = renderProvider()
    expect(getProbe().getAttribute('data-width')).toBe('300')

    stubViewport(1300)
    triggerWindowResize()
    expect(getProbe().getAttribute('data-width')).toBe('400')
  })

  it('clamps a drag beyond the window third to the current max without persisting the overflow', () => {
    stubViewport(900)
    renderProvider()

    fireEvent.click(document.querySelector('[data-testid="drag-past-max"]') as HTMLButtonElement)
    expect(document.querySelector('[data-testid="probe"]')?.getAttribute('data-width')).toBe('300')

    fireEvent.click(document.querySelector('[data-testid="finish-resize"]') as HTMLButtonElement)
    expect(JSON.parse(window.localStorage.getItem(UI_STORAGE_KEY) ?? '{}').sidebarWidth).toBe(300)
  })

  it('flags window resizing during continuous resize events so width changes stay immediate', () => {
    vi.useFakeTimers()
    try {
      renderProvider()
      expect(sidebarWrapper()).not.toHaveAttribute('data-window-resizing')

      triggerWindowResize()
      expect(sidebarWrapper()).toHaveAttribute('data-window-resizing', 'true')

      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(sidebarWrapper()).not.toHaveAttribute('data-window-resizing')
    } finally {
      vi.useRealTimers()
    }
  })
})
