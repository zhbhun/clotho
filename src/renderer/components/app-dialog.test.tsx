import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/shadcn/button'

import { ShortcutRuntimeProvider, shortcutRuntime } from '../services/shortcuts/runtime'
import { AppDialog, AppDialogContent } from './app-dialog'

function DialogFlow() {
  const [open, setOpen] = useState(false)

  return (
    <ShortcutRuntimeProvider runtime={shortcutRuntime}>
      <Button data-testid="origin" onClick={() => setOpen(true)} type="button">
        origin
      </Button>
      <AppDialog open={open} onOpenChange={setOpen}>
        <AppDialogContent>
          <Button data-testid="close" onClick={() => setOpen(false)} type="button">
            close
          </Button>
        </AppDialogContent>
      </AppDialog>
    </ShortcutRuntimeProvider>
  )
}

function ChainedDialogFlow() {
  const [isPickerOpen, setPickerOpen] = useState(false)
  const [isFormOpen, setFormOpen] = useState(false)

  return (
    <ShortcutRuntimeProvider runtime={shortcutRuntime}>
      <Button data-testid="origin" onClick={() => setPickerOpen(true)} type="button">
        origin
      </Button>
      <AppDialog open={isPickerOpen} onOpenChange={setPickerOpen}>
        <AppDialogContent>
          <Button
            data-testid="spawn"
            onClick={() => {
              setFormOpen(true)
              setPickerOpen(false)
            }}
            type="button"
          >
            spawn form
          </Button>
        </AppDialogContent>
      </AppDialog>
      <AppDialog open={isFormOpen} onOpenChange={setFormOpen}>
        <AppDialogContent>
          <Button data-testid="form-close" onClick={() => setFormOpen(false)} type="button">
            form close
          </Button>
        </AppDialogContent>
      </AppDialog>
    </ShortcutRuntimeProvider>
  )
}

function renderDialogFlow() {
  return render(<DialogFlow />)
}

function ClickContainerDialogFlow() {
  const [open, setOpen] = useState(false)

  // The project picker opens via a global shortcut, which never moves focus.
  useEffect(() => {
    const openOnShortcut = (event: KeyboardEvent) => {
      if (event.key === 'p') setOpen(true)
    }
    document.addEventListener('keydown', openOnShortcut)
    return () => document.removeEventListener('keydown', openOnShortcut)
  }, [])

  return (
    <ShortcutRuntimeProvider runtime={shortcutRuntime}>
      <div data-testid="shell" tabIndex={-1}>
        <Button data-testid="shell-button" type="button">
          shell button
        </Button>
      </div>
      <AppDialog open={open} onOpenChange={setOpen}>
        <AppDialogContent>
          <Button data-testid="close" onClick={() => setOpen(false)} type="button">
            close
          </Button>
        </AppDialogContent>
      </AppDialog>
    </ShortcutRuntimeProvider>
  )
}

describe('AppDialogContent', () => {
  it('restores the pre-dialog focus on escape', async () => {
    renderDialogFlow()

    const origin = screen.getByTestId('origin')
    origin.focus()
    fireEvent.click(origin)
    await screen.findByRole('dialog')
    expect(origin).not.toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(document.activeElement).toBe(origin)
  })

  it('leaves focus on the window when no element was focused before opening', async () => {
    renderDialogFlow()

    fireEvent.click(screen.getByTestId('origin'))
    await screen.findByRole('dialog')
    expect(document.activeElement).not.toBe(screen.getByTestId('origin'))

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(document.activeElement).toBe(document.body)
  })

  it('falls back to the flow origin when a chained dialog outlives its opener', async () => {
    render(<ChainedDialogFlow />)

    // The picker captures focus from the origin, then closes as the form
    // dialog opens; the form's own origin is the picker content, which is
    // already gone by the time it is dismissed.
    const origin = screen.getByTestId('origin')
    origin.focus()
    fireEvent.click(origin)
    const pickerDialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(pickerDialog.contains(document.activeElement)).toBe(true)
    })

    fireEvent.click(within(pickerDialog).getByTestId('spawn'))
    const formDialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(formDialog.contains(document.activeElement)).toBe(true)
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(document.activeElement).toBe(origin)
  })

  it('does not restore focus when dismissed with the pointer', async () => {
    const user = userEvent.setup()
    renderDialogFlow()

    const origin = screen.getByTestId('origin')
    origin.focus()
    fireEvent.click(origin)
    await screen.findByRole('dialog')

    await user.click(screen.getByTestId('close'))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(document.activeElement).not.toBe(origin)
  })

  it('never redirects focus to the first tabbable child of a click-focused container', async () => {
    // Clicking blank space focuses the nearest click-focusable ancestor (a
    // tabIndex=-1 layout container). Base UI would redirect that return target
    // to its first tabbable descendant (e.g. the sidebar toggle), so the
    // container must be focused directly instead.
    render(<ClickContainerDialogFlow />)

    const shell = screen.getByTestId('shell')
    shell.focus()
    fireEvent.keyDown(document, { key: 'p' })
    await screen.findByRole('dialog')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(document.activeElement).not.toBe(screen.getByTestId('shell-button'))
    expect(document.activeElement).toBe(shell)
  })
})
