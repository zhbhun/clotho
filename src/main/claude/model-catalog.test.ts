// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { ClaudeAccountInfo, ClaudeModelInfo, ModelProvider } from '@/shared/rpc'

import { buildModelCatalog, hasClaudeAuthentication } from './model-catalog'

const SDK_MODELS: ClaudeModelInfo[] = [
  { value: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6', description: 'Balanced' },
]

const PROVIDERS: ModelProvider[] = [
  {
    id: 'zhipu',
    name: 'Zhipu GLM',
    baseURL: 'https://open.bigmodel.cn/api/anthropic',
    authToken: 'secret',
    models: [{ id: 'glm-5.2', displayName: 'GLM 5.2', contextWindow: 200_000 }],
  },
]

describe('model catalog', () => {
  it.each<ClaudeAccountInfo | undefined>([
    undefined,
    { apiProvider: 'firstParty', tokenSource: 'none', apiKeySource: 'none' },
    { apiProvider: 'bedrock', tokenSource: 'oauth' },
  ])('does not treat an unavailable first-party credential as Claude login', (account) => {
    expect(hasClaudeAuthentication(account)).toBe(false)
  })

  it.each<ClaudeAccountInfo>([
    { apiProvider: 'firstParty', tokenSource: 'oauth' },
    { apiProvider: 'firstParty', tokenSource: 'none', apiKeySource: 'ANTHROPIC_API_KEY' },
  ])('recognizes a usable first-party credential as Claude login', (account) => {
    expect(hasClaudeAuthentication(account)).toBe(true)
  })

  it('keeps authenticated Claude models first and appends configured providers', () => {
    expect(
      buildModelCatalog(SDK_MODELS, PROVIDERS, {
        apiProvider: 'firstParty',
        tokenSource: 'oauth',
      }),
    ).toEqual({
      hasClaudeAuthentication: true,
      hasConfiguredProviders: true,
      models: [
        {
          value: 'claude-sonnet-4-6',
          displayName: 'Sonnet 4.6',
          description: 'Balanced',
          providerId: 'claude',
          providerName: 'Claude',
        },
        {
          value: 'glm-5.2',
          displayName: 'GLM 5.2',
          description: '',
          providerId: 'zhipu',
          providerName: 'Zhipu GLM',
          contextWindow: 200_000,
        },
      ],
    })
  })

  it('hides Claude models while preserving the configured-provider signal', () => {
    expect(
      buildModelCatalog(SDK_MODELS, PROVIDERS, {
        apiProvider: 'firstParty',
        tokenSource: 'none',
        apiKeySource: 'none',
      }),
    ).toMatchObject({
      hasClaudeAuthentication: false,
      hasConfiguredProviders: true,
      models: [expect.objectContaining({ providerId: 'zhipu', value: 'glm-5.2' })],
    })
  })
})
