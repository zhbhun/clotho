// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { ClaudeAccountInfo, ClaudeModelInfo, ModelProvider } from '@/shared/rpc'

import {
  buildModelCatalog,
  hasClaudeAuthentication,
  readClaudeModelConfiguration,
} from './model-catalog'

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
  it.each([
    [{ model: 'sonnet' }, true],
    [{ env: { ANTHROPIC_MODEL: 'glm-5.2' } }, true],
    [{ env: { ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.2' } }, true],
    [{ env: { ANTHROPIC_BASE_URL: 'https://example.com', ANTHROPIC_AUTH_TOKEN: 'secret' } }, true],
    [{ env: { ANTHROPIC_BASE_URL: 'https://example.com' } }, false],
    [{ model: ' ', env: { ANTHROPIC_MODEL: 123 } }, false],
    [{ hooks: {} }, false],
  ])(
    'detects model configuration without treating unrelated settings as models',
    async (value, expected) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'clotho-model-config-'))
      try {
        const file = path.join(dir, 'settings.json')
        expect(await readClaudeModelConfiguration(file)).toBe(false)
        await writeFile(file, JSON.stringify(value))
        expect(await readClaudeModelConfiguration(file)).toBe(expected)
        await writeFile(file, '{invalid json')
        expect(await readClaudeModelConfiguration(file)).toBe(false)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  )

  it('keeps SDK models available for a configured Claude Code without a login', () => {
    expect(buildModelCatalog(SDK_MODELS, [], undefined, true)).toMatchObject({
      hasClaudeAuthentication: false,
      models: [expect.objectContaining({ providerId: 'claude', value: 'claude-sonnet-4-6' })],
    })
  })

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
