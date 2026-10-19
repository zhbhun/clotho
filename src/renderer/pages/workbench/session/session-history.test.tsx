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
    pinnedSessionIds,
    sessions = [SESSION],
  }: {
    activeSessionId?: string | null
    pinnedSessionIds?: ReadonlySet<string>
    sessions?: WorkbenchSession[]
  } = {}) {
    const onDeleteSession = vi.fn()
    const onRenameSession = vi.fn()
    const onSelectSession = vi.fn()
    const onTogglePinSession = vi.fn()
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
            pinnedSessionIds={pinnedSessionIds}
            sessions={sessions}
            onDeleteSession={onDeleteSession}
            onRenameSession={onRenameSession}
            onSelectSession={onSelectSession}
            onTogglePinSession={onTogglePinSession}
          />
        </TooltipProvider>
      </ShortcutRuntimeProvider>,
    )

    return { onDeleteSession, onRenameSession, onSelectSession, onTogglePinSession }
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

  it('pins a session from its row menu without selecting the row or closing the history menu', async () => {
    const { onSelectSession, onTogglePinSession } = renderHistoryButton()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: appI18n.t('workbench.history.title') }))
    await user.hover(screen.getByRole('button', { name: appI18n.t('workbench.action.more') }))

    const rowMenu = await screen.findByRole('dialog', {
      name: appI18n.t('workbench.action.more'),
    })
    await user.click(
      within(rowMenu).getByRole('option', { name: appI18n.t('workbench.action.pin') }),
    )

    expect(onTogglePinSession).toHaveBeenCalledWith(SESSION)
    expect(onSelectSession).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', { name: appI18n.t('workbench.history.title') }),
    ).toBeInTheDocument()
  })

  it('sorts pinned sessions ahead of the recency order', async () => {
    const older = { ...SESSION, id: 'session-older', title: 'Older conversation', created_at: 1 }
    const newer = { ...SESSION, id: 'session-newer', title: 'Newer conversation', created_at: 10 }
    renderHistoryButton({ pinnedSessionIds: new Set([older.id]), sessions: [newer, older] })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: appI18n.t('workbench.history.title') }))

    const menu = screen.getByRole('dialog', { name: appI18n.t('workbench.history.title') })
    const values = within(menu)
      .getAllByRole('option')
      .map((option) => option.getAttribute('data-value'))

    expect(values).toEqual([older.id, newer.id])
  })

  it('collapses archived chats behind a toggle row until it expands', async () => {
    const archived = {
      ...SESSION,
      id: 'session-archived',
      title: 'Archived conversation',
      archived: true,
    }
    const { onSelectSession } = renderHistoryButton({ sessions: [SESSION, archived] })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: appI18n.t('workbench.history.title') }))

    const menu = screen.getByRole('dialog', { name: appI18n.t('workbench.history.title') })
    expect(within(menu).getByRole('option', { name: /Existing conversation/ })).toBeInTheDocument()
    expect(within(menu).queryByRole('option', { name: /Archived conversation/ })).toBeNull()

    await user.click(within(menu).getByRole('option', { name: /Archived chats/ }))

    const archivedRow = within(menu).getByRole('option', { name: /Archived conversation/ })
    expect(archivedRow).toBeInTheDocument()
    await user.click(archivedRow)
    expect(onSelectSession).toHaveBeenCalledWith(archived)
  })
})
