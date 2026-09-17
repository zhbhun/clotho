import { describe, expect, it, vi } from 'vitest'

import { createSessionControllerRegistry } from './session-controller-registry'

function options(sessionId: string) {
  return {
    sessionId,
    claudeSessionId: null,
    projectId: null,
    projectPath: null,
    isHomeMode: true,
    isMockProject: false,
  }
}

describe('SessionControllerRegistry', () => {
  it('gives every session controller the same application model configuration store', () => {
    const stores: unknown[] = []
    const registry = createSessionControllerRegistry(((config: {
      modelConfigurationStore: unknown
    }) => {
      stores.push(config.modelConfigurationStore)
      return { dispose: vi.fn(), syncOptions: vi.fn() }
    }) as never)

    registry.get(options('first'))
    registry.get(options('second'))

    expect(registry.modelConfigurationStore).toBeDefined()
    expect(stores).toEqual([registry.modelConfigurationStore, registry.modelConfigurationStore])
  })

  it('manages session controllers directly', () => {
    const controller = {
      dispose: vi.fn(),
      syncOptions: vi.fn(),
    }
    const factory = vi.fn(() => controller)
    const registry = createSessionControllerRegistry(factory as never)

    const first = registry.get(options('first'))
    const attached = registry.get({ ...options('first'), projectId: 'project-1' })

    expect(first).toBe(controller)
    expect(attached).toBe(controller)
    expect(controller.syncOptions).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'first', projectId: 'project-1' }),
    )

    registry.retain(new Set())

    expect(controller.dispose).toHaveBeenCalledOnce()
  })

  it('reuses one controller per opened session and keeps other sessions alive', () => {
    const dispose = new Map<string, ReturnType<typeof vi.fn>>()
    const factory = vi.fn((config: ReturnType<typeof options>) => {
      const disposeSession = vi.fn()
      dispose.set(config.sessionId, disposeSession)
      return { dispose: disposeSession, syncOptions: vi.fn() }
    })
    const registry = createSessionControllerRegistry(factory as never)

    const first = registry.get(options('first'))
    const second = registry.get(options('second'))

    expect(registry.find('first')).toBe(first)
    expect(registry.find('missing')).toBeUndefined()
    expect(registry.get(options('first'))).toBe(first)
    expect(second).not.toBe(first)
    expect(factory).toHaveBeenCalledTimes(2)

    registry.retain(new Set(['second']))
    expect(dispose.get('first')).toHaveBeenCalledOnce()
    expect(dispose.get('second')).not.toHaveBeenCalled()
  })

  it('disposes every retained controller when the registry shuts down', () => {
    const dispose = vi.fn()
    const registry = createSessionControllerRegistry((() => ({
      dispose,
      syncOptions: vi.fn(),
    })) as never)
    registry.get(options('first'))
    registry.get(options('second'))

    registry.dispose()

    expect(dispose).toHaveBeenCalledTimes(2)
  })

  it('refreshes callbacks when an existing controller is attached to its provider', () => {
    const firstPromptStarted = vi.fn()
    const attachedPromptStarted = vi.fn()
    const registry = createSessionControllerRegistry(((
      config: ReturnType<typeof options> & {
        onPromptStarted?: (sessionId: string) => void
      },
    ) => {
      const current = { ...config }
      return {
        dispose: vi.fn(),
        syncOptions: (next: typeof current) => Object.assign(current, next),
        notifyPromptStarted: () => current.onPromptStarted?.(current.sessionId),
      }
    }) as never)

    const controller = registry.get({
      ...options('first'),
      onPromptStarted: firstPromptStarted,
    })
    registry.get({
      ...options('first'),
      onPromptStarted: attachedPromptStarted,
    })

    ;(controller as unknown as { notifyPromptStarted: () => void }).notifyPromptStarted()

    expect(firstPromptStarted).not.toHaveBeenCalled()
    expect(attachedPromptStarted).toHaveBeenCalledWith('first')
  })
})
