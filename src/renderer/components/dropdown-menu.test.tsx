import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/shadcn/button'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'

function TestMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>First item</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TestSelectionMenu({ onActivate }: { onActivate: (name: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem disabled onClick={() => onActivate('Disabled')}>
          Disabled item
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onActivate('Alpha')}>Alpha</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onActivate('Beta')}>Beta</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('DropdownMenuContent', () => {
  it('does not restore focus to the trigger after pointer outside closes the menu', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <TestMenu />
        <button type="button">Outside</button>
      </div>,
    )

    const trigger = screen.getByRole('button', { name: 'Open menu' })

    await user.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'First item' })).toBeInTheDocument()

    // A real browser moves focus to the clicked target on an outside press; jsdom needs this simulated,
    // otherwise focus never leaves the trigger and the restore-focus behavior cannot be tested.
    const outside = screen.getByRole('button', { name: 'Outside' })
    fireEvent.pointerDown(outside, { button: 0 })
    act(() => {
      outside.focus()
    })

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'First item' })).not.toBeInTheDocument()
    })
    expect(trigger).not.toHaveFocus()
  })

  it('restores focus to the trigger after Escape closes the menu', async () => {
    const user = userEvent.setup()
    render(<TestMenu />)

    const trigger = screen.getByRole('button', { name: 'Open menu' })

    await user.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'First item' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'First item' })).not.toBeInTheDocument()
    })
    expect(trigger).toHaveFocus()
  })

  it('highlights the first enabled item when opened with a pointer', async () => {
    const onActivate = vi.fn()
    render(<TestSelectionMenu onActivate={onActivate} />)
    // Let every mount-time frame run while the menu is closed; the item focus
    // must be (re)applied on open, not only when the menu first mounts.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    // Base UI skips item focus for pointer-opened menus, so the content wrapper
    // focuses the first enabled item itself; disabled items are skipped.
    const alpha = await screen.findByRole('menuitem', { name: 'Alpha' })
    await waitFor(() => expect(alpha).toHaveFocus())

    await user.keyboard('{ArrowDown}')
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Beta' })).toHaveFocus()
    })

    await user.keyboard('{Enter}')
    await waitFor(() => expect(onActivate).toHaveBeenCalledWith('Beta'))
  })
})
