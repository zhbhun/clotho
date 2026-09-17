// @vitest-environment node
import { describe, expect, test } from 'vitest'

import type { ModelProvider } from '@/shared/rpc'

import { isProvider } from './providers'

const provider: ModelProvider = {
  id: 'glm',
  name: 'GLM',
  baseURL: 'https://api.glm.com/anthropic',
  authToken: 'sk-xxx',
  authField: 'ANTHROPIC_AUTH_TOKEN',
  models: [{ id: 'glm-5.2[1M]', displayName: 'GLM-5.2 1M', contextWindow: 1048576 }],
}

describe('model provider validation', () => {
  test('rejects provider ids that would make model routes ambiguous', () => {
    expect(isProvider({ ...provider, id: 'bad/id' })).toBe(false)
  })

  test('accepts an optional boolean multimodal capability per model', () => {
    expect(
      isProvider({
        ...provider,
        models: [{ ...provider.models[0]!, supportsMultimodal: false }],
      }),
    ).toBe(true)
    expect(
      isProvider({
        ...provider,
        models: [{ ...provider.models[0]!, supportsMultimodal: 'yes' as unknown as boolean }],
      }),
    ).toBe(false)
  })

  test('accepts an optional reasoning level per model', () => {
    expect(
      isProvider({ ...provider, models: [{ ...provider.models[0]!, reasoning: 'xhigh' }] }),
    ).toBe(true)
    expect(
      isProvider({ ...provider, models: [{ ...provider.models[0]!, reasoning: 'turbo' }] }),
    ).toBe(false)
  })
})
