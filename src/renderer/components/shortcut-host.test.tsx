import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { CommandCatalog, ShortcutOverrides } from '@/shared/shortcuts'

import { ShortcutRuntimeProvider, createShortcutRuntime } from '../services/shortcuts/runtime'
import { ShortcutHost } from './shortcut-host'

const catalog: CommandCatalog = {
  'workbench.new': {
    title: 'New session',
    scope: 'workbench',
    defaultBindings: [{ modifiers: ['primary'], key: 'n' }],
  },
  'workbench.comma': {
    title: 'Comma action',
    scope: 'workbench',
    defaultBindings: [{ modifiers: ['primary'], key: ',' }],
  },
  'workbench.greater': {
    title: 'Greater-than action',
    scope: 'workbench',
    defaultBindings: [{ modifiers: ['primary', 'shift'], key: '>' }],
  },
  'workbench.star': {
    title: 'Star action',
    scope: 'workbench',
    defaultBindings: [{ modifiers: ['primary', 'shift'], key: '*' }],
  },
}

function createRuntime() {
  return createShortcutRuntime({
    catalog,
    client: {
      load: vi.fn(async () => ({})),
      reset: vi.fn(async () => ({})),
      set: vi.fn(async () => ({})),
    },
    platform: 'linux',
  })
}

async function createReadyRuntime() {
  const runtime = createRuntime()
  await runtime.overrides.initialize()
  return runtime
}

describe('ShortcutHost', () => {
  test('does not enable catalog defaults before persisted overrides load', async () => {
    let resolveLoad!: (overrides: ShortcutOverrides) => void
    const load = new Promise<ShortcutOverrides>((resolve) => {
      resolveLoad = resolve
    })
    const runtime = createShortcutRuntime({
      catalog,
      client: {
        load: vi.fn(() => load),
        reset: vi.fn(async () => ({})),
        set: vi.fn(async () => ({})),
      },
      platform: 'linux',
    })
    runtime.scopes.activate('workbench')
    const handler = vi.fn()
    runtime.registry.register('workbench.new', handler)
    render(
      <ShortcutRuntimeProvider runtime={runtime}>
        <ShortcutHost />
      </ShortcutRuntimeProvider>,
    )

    fireEvent.keyDown(document, { ctrlKey: true, key: 'n' })
    expect(handler).not.toHaveBeenCalled()

    resolveLoad({})
    await act(async () => runtime.overrides.initialize())
    fireEvent.keyDown(document, { ctrlKey: true, key: 'n' })
    expect(handler).toHaveBeenCalledOnce()
  })

  test('dispatches a matching command and prevents its browser default', async () => {
    const runtime = await createReadyRuntime()
    runtime.scopes.activate('workbench')
    const handler = vi.fn()
    runtime.registry.register('workbench.new', handler)

    render(
      <ShortcutRuntimeProvider runtime={runtime}>
        <ShortcutHost />
      </ShortcutRuntimeProvider>,
    )

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'n',
      ctrlKey: true,
    })
    await act(async () => document.dispatchEvent(event))

    expect(handler).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  test('leaves guarded events untouched', async () => {
    const runtime = await createReadyRuntime()
    runtime.scopes.activate('workbench')
    const handler = vi.fn()
    runtime.registry.register('workbench.new', handler)
    const { container } = render(
      <ShortcutRuntimeProvider runtime={runtime}>
        <ShortcutHost />
        <input />
      </ShortcutRuntimeProvider>,
    )
    const input = container.querySelector('input')!

    const editableEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'n',
      ctrlKey: true,
    })
    input.dispatchEvent(editableEvent)

    fireEvent.keyDown(document, { ctrlKey: true, key: 'n', repeat: true })
    const endCapture = runtime.capture.begin()
    fireEvent.keyDown(document, { ctrlKey: true, key: 'n' })
    endCapture()

    expect(handler).not.toHaveBeenCalled()
    expect(editableEvent.defaultPrevented).toBe(false)
  })

  test('rechecks scope state before a stale listener can dispatch', async () => {
    const runtime = await createReadyRuntime()
    runtime.scopes.activate('workbench')
    const handler = vi.fn()
    runtime.registry.register('workbench.new', handler)
    render(
      <ShortcutRuntimeProvider runtime={runtime}>
        <ShortcutHost />
      </ShortcutRuntimeProvider>,
    )

    act(() => {
      runtime.scopes.activate('settings')
      fireEvent.keyDown(document, { ctrlKey: true, key: 'n' })
    })

    expect(handler).not.toHaveBeenCalled()
  })

  test.each([
    ['workbench.comma', ',', { ctrlKey: true }],
    ['workbench.greater', '>', { ctrlKey: true, shiftKey: true }],
    ['workbench.star', '*', { ctrlKey: true, shiftKey: true }],
  ] as const)('matches the literal character for %s', async (commandId, key, modifiers) => {
    const runtime = await createReadyRuntime()
    runtime.scopes.activate('workbench')
    const handler = vi.fn()
    runtime.registry.register(commandId, handler)
    render(
      <ShortcutRuntimeProvider runtime={runtime}>
        <ShortcutHost />
      </ShortcutRuntimeProvider>,
    )

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
      ...modifiers,
    })
    await act(async () => document.dispatchEvent(event))

    expect(handler).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  test('does not treat a star binding as a wildcard', async () => {
    const runtime = await createReadyRuntime()
    runtime.scopes.activate('workbench')
    const handler = vi.fn()
    runtime.registry.register('workbench.star', handler)
    render(
      <ShortcutRuntimeProvider runtime={runtime}>
        <ShortcutHost />
      </ShortcutRuntimeProvider>,
    )

    fireEvent.keyDown(document, { ctrlKey: true, key: 'x', shiftKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  test('matches primary and explicit modifiers exactly on macOS', async () => {
    const macCatalog: CommandCatalog = {
      'workbench.special': {
        title: 'Special action',
        scope: 'workbench',
        defaultBindings: [{ modifiers: ['primary', 'ctrl'], key: 'k' }],
      },
    }
    const runtime = createShortcutRuntime({
      catalog: macCatalog,
      client: {
        load: vi.fn(async () => ({})),
        reset: vi.fn(async () => ({})),
        set: vi.fn(async () => ({})),
      },
      platform: 'mac',
    })
    await runtime.overrides.initialize()
    runtime.scopes.activate('workbench')
    const handler = vi.fn()
    runtime.registry.register('workbench.special', handler)
    render(
      <ShortcutRuntimeProvider runtime={runtime}>
        <ShortcutHost />
      </ShortcutRuntimeProvider>,
    )

    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(handler).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { ctrlKey: true, key: 'k', metaKey: true })
    expect(handler).toHaveBeenCalledOnce()
  })
})
