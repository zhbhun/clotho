import { describe, expect, it, vi } from 'vitest'

import type { ClaudeInitializationResult } from '../../../services/claude/claude'
import { createModelConfigurationStore } from '../../../stores/model-configuration-store'
import { startModelProbe } from './model-probe'

const INITIALIZATION: ClaudeInitializationResult = {
  cwd: '/Users/test',
  commands: [],
  agents: [],
  models: [
    {
      value: 'claude-sonnet-4-6',
      displayName: 'Claude Sonnet 4.6',
      description: '',
      providerId: 'claude',
    },
  ],
  hasClaudeAuthentication: true,
  hasConfiguredProviders: false,
}

describe('model probe', () => {
  it('refreshes login and models after an earlier successful probe', async () => {
    const store = createModelConfigurationStore()
    const startup = vi
      .fn()
      .mockResolvedValueOnce({ ...INITIALIZATION, models: [], hasClaudeAuthentication: false })
      .mockResolvedValueOnce({ ...INITIALIZATION, hasConfiguredClaudeModels: true })
    await startModelProbe(store, { startup }, 0)
    expect(store.getState().hasClaudeAuthentication).toBe(false)
    await startModelProbe(store, { startup }, 1)
    expect(store.getState()).toMatchObject({
      hasClaudeAuthentication: true,
      hasConfiguredClaudeModels: true,
      availableModels: INITIALIZATION.models,
    })
  })

  it('ignores an older probe that resolves after the repaired runtime probe', async () => {
    const store = createModelConfigurationStore()
    let finishOld!: (value: ClaudeInitializationResult) => void
    const startup = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ClaudeInitializationResult>((resolve) => {
            finishOld = resolve
          }),
      )
      .mockResolvedValueOnce(INITIALIZATION)
    const old = startModelProbe(store, { startup }, 0)
    await startModelProbe(store, { startup }, 1)
    finishOld({ ...INITIALIZATION, models: [], hasClaudeAuthentication: false })
    await old
    expect(store.getState()).toMatchObject({
      hasClaudeAuthentication: true,
      availableModels: INITIALIZATION.models,
    })
  })

  it('retries a failed probe and refreshes a successful probe after runtime repair', async () => {
    const store = createModelConfigurationStore()
    const startup = vi
      .fn()
      .mockRejectedValueOnce(new Error('CLI unavailable'))
      .mockResolvedValue(INITIALIZATION)
    await expect(startModelProbe(store, { startup }, 0)).rejects.toThrow('CLI unavailable')
    await startModelProbe(store, { startup }, 0)
    await startModelProbe(store, { startup }, 1)
    expect(startup).toHaveBeenCalledTimes(3)
  })
  it('starts one SDK probe per model store and applies its result', async () => {
    const store = createModelConfigurationStore()
    const startup = vi.fn(async () => INITIALIZATION)
    const client = { startup }

    const first = startModelProbe(store, client)
    const second = startModelProbe(store, client)

    expect(second).toBe(first)
    await first
    expect(startup).toHaveBeenCalledOnce()
    expect(store.getState()).toMatchObject({
      hasClaudeAuthentication: true,
      isSdkInitializationComplete: true,
    })
  })

  it('preserves SDK failures for the startup policy', async () => {
    const store = createModelConfigurationStore()
    const failure = new Error('Authentication expired')
    const startup = vi.fn().mockRejectedValue(failure)

    await expect(startModelProbe(store, { startup })).rejects.toBe(failure)
    expect(store.getState().isModelAccessResolved).toBe(false)
  })
})
