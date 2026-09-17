import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/shadcn/button'

import {
  Menu,
  MenuContent,
  MenuEmpty,
  MenuGroup,
  MenuItem,
  MenuList,
  MenuSearch,
  MenuTrigger,
} from './menu'

function TestMenu() {
  const [open, setOpen] = useState(false)

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger render={<Button />}>Open menu</MenuTrigger>
      <MenuContent>
        <MenuSearch placeholder="Search projects" />
        <MenuList>
          <MenuEmpty>No matching items</MenuEmpty>
          <MenuGroup>
            <MenuItem value="apple">Apple</MenuItem>
            <MenuItem value="banana">Banana</MenuItem>
          </MenuGroup>
        </MenuList>
      </MenuContent>
    </Menu>
  )
}

function TestPlainMenu() {
  const [open, setOpen] = useState(false)

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger render={<Button />}>Open menu</MenuTrigger>
      <MenuContent>
        <MenuList>
          <MenuItem value="apple">Apple</MenuItem>
          <MenuItem value="banana">Banana</MenuItem>
          <MenuItem value="cherry">Cherry</MenuItem>
        </MenuList>
      </MenuContent>
    </Menu>
  )
}

function TestPlainMenuWithSelected() {
  const [open, setOpen] = useState(false)

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger render={<Button />}>Open menu</MenuTrigger>
      <MenuContent>
        <MenuList>
          <MenuItem value="apple">Apple</MenuItem>
          <MenuItem value="banana" selected>
            Banana
          </MenuItem>
          <MenuItem value="cherry">Cherry</MenuItem>
        </MenuList>
      </MenuContent>
    </Menu>
  )
}

async function openMenu() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Open menu' }))
  await screen.findByRole('option', { name: 'Apple' })
  return user
}

describe('Menu', () => {
  it('filters choices and shows an empty state when no choice matches', async () => {
    render(<TestMenu />)
    const user = await openMenu()

    await user.type(screen.getByPlaceholderText('Search projects'), 'zzz')

    expect(screen.getByText('No matching items')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Apple' })).not.toBeInTheDocument()
  })

  it('closes after selecting an item', async () => {
    render(<TestMenu />)
    const user = await openMenu()

    await user.click(screen.getByRole('option', { name: 'Apple' }))

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Apple' })).not.toBeInTheDocument()
    })
  })

  it('highlights the first item on open and navigates plain menus with arrow keys', async () => {
    render(<TestPlainMenu />)
    // Let every mount-time frame run while the menu is closed; the focus must be
    // (re)applied on open, not only when the menu component first mounts.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const user = await openMenu()

    // Plain menus (no search input) place focus on the cmdk root so the keys reach it.
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute('cmdk-root')
    })
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}{ArrowDown}')

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Cherry' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })

    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Apple' })).not.toBeInTheDocument()
    })
  })

  it('keeps the initial focus on the search input for search menus', async () => {
    render(<TestMenu />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    await openMenu()

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search projects')).toHaveFocus()
    })
  })

  it('highlights the selected item on open in plain menus', async () => {
    render(<TestPlainMenuWithSelected />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    await openMenu()

    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'false')
  })

  it('moves the same highlight on hover from the selected item', async () => {
    render(<TestPlainMenuWithSelected />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    await openMenu()

    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.pointerMove(screen.getByRole('option', { name: 'Apple' }))

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'true')
    })
    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'false')
  })

  it('restarts the highlight from the selected item on reopen', async () => {
    render(<TestPlainMenuWithSelected />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    const user = await openMenu()

    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute('cmdk-root')
    })
    await user.keyboard('{ArrowDown}')
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Cherry' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Banana' })).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await screen.findByRole('option', { name: 'Banana' })

    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'Cherry' })).toHaveAttribute('aria-selected', 'false')
  })
})
