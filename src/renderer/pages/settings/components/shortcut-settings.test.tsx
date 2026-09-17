import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    const edit = screen.getByRole('button', { name: '编辑 New session 快捷键' })
    await user.hover(edit)
    await user.click(edit)

    const recorder = screen.getByRole('dialog', { name: '编辑快捷键' })
    const cancel = within(recorder).getByRole('button', { name: '取消' })
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Enter' })
    expect(within(recorder).queryByText('Enter')).not.toBeInTheDocument()

    fireEvent.keyDown(within(recorder).getByLabelText('快捷键录制'), {
      key: 'K',
      metaKey: true,
    })
    expect(within(recorder).getByText('⌘K')).toBeInTheDocument()
    await user.click(within(recorder).getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(memory.getPersisted()['workbench.new']).toEqual([
        { modifiers: ['primary'], key: 'k' },
      ]),
    )
    expect(screen.getByRole('row', { name: /New session/ })).toHaveTextContent('⌘K')

    await user.click(screen.getByRole('button', { name: '删除 New session 快捷键' }))
    await waitFor(() => expect(memory.getPersisted()['workbench.new']).toEqual([]))
    const deletedRow = screen.getByRole('row', { name: /New session/ })
    expect(within(deletedRow).getAllByRole('cell')[1].querySelector('[data-slot="kbd"]')).toBeNull()

    await user.click(screen.getByRole('button', { name: '重置 New session 快捷键' }))
    await waitFor(() => expect(memory.getPersisted()).not.toHaveProperty('workbench.new'))
    const resetRow = screen.getByRole('row', { name: /New session/ })
    expect(within(resetRow).getByText('⌘N')).toBeInTheDocument()
    expect(within(resetRow).queryByText('⇧⌘N')).not.toBeInTheDocument()
  })

  test('resets every customized command to its default binding', async () => {
    const user = userEvent.setup()
    const { memory } = renderShortcutSettings({
      'application.help': [{ modifiers: ['primary'], key: 'h' }],
      'legacy.removed': [{ modifiers: ['primary'], key: 'l' }],
      'workbench.new': [{ modifiers: ['primary'], key: 'k' }],
    })

    expect(await screen.findByText('⌘K')).toBeInTheDocument()
    expect(screen.getByText('⌘H')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '全部重置为默认值' }))

    await waitFor(() => expect(memory.getPersisted()).toEqual({}))
    expect(screen.getByText('⌘N')).toBeInTheDocument()
    expect(screen.queryByText('⌘H')).not.toBeInTheDocument()
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

    await screen.findByText('⌘K')
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
