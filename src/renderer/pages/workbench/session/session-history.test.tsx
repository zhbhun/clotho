import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import { commandCatalog } from '../../../services/shortcuts/catalog'
import { ShortcutRuntimeProvider, createShortcutRuntime } from '../../../services/shortcuts/runtime'
import type { WorkbenchSession } from '../stores/workbench-store'
import { SessionHistoryButton } from './session-history'

const SESSION: WorkbenchSession = {
  id: 'session-1',
  claudeSessionId: 'session-1',
  project_id: 'project-1',
  project_path: '/workspace/project-1',
  created_at: 1,
  title: 'Existing conversation',
}

beforeEach(async () => {
  await appI18n.changeLanguage('en')
})

describe('SessionHistoryButton', () => {
  function renderHistoryButton({
    activeSessionId = null,
    sessions = [SESSION],
  }: {
    activeSessionId?: string | null
    sessions?: WorkbenchSession[]
  } = {}) {
    const onSelectSession = vi.fn()
    const runtime = createShortcutRuntime({
      catalog: commandCatalog,
      client: {
        async load() {
          return {}
        },
        async reset() {
          return {}
        },
        async set() {
          return {}
        },
      },
      platform: 'mac',
    })
    render(
      <ShortcutRuntimeProvider runtime={runtime}>
        <TooltipProvider>
          <SessionHistoryButton
            activeSessionId={activeSessionId}
            sessions={sessions}
            onSelectSession={onSelectSession}
          />
        </TooltipProvider>
      </ShortcutRuntimeProvider>,
    )

    return { onSelectSession }
  }

  it('opens the dropdown menu in place and selects a session from it', async () => {
    const { onSelectSession } = renderHistoryButton()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: appI18n.t('workbench.history.title') }))

    const menu = screen.getByRole('dialog', { name: appI18n.t('workbench.history.title') })
    await user.click(within(menu).getByRole('option', { name: /Existing conversation/ }))

    expect(onSelectSession).toHaveBeenCalledWith(SESSION)
  })

  it('keeps a single keyboard highlight among same-titled sessions and moves from the checked row', async () => {
    const duplicate = { ...SESSION, id: 'session-duplicate', title: SESSION.title }
    renderHistoryButton({ activeSessionId: SESSION.id, sessions: [SESSION, duplicate] })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: appI18n.t('workbench.history.title') }))

    const menu = screen.getByRole('dialog', { name: appI18n.t('workbench.history.title') })
    const highlighted = () =>
      within(menu)
        .getAllByRole('option')
        .filter((option) => option.getAttribute('aria-selected') === 'true')

    expect(highlighted()).toHaveLength(1)
    expect(highlighted()[0]).toHaveAttribute('data-value', SESSION.id)

    await user.keyboard('{ArrowDown}')

    await waitFor(() => {
      expect(highlighted()[0]).toHaveAttribute('data-value', duplicate.id)
    })
    expect(highlighted()).toHaveLength(1)
  })
})
