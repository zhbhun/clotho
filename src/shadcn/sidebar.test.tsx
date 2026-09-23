import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MOBILE_BREAKPOINT } from './hooks/use-mobile'
import { Sidebar, SidebarProvider, SidebarTrigger } from './sidebar'

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
  stubViewport(1200)
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })
})

function renderSidebar() {
  render(
    <SidebarProvider>
      <SidebarTrigger />
      <Sidebar collapsible="offcanvas">
        <div>content</div>
      </Sidebar>
    </SidebarProvider>,
  )
}

describe('Sidebar', () => {
  it('keeps the docked tree mounted below the breakpoint so crossing it animates like the toggle', () => {
    stubViewport(500)
    renderSidebar()

    const container = document.querySelector('[data-slot="sidebar-container"]')
    expect(container).not.toBeNull()
    expect(container).toHaveAttribute('inert')
    expect(document.querySelector('[data-slot="sidebar-gap"]')).toHaveClass('w-0')

    fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))
    expect(container).not.toHaveAttribute('inert')
  })
})
