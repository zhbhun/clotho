import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appI18n } from '../../../i18n/runtime'
import type { WorkbenchSession } from '../stores/workbench-store'
import { SessionContextMenu } from './session-context-menu'

const SESSIONS: WorkbenchSession[] = [
  {
    id: 'session-1',
    claudeSessionId: 'session-1',
    project_id: 'project-1',
    project_path: '/workspace/project-1',
    created_at: 1,
    title: 'First session',
  },
  {
    id: 'session-2',
    claudeSessionId: 'session-2',
    project_id: 'project-1',
    project_path: '/workspace/project-1',
    created_at: 2,
    title: 'Second session',
  },
  {
    id: 'session-3',
    claudeSessionId: 'session-3',
    project_id: 'project-1',
    project_path: '/workspace/project-1',
    created_at: 3,
    title: 'Third session',
  },
]

beforeEach(async () => {
  await appI18n.changeLanguage('en')
})

function renderMenu(session = SESSIONS[1], sessions = SESSIONS) {
  const onCloseSession = vi.fn()

  render(
    <SessionContextMenu
      close={{ onCloseSession, sessions }}
      isPinned={false}
      session={session}
      onDeleteSession={vi.fn()}
      onRenameSession={vi.fn()}
      onTogglePinSession={vi.fn()}
    >
      <div data-testid="session-tab">{session.title}</div>
    </SessionContextMenu>,
  )

  fireEvent.contextMenu(screen.getByTestId('session-tab'))
  return { onCloseSession }
}

describe('SessionContextMenu tab actions', () => {
  it('closes the clicked tab', async () => {
    const user = userEvent.setup()
    const { onCloseSession } = renderMenu()

    await user.click(await screen.findByRole('menuitem', { name: 'Close' }))

    expect(onCloseSession).toHaveBeenCalledOnce()
    expect(onCloseSession).toHaveBeenCalledWith(SESSIONS[1])
  })

  it('closes every tab except the clicked tab', async () => {
    const user = userEvent.setup()
    const { onCloseSession } = renderMenu()

    await user.click(await screen.findByRole('menuitem', { name: 'Close Others' }))

    expect(onCloseSession).toHaveBeenCalledTimes(2)
    expect(onCloseSession).toHaveBeenNthCalledWith(1, SESSIONS[0])
    expect(onCloseSession).toHaveBeenNthCalledWith(2, SESSIONS[2])
  })

  it('closes only tabs to the right of the clicked tab', async () => {
    const user = userEvent.setup()
    const { onCloseSession } = renderMenu(SESSIONS[0])

    await user.click(await screen.findByRole('menuitem', { name: 'Close to the Right' }))

    expect(onCloseSession).toHaveBeenCalledTimes(2)
    expect(onCloseSession).toHaveBeenNthCalledWith(1, SESSIONS[1])
    expect(onCloseSession).toHaveBeenNthCalledWith(2, SESSIONS[2])
  })

  it('closes every tab', async () => {
    const user = userEvent.setup()
    const { onCloseSession } = renderMenu()

    await user.click(await screen.findByRole('menuitem', { name: 'Close All' }))

    expect(onCloseSession).toHaveBeenCalledTimes(3)
    expect(onCloseSession).toHaveBeenNthCalledWith(1, SESSIONS[0])
    expect(onCloseSession).toHaveBeenNthCalledWith(2, SESSIONS[1])
    expect(onCloseSession).toHaveBeenNthCalledWith(3, SESSIONS[2])
  })

  it('disables Close Others when there are no other tabs', async () => {
    const user = userEvent.setup()
    const { onCloseSession } = renderMenu(SESSIONS[0], [SESSIONS[0]])
    const item = await screen.findByRole('menuitem', { name: 'Close Others' })

    expect(item).toHaveAttribute('data-disabled')
    await user.click(item)
    expect(onCloseSession).not.toHaveBeenCalled()
  })

  it('disables Close to the Right for the last tab', async () => {
    const user = userEvent.setup()
    const { onCloseSession } = renderMenu(SESSIONS[2])
    const item = await screen.findByRole('menuitem', { name: 'Close to the Right' })

    expect(item).toHaveAttribute('data-disabled')
    await user.click(item)
    expect(onCloseSession).not.toHaveBeenCalled()
  })
})
