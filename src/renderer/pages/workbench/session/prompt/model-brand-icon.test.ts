import MoonshotIcon from '@thesvg/react/moonshot'
import OpenaiChatgptIcon from '@thesvg/react/openai-chatgpt'
import { describe, expect, it } from 'vitest'

import type { ClaudeModelInfo, ModelProvider } from '../../../../services/claude/claude'
import {
  getVisibleModelOptions,
  groupModelOptionsByProvider,
  resolveModelIconModel,
} from './model-brand-icon'

const OFFICIAL_MODEL: ClaudeModelInfo = {
  value: 'claude-sonnet-4-6',
  displayName: 'Sonnet 4.6',
  description: 'Balanced model',
  providerId: 'claude',
  providerName: 'Claude',
  contextWindow: 200_000,
  supportsEffort: true,
  supportedEffortLevels: ['low', 'medium', 'high'],
  supportsAdaptiveThinking: true,
  supportsFastMode: true,
}

const CUSTOM_MODEL: ClaudeModelInfo = {
  value: 'anthropic/claude-sonnet-4-6',
  displayName: 'Sonnet 4.6',
  description: '',
  providerId: 'openrouter',
  providerName: 'Claude',
  contextWindow: 200_000,
  supportsEffort: false,
  supportedEffortLevels: [],
  supportsAdaptiveThinking: false,
  supportsFastMode: false,
}

function makeProvider(overrides: Partial<ModelProvider>): ModelProvider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    baseURL: 'https://example.com',
    authToken: '',
    models: [],
    ...overrides,
  }
}

describe('resolveModelIconModel', () => {
  it('falls back to the preset brand for preset-provider models without a brand name', () => {
    const provider = makeProvider({
      id: 'kimi-for-coding',
      presetId: 'kimi-for-coding',
      name: 'Kimi For Coding',
    })

    expect(resolveModelIconModel('k3', 'K3', provider)?.icon).toBe(MoonshotIcon)
  })

  it('prefers the model name brand over the provider preset brand', () => {
    const provider = makeProvider({ id: 'kimi', presetId: 'kimi', name: 'Kimi' })

    expect(resolveModelIconModel('gpt-5.4', 'Gpt 5.4', provider)?.icon).toBe(OpenaiChatgptIcon)
  })

  it('keeps the fallback for custom providers without a preset', () => {
    const provider = makeProvider({ id: 'my-relay', name: 'My Relay' })

    expect(resolveModelIconModel('k3', 'K3', provider)).toBeNull()
  })

  it('keeps the fallback for aggregator presets serving multiple vendors', () => {
    const provider = makeProvider({ id: 'openrouter', presetId: 'openrouter', name: 'OpenRouter' })

    expect(resolveModelIconModel('some-model', 'Some Model', provider)).toBeNull()
  })

  it('keeps the fallback for presets whose brand has no icon', () => {
    const provider = makeProvider({ id: 'packycode', presetId: 'packycode', name: 'PackyCode' })

    expect(resolveModelIconModel('some-model', 'Some Model', provider)).toBeNull()
  })
})

describe('model picker options', () => {
  it('keeps models with the same display name when their provider IDs differ', () => {
    const visible = getVisibleModelOptions([OFFICIAL_MODEL, CUSTOM_MODEL])

    expect(visible.map(({ providerId, value }) => ({ providerId, value }))).toEqual([
      { providerId: 'claude', value: 'claude-sonnet-4-6' },
      { providerId: 'openrouter', value: 'anthropic/claude-sonnet-4-6' },
    ])
  })

  it('groups by provider ID and puts the official Claude group first', () => {
    const groups = groupModelOptionsByProvider([CUSTOM_MODEL, OFFICIAL_MODEL])

    expect(
      groups.map(({ providerId, providerName, items }) => ({
        providerId,
        providerName,
        values: items.map((item) => item.value),
      })),
    ).toEqual([
      {
        providerId: 'claude',
        providerName: 'Claude',
        values: ['claude-sonnet-4-6'],
      },
      {
        providerId: 'openrouter',
        providerName: 'Claude',
        values: ['anthropic/claude-sonnet-4-6'],
      },
    ])
  })
})
