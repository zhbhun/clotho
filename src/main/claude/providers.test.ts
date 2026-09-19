// @vitest-environment node
import { describe, expect, test } from 'vitest'

import type { ModelProvider } from '@/shared/rpc'

import { isProvider } from './providers'

const provider: ModelProvider = {
  id: 'glm',
  name: 'GLM',
  baseURL: 'https://api.glm.com/anthropic',
  authToken: 'sk-xxx',
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

  test('accepts any thinking level string per model', () => {
    expect(
      isProvider({ ...provider, models: [{ ...provider.models[0]!, thinkingLevel: 'xhigh' }] }),
    ).toBe(true)
    expect(
      isProvider({ ...provider, models: [{ ...provider.models[0]!, thinkingLevel: 'turbo' }] }),
    ).toBe(true)
    expect(
      isProvider({ ...provider, models: [{ ...provider.models[0]!, thinkingLevel: '  ' }] }),
    ).toBe(false)
  })

  test('accepts an optional reasoning preset reference per model', () => {
    expect(
      isProvider({
        ...provider,
        models: [{ ...provider.models[0]!, thinkingPresetId: 'glm-5-3' }],
      }),
    ).toBe(true)
  })

  test('accepts a known api type and rejects an unknown one', () => {
    expect(isProvider({ ...provider, apiType: 'chat-completions' })).toBe(true)
    expect(isProvider({ ...provider, apiType: 'openai' })).toBe(false)
  })
})
