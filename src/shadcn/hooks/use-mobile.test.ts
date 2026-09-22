import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useIsMobile } from './use-mobile'

function stubViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('max-width') ? window.innerWidth < 640 : false,
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
  it('treats a 640px-wide window as desktop so the sidebar stays visible', () => {
    stubViewport(640)
    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)
  })

  it('treats a window narrower than 640px as mobile', () => {
    stubViewport(639)
    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(true)
  })
})
