import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import { commandCatalog } from '../../../services/shortcuts/catalog'
import { ShortcutRuntimeProvider, createShortcutRuntime } from '../../../services/shortcuts/runtime'
import type { SessionActivity, WorkbenchSession } from '../stores/workbench-store'
import { SessionHistoryPanel } from './session-history'

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

function renderHistory({
  error = null,
  isLoading = false,
  onRetry = vi.fn(),
  sessionActivity = {},
  sessions = [SESSION],
}: {
  error?: string | null
  isLoading?: boolean
  onRetry?: () => void
  sessionActivity?: Record<string, SessionActivity>
  sessions?: WorkbenchSession[]
} = {}) {
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

  const view = render(
    <ShortcutRuntimeProvider runtime={runtime}>
      <TooltipProvider>
        <SessionHistoryPanel
          activeSessionId={null}
          error={error}
          isLoading={isLoading}
          open
          sessionActivity={sessionActivity}
          sessions={sessions}
          onOpenChange={vi.fn()}
          onRetry={onRetry}
          onSelectSession={vi.fn()}
        />
      </TooltipProvider>
    </ShortcutRuntimeProvider>,
  )

  return { ...view, onRetry }
}

describe('SessionHistoryPanel', () => {
  it('keeps the history list busy without showing an empty result while sessions load', () => {
    renderHistory({ isLoading: true, sessions: [] })

    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText(appI18n.t('workbench.history.noSessions'))).not.toBeInTheDocument()
  })

  it('distinguishes an empty project history from an unmatched search', async () => {
    const { unmount } = renderHistory({ sessions: [] })

    expect(screen.getByText(appI18n.t('workbench.history.noSessions'))).toBeInTheDocument()

    unmount()
    renderHistory()
    await userEvent.type(
      screen.getByPlaceholderText(appI18n.t('workbench.history.search')),
      'missing',
    )

    expect(screen.getByText(appI18n.t('workbench.history.empty'))).toBeInTheDocument()
    expect(screen.queryByText(appI18n.t('workbench.history.noSessions'))).not.toBeInTheDocument()
  })

  it('shows a project history failure and retries it in place', async () => {
    const onRetry = vi.fn()
    renderHistory({ error: 'Project sessions failed', onRetry })

    expect(screen.getByText(appI18n.t('workbench.history.loadFailed'))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('marks each session row with its activity at the row icon', () => {
    const processingSession = { ...SESSION, id: 'session-processing', title: 'Running chat' }
    const erroredSession = { ...SESSION, id: 'session-error', title: 'Failed chat' }
    renderHistory({
      sessionActivity: {
        'session-processing': 'processing',
        'session-error': 'unread-error',
      },
      sessions: [SESSION, processingSession, erroredSession],
    })

    const items = screen.getAllByRole('option')
    const statusById = new Map(
      items.map((item) => [
        item.getAttribute('data-value'),
        item.querySelector('[data-session-status]')?.getAttribute('data-session-status'),
      ]),
    )

    expect(statusById.get('session-1')).toBeUndefined()
    expect(statusById.get('session-processing')).toBe('processing')
    expect(statusById.get('session-error')).toBe('unread-error')
  })
})
