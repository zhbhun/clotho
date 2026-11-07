import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'
import type {
  CommandCatalog,
  CommandId,
  ShortcutBinding,
  ShortcutOverrides,
} from '@/shared/shortcuts'

import { appI18n } from '../../../i18n/runtime'
import { ShortcutRuntimeProvider, createShortcutRuntime } from '../../../services/shortcuts/runtime'
import { ShortcutSettings } from './shortcut-settings'

const catalog: CommandCatalog = {
  'workbench.new': {
    title: 'New session',
    description: 'Start a new session',
    scope: ['workbench', 'settings'],
    defaultBindings: [
      { modifiers: ['primary'], key: 'n' },
      { modifiers: ['primary', 'shift'], key: 'n' },
    ],
  },
  'application.help': {
    title: 'Show help',
    description: 'Open keyboard help',
    scope: '*',
    defaultBindings: [],
  },
}

beforeEach(async () => {
  await appI18n.changeLanguage('zh-CN')
})

function createMemoryClient(initial: ShortcutOverrides = {}, failResetOnce?: CommandId) {
  let persisted = structuredClone(initial)
  let resetFailurePending = failResetOnce !== undefined
  return {
    client: {
      async load() {
        return structuredClone(persisted)
      },
      async reset(commandId: string) {
        if (resetFailurePending && commandId === failResetOnce) {
          resetFailurePending = false
          throw new Error('Unable to reset shortcuts')
        }
        delete persisted[commandId]
        return structuredClone(persisted)
      },
      async set(commandId: string, bindings: ShortcutBinding[]) {
        persisted = { ...persisted, [commandId]: structuredClone(bindings) }
        return structuredClone(persisted)
      },
    },
    getPersisted() {
      return persisted
    },
  }
}

function renderShortcutSettings(initial: ShortcutOverrides = {}, failResetOnce?: CommandId) {
  const memory = createMemoryClient(initial, failResetOnce)
  const runtime = createShortcutRuntime({ catalog, client: memory.client, platform: 'mac' })
  const view = render(
    <Toaster>
      <TooltipProvider>
        <ShortcutRuntimeProvider runtime={runtime}>
          <ShortcutSettings isActive />
        </ShortcutRuntimeProvider>
      </TooltipProvider>
    </Toaster>,
  )
  return {
    memory,
    runtime,
    ...view,
  }
}

/** Open the editor dialog of the row whose title matches, via its hover-revealed
    edit button. Must be called while the dialog is closed. */
async function openRowEditor(user: UserEvent, rowTitle: string) {
  const row = screen.getByText(rowTitle).closest('[data-slot="settings-row"]')
  expect(row).not.toBeNull()
  const editButton = within(row as HTMLElement).getByRole('button', {
    name: `编辑 ${rowTitle} 快捷键`,
  })
  await user.hover(editButton)
  await user.click(editButton)
  return screen.getByRole('dialog', { name: '编辑快捷键' })
}

describe('ShortcutSettings', () => {
  test('filters commands by title and description', async () => {
    const user = userEvent.setup()
    renderShortcutSettings()
    await screen.findByText('New session')

    await user.type(screen.getByPlaceholderText('搜索快捷键'), 'keyboard help')

    expect(screen.queryByText('New session')).not.toBeInTheDocument()
    expect(screen.getByText('Show help')).toBeInTheDocument()
  })

  test('edits one binding, deletes all bindings, and restores every default', async () => {
    const user = userEvent.setup()
    const { memory } = renderShortcutSettings()
    await screen.findByText('New session')

    // Row actions: a hover-revealed edit button opens the recorder dialog;
    // reset/delete live in the dialog footer.
    const recorder = await openRowEditor(user, 'New session')
    const cancel = within(recorder).getByRole('button', { name: '取消' })
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Enter' })
    expect(within(recorder).queryByText('Enter')).not.toBeInTheDocument()

    fireEvent.keyDown(within(recorder).getByLabelText('快捷键录制'), {
      key: 'K',
      metaKey: true,
    })
    expect(within(recorder).getByText('⌘')).toBeInTheDocument()
    expect(within(recorder).getByText('K')).toBeInTheDocument()
    await user.click(within(recorder).getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(memory.getPersisted()['workbench.new']).toEqual([
        { modifiers: ['primary'], key: 'k' },
      ]),
    )
    expect(screen.getByText('New session').closest('[data-slot="settings-row"]')).toHaveTextContent(
      '⌘K',
    )

    // Delete: reopen the editor; the footer shows Delete when a binding exists.
    const deleteDialog = await openRowEditor(user, 'New session')
    await user.click(within(deleteDialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(memory.getPersisted()['workbench.new']).toEqual([]))
    const deletedRow = screen.getByText('New session').closest('[data-slot="settings-row"]')
    expect(deletedRow).not.toBeNull()
    expect(deletedRow!.querySelector('[data-slot="kbd"]')).toBeNull()

    // Reset: the footer shows Reset only while an override exists.
    const resetDialog = await openRowEditor(user, 'New session')
    await user.click(within(resetDialog).getByRole('button', { name: '重置' }))
    await waitFor(() => expect(memory.getPersisted()).not.toHaveProperty('workbench.new'))
    const resetRow = screen.getByText('New session').closest('[data-slot="settings-row"]')
    expect(within(resetRow as HTMLElement).getByText('⌘')).toBeInTheDocument()
    expect(within(resetRow as HTMLElement).getByText('N')).toBeInTheDocument()
    expect(within(resetRow as HTMLElement).queryByText('⇧')).not.toBeInTheDocument()
  })

  test('resets every customized command to its default binding', async () => {
    const user = userEvent.setup()
    const { memory } = renderShortcutSettings({
      'application.help': [{ modifiers: ['primary'], key: 'h' }],
      'legacy.removed': [{ modifiers: ['primary'], key: 'l' }],
      'workbench.new': [{ modifiers: ['primary'], key: 'k' }],
    })

    expect(await screen.findByText('K')).toBeInTheDocument()
    expect(screen.getByText('H')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '全部重置为默认值' }))

    await waitFor(() => expect(memory.getPersisted()).toEqual({}))
    expect(screen.getByText('N')).toBeInTheDocument()
    expect(screen.queryByText('H')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '全部重置为默认值' })).toBeDisabled()
  })

  test('surfaces a bulk reset failure and allows the remaining overrides to be retried', async () => {
    const user = userEvent.setup()
    const helpBinding: ShortcutBinding[] = [{ modifiers: ['primary'], key: 'h' }]
    const { memory } = renderShortcutSettings(
      {
        'workbench.new': [{ modifiers: ['primary'], key: 'k' }],
        'application.help': helpBinding,
      },
      'application.help',
    )

    await screen.findByText('K')
    const resetAll = screen.getByRole('button', { name: '全部重置为默认值' })
    await user.click(resetAll)

    expect(await screen.findByText('快捷键全部重置失败，请重试')).toBeInTheDocument()
    expect(memory.getPersisted()).toEqual({ 'application.help': helpBinding })
    expect(resetAll).toBeEnabled()

    await user.click(resetAll)

    await waitFor(() => expect(memory.getPersisted()).toEqual({}))
    expect(resetAll).toBeDisabled()
  })
})
