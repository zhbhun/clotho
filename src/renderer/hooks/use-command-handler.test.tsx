import { render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { CommandCatalog } from '@/shared/shortcuts'

import { ShortcutScope } from '../components/shortcut-scope'
import { dispatchCommand } from '../services/shortcuts/dispatcher'
import { ShortcutRuntimeProvider, createShortcutRuntime } from '../services/shortcuts/runtime'
import { useCommandHandler } from './use-command-handler'

const catalog: CommandCatalog = {
  'workbench.new': {
    title: 'New session',
    scope: 'workbench',
    defaultBindings: [{ modifiers: ['primary'], key: 'n' }],
  },
}

function Feature({
  enabled,
  onRun,
  value,
}: {
  enabled: boolean
  onRun: (value: string) => void
  value: string
}) {
  useCommandHandler('workbench.new', () => onRun(value), { enabled })
  return null
}

describe('useCommandHandler', () => {
  test('keeps the handler current and removes its registration on unmount', async () => {
    const runtime = createShortcutRuntime({
      catalog,
      client: { load: vi.fn(async () => ({})), reset: vi.fn(), set: vi.fn() },
    })
    const onRun = vi.fn()
    const view = render(
      <ShortcutRuntimeProvider runtime={runtime}>
        <ShortcutScope scope="workbench.sidebar">
          <Feature enabled onRun={onRun} value="first" />
        </ShortcutScope>
      </ShortcutRuntimeProvider>,
    )

    view.rerender(
      <ShortcutRuntimeProvider runtime={runtime}>
        <ShortcutScope scope="workbench.sidebar">
          <Feature enabled onRun={onRun} value="second" />
        </ShortcutScope>
      </ShortcutRuntimeProvider>,
    )
    await expect(dispatchCommand(runtime.registry, 'workbench.new')).resolves.toBe('handled')
    expect(onRun).toHaveBeenLastCalledWith('second')

    view.unmount()
    await expect(dispatchCommand(runtime.registry, 'workbench.new')).resolves.toBe('unavailable')
  })
})
