import { describe, expect, it } from 'vitest'

import type { ClaudeInitializationResult, ModelProvider } from '../services/claude/claude'
import { createModelConfigurationStore } from './model-configuration-store'

const PROVIDER: ModelProvider = {
  id: 'zhipu',
  name: 'Zhipu',
  baseURL: 'https://open.bigmodel.cn/api/anthropic',
  authToken: 'secret',
  models: [{ id: 'glm-5.2', displayName: 'GLM-5.2', contextWindow: 200_000 }],
}

function initialization(
  overrides: Partial<ClaudeInitializationResult> = {},
): ClaudeInitializationResult {
  return {
    cwd: '/Users/me/project',
    commands: [],
    agents: [],
    models: [
      {
        value: 'sonnet',
        displayName: 'Claude Sonnet',
        description: '',
        providerId: 'claude',
        providerName: 'Claude',
      },
      {
        value: 'glm-5.2',
        displayName: 'GLM-5.2',
        description: '',
        providerId: 'zhipu',
        providerName: 'Zhipu',
        contextWindow: 200_000,
      },
    ],
    providers: [PROVIDER],
    modelMappings: { fallback: 'zhipu/glm-5.2' },
    hasClaudeAuthentication: true,
    hasConfiguredProviders: true,
    ...overrides,
  }
}

describe('model configuration store', () => {
  it('replaces configured providers without discarding authenticated Claude models', () => {
    const store = createModelConfigurationStore()
    store.getState().initialize(initialization())

    const nextProvider: ModelProvider = {
      ...PROVIDER,
      id: 'openai',
      name: 'OpenAI',
      models: [{ id: 'gpt-5', displayName: 'GPT-5', contextWindow: 128_000 }],
    }
    store.getState().replaceSettings([nextProvider], { fallback: 'openai/gpt-5' })

    expect(store.getState()).toMatchObject({
      providers: [nextProvider],
      modelMappings: { fallback: 'openai/gpt-5' },
      hasClaudeAuthentication: true,
      hasConfiguredProviders: true,
      availableModels: [
        expect.objectContaining({ providerId: 'claude', value: 'sonnet' }),
        expect.objectContaining({ providerId: 'openai', value: 'gpt-5' }),
      ],
    })
  })

  it('keeps the first application model snapshot when another session initializes', () => {
    const store = createModelConfigurationStore()
    store.getState().initialize(initialization())

    store.getState().initialize(
      initialization({
        models: [],
        providers: [],
        modelMappings: {},
        hasClaudeAuthentication: false,
        hasConfiguredProviders: false,
      }),
    )

    expect(store.getState()).toMatchObject({
      hasClaudeAuthentication: true,
      hasConfiguredProviders: true,
      modelMappings: { fallback: 'zhipu/glm-5.2' },
    })
    expect(store.getState().availableModels).toEqual([
      expect.objectContaining({ providerId: 'claude', value: 'sonnet' }),
      expect.objectContaining({ providerId: 'zhipu', value: 'glm-5.2' }),
    ])
  })

  it('merges SDK access state after local provider settings load first', () => {
    const store = createModelConfigurationStore()
    store.getState().replaceSettings([PROVIDER], { fallback: 'zhipu/glm-5.2' })

    store.getState().initialize(initialization())

    expect(store.getState()).toMatchObject({
      hasClaudeAuthentication: true,
      hasConfiguredProviders: true,
      isModelAccessResolved: true,
      isSdkInitializationComplete: true,
      modelMappings: { fallback: 'zhipu/glm-5.2' },
    })
    expect(store.getState().availableModels).toEqual([
      expect.objectContaining({ providerId: 'claude', value: 'sonnet' }),
      expect.objectContaining({ providerId: 'zhipu', value: 'glm-5.2' }),
    ])
  })

  it('keeps loaded provider settings when an older SDK response omits them', () => {
    const store = createModelConfigurationStore()
    store.getState().replaceSettings([], {})

    store.getState().initialize(
      initialization({
        models: [
          {
            value: 'glm-5.2',
            displayName: 'GLM-5.2',
            description: '',
            providerId: 'zhipu',
            providerName: 'Zhipu',
          },
        ],
        providers: undefined,
        modelMappings: undefined,
        hasClaudeAuthentication: undefined,
        hasConfiguredProviders: undefined,
      }),
    )

    expect(store.getState()).toMatchObject({
      isSettingsLoaded: true,
      modelMappings: {},
      providers: [],
    })
    expect(store.getState().availableModels).toEqual([
      expect.objectContaining({ providerId: 'zhipu', value: 'glm-5.2' }),
    ])
  })
})
