import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Sidebar, SidebarProvider, SidebarTrigger } from './sidebar'

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
  it('keeps the docked tree mounted below 640px so crossing the breakpoint animates like the toggle', () => {
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
