import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { TransientScrollArea } from './transient-scroll-area'

function startScrollbarDrag(root: HTMLElement, pointerId: number) {
  const viewport = root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')

  expect(viewport).not.toBeNull()

  ;(viewport as HTMLElement).scrollTop = 1
  fireEvent.scroll(viewport as HTMLElement)

  const scrollbar = root.querySelector<HTMLElement>('[data-slot="scroll-area-scrollbar"]')

  expect(scrollbar).not.toBeNull()

  Object.assign(scrollbar as HTMLElement, {
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
    setPointerCapture: vi.fn(),
  })
  fireEvent.pointerDown(scrollbar as HTMLElement, { button: 0, pointerId })

  return scrollbar as HTMLElement
}

it('keeps shared drag locks until every custom scrollbar drag finishes', () => {
  const previousUserSelect = document.body.style.userSelect
  const previousWebkitUserSelect = document.body.style.webkitUserSelect

  try {
    render(
      <div className="session-sidebar-layout" data-testid="layout">
        <TransientScrollArea data-testid="first-scroll-area">
          <div>First</div>
        </TransientScrollArea>
        <TransientScrollArea data-testid="second-scroll-area">
          <div>Second</div>
        </TransientScrollArea>
      </div>,
    )
    const layout = screen.getByTestId('layout')
    const firstScrollbar = startScrollbarDrag(screen.getByTestId('first-scroll-area'), 1)
    const secondScrollbar = startScrollbarDrag(screen.getByTestId('second-scroll-area'), 2)

    fireEvent.pointerUp(firstScrollbar, { button: 0, pointerId: 1 })

    expect(document.body.style.userSelect).toBe('none')
    expect(layout).toHaveAttribute('data-transient-scrollbar-dragging', 'true')

    fireEvent.pointerUp(secondScrollbar, { button: 0, pointerId: 2 })

    expect(document.body.style.userSelect).toBe(previousUserSelect)
    expect(layout).not.toHaveAttribute('data-transient-scrollbar-dragging')
  } finally {
    document.body.style.userSelect = previousUserSelect
    document.body.style.webkitUserSelect = previousWebkitUserSelect
  }
})

it('releases drag locks when the active scroll area unmounts', () => {
  const previousUserSelect = document.body.style.userSelect
  const previousWebkitUserSelect = document.body.style.webkitUserSelect

  try {
    const view = render(
      <div className="session-sidebar-layout" data-testid="layout">
        <TransientScrollArea data-testid="scroll-area">
          <div>Content</div>
        </TransientScrollArea>
      </div>,
    )
    const layout = screen.getByTestId('layout')

    startScrollbarDrag(screen.getByTestId('scroll-area'), 1)
    expect(document.body.style.userSelect).toBe('none')
    expect(layout).toHaveAttribute('data-transient-scrollbar-dragging', 'true')

    view.unmount()

    expect(document.body.style.userSelect).toBe(previousUserSelect)
    expect(layout).not.toHaveAttribute('data-transient-scrollbar-dragging')
  } finally {
    document.body.style.userSelect = previousUserSelect
    document.body.style.webkitUserSelect = previousWebkitUserSelect
  }
})

it('prevents selectable text in a sibling scroll area during a scrollbar drag', () => {
  const selectableTextStyles = document.createElement('style')
  selectableTextStyles.textContent = `
    .select-text,
    .select-text * {
      -webkit-user-select: text;
      user-select: text;
    }
  `
  document.head.append(selectableTextStyles)

  try {
    render(
      <div>
        <TransientScrollArea data-testid="sidebar-scroll-area">
          <div>Sidebar sessions</div>
        </TransientScrollArea>
        <TransientScrollArea data-testid="conversation-scroll-area">
          <div className="select-text" data-testid="conversation-text">
            Selectable conversation text
          </div>
        </TransientScrollArea>
      </div>,
    )
    const sidebarScrollArea = screen.getByTestId('sidebar-scroll-area')
    const conversationText = screen.getByTestId('conversation-text')

    expect(getComputedStyle(conversationText).userSelect).toBe('text')

    const scrollbar = startScrollbarDrag(sidebarScrollArea, 1)

    expect(getComputedStyle(conversationText).userSelect).toBe('none')

    fireEvent.pointerUp(scrollbar, { button: 0, pointerId: 1 })

    expect(getComputedStyle(conversationText).userSelect).toBe('text')
  } finally {
    selectableTextStyles.remove()
  }
})
