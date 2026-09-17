// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'

import type { AppPreferences, ModelProvider } from '@/shared/rpc'

import { createClaudeDesktopService } from './claude-service'
import type { ModelProxy } from './claude/model-proxy'
import type { ClaudeEventSink } from './claude/runner'
import {
  type ClaudeskSettings,
  DEFAULT_APP_PREFERENCES,
  createSettingsStore,
} from './claude/settings'

const existingProvider: ModelProvider = {
  id: 'zhipu',
  name: 'Zhipu',
  baseURL: 'https://open.bigmodel.cn/api/anthropic',
  authToken: 'zhipu-secret',
  authField: 'ANTHROPIC_AUTH_TOKEN',
  models: [
    { id: 'glm-5.2', displayName: 'GLM 5.2', contextWindow: 200000 },
    { id: 'glm-4.7', displayName: 'GLM 4.7', contextWindow: 128000 },
  ],
}

const newProvider: ModelProvider = {
  id: 'minimax',
  name: 'MiniMax',
  baseURL: 'https://api.minimax.io/anthropic',
  authToken: 'minimax-secret',
  authField: 'ANTHROPIC_AUTH_TOKEN',
  models: [{ id: 'MiniMax-M2.7', displayName: 'MiniMax M2.7', contextWindow: 200000 }],
}

function createEvents(): ClaudeEventSink {
  return {
    onOutput: vi.fn(),
    onError: vi.fn(),
    onComplete: vi.fn(),
    onToolRequest: vi.fn(),
  }
}

function createProxy(): ModelProxy {
  return {
    baseURL: 'http://127.0.0.1:43123',
    authToken: 'local-secret',
    replaceSettings: vi.fn(),
    settingsEnv: vi.fn(() => ({})),
    stop: vi.fn(async () => {}),
  }
}

function createStore(settings: ClaudeskSettings) {
  const persist = vi.fn(async () => {})
  return { persist, store: createSettingsStore(settings, persist) }
}

function completeSettings(
  settings: Pick<ClaudeskSettings, 'models' | 'providers'>,
): ClaudeskSettings {
  return { ...settings, ...DEFAULT_APP_PREFERENCES }
}

function createService(settings: Pick<ClaudeskSettings, 'models' | 'providers'>) {
  const proxy = createProxy()
  const { persist, store } = createStore(completeSettings(settings))
  const service = createClaudeDesktopService(createEvents(), proxy, store)
  return { persist, proxy, service, store }
}

describe('Claude desktop service settings', () => {
  test('normalizes an unsupported model reasoning level to high before saving', async () => {
    const { service, store } = createService({ providers: [], models: {} })
    const provider = {
      ...newProvider,
      models: [{ ...newProvider.models[0]!, reasoning: 'turbo' }],
    } as unknown as ModelProvider

    await service.createProvider({ provider })

    expect(store.get().providers[0]?.models[0]?.reasoning).toBe('high')
  })

  test('reserves the Claude provider ID for authenticated first-party models', async () => {
    const { service } = createService({ providers: [], models: {} })

    await expect(
      service.createProvider({
        provider: { ...newProvider, id: 'claude', name: 'Custom Claude' },
      }),
    ).rejects.toThrow('Provider ID is reserved: claude')
  })

  test('does not refresh proxy settings when persistence fails', async () => {
    const { persist, proxy, service, store } = createService({
      providers: [existingProvider],
      models: { sonnet: 'zhipu/glm-5.2' },
    })
    persist.mockRejectedValueOnce(new Error('disk full'))

    await expect(service.createProvider({ provider: newProvider })).rejects.toThrow('disk full')

    expect(proxy.replaceSettings).not.toHaveBeenCalled()
    expect(store.get()).toEqual({
      providers: [existingProvider],
      models: { sonnet: 'zhipu/glm-5.2' },
      ...DEFAULT_APP_PREFERENCES,
    })
  })

  test('clears mappings that reference a deleted provider', async () => {
    const { persist, proxy, service } = createService({
      providers: [existingProvider, newProvider],
      models: {
        sonnet: 'zhipu/glm-5.2',
        haiku: 'minimax/MiniMax-M2.7',
      },
    })

    await service.deleteProvider({ id: existingProvider.id })

    const expected = {
      providers: [newProvider],
      models: { haiku: 'minimax/MiniMax-M2.7' },
      ...DEFAULT_APP_PREFERENCES,
    }
    expect(persist).toHaveBeenCalledWith(expected)
    expect(proxy.replaceSettings).toHaveBeenCalledWith(expected)
  })

  test('clears mappings when an edited provider removes their model', async () => {
    const { service, store } = createService({
      providers: [existingProvider],
      models: {
        sonnet: 'zhipu/glm-5.2',
        haiku: 'zhipu/glm-4.7',
      },
    })

    await service.updateProvider({
      provider: { ...existingProvider, models: [existingProvider.models[0]!] },
    })

    expect(store.get().models).toEqual({ sonnet: 'zhipu/glm-5.2' })
  })

  test('rejects a model mapping that is not in the provider catalog', async () => {
    const { persist, service } = createService({
      providers: [existingProvider],
      models: {},
    })

    await expect(service.saveModelMappings({ models: { opus: 'zhipu/missing' } })).rejects.toThrow(
      'Invalid model mapping',
    )
    expect(persist).not.toHaveBeenCalled()
  })

  test('rejects creating a provider with an existing id instead of overwriting it', async () => {
    const { persist, proxy, service, store } = createService({
      providers: [existingProvider],
      models: {},
    })

    await expect(
      service.createProvider({
        provider: { ...newProvider, id: existingProvider.id },
      }),
    ).rejects.toThrow(`Provider ID already exists: ${existingProvider.id}`)

    expect(store.get().providers).toEqual([existingProvider])
    expect(persist).not.toHaveBeenCalled()
    expect(proxy.replaceSettings).not.toHaveBeenCalled()
  })

  test('persists application preferences without changing model proxy settings', async () => {
    const { persist, proxy, service } = createService({
      providers: [existingProvider],
      models: { sonnet: 'zhipu/glm-5.2' },
    })
    const preferences: AppPreferences = {
      ...DEFAULT_APP_PREFERENCES,
      language: 'zh-CN',
      appearance: { ...DEFAULT_APP_PREFERENCES.appearance, theme: 'dark' },
    }

    await expect(service.saveAppPreferences({ preferences })).resolves.toEqual(preferences)

    expect(persist).toHaveBeenCalledWith({
      providers: [existingProvider],
      models: { sonnet: 'zhipu/glm-5.2' },
      ...preferences,
    })
    expect(proxy.replaceSettings).not.toHaveBeenCalled()
  })
})
