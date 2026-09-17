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
