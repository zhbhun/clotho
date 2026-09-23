import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MIN_DOCKED_SIDEBAR_WIDTH, MOBILE_BREAKPOINT, useIsMobile } from './use-mobile'

function stubViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('max-width') ? window.innerWidth < MOBILE_BREAKPOINT : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

beforeEach(() => {
  stubViewport(1024)
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
})

describe('useIsMobile', () => {
  it('collapses below the width where a third of the window fits the sidebar minimum', () => {
    expect(MOBILE_BREAKPOINT).toBe(MIN_DOCKED_SIDEBAR_WIDTH * 3)

    stubViewport(MOBILE_BREAKPOINT - 1)
    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(true)
  })

  it('keeps the sidebar docked from the derived breakpoint up', () => {
    stubViewport(MOBILE_BREAKPOINT)
    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)
  })
})
