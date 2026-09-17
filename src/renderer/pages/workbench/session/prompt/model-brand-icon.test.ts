import { describe, expect, it } from 'vitest'

import type { ClaudeModelInfo } from '../../../../services/claude/claude'
import { getVisibleModelOptions, groupModelOptionsByProvider } from './model-brand-icon'

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
