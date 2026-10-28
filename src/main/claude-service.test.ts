// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

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
    sessionThinking: vi.fn(() => undefined),
    settingsEnv: vi.fn(() => ({})),
    stop: vi.fn(async () => {}),
  }
}

function createStore(settings: ClaudeskSettings) {
  const persist = vi.fn(async () => {})
  return { persist, store: createSettingsStore(settings, persist) }
}

function completeSettings(
  settings: Pick<ClaudeskSettings, 'defaultModel' | 'providers'>,
): ClaudeskSettings {
  return {
    ...settings,
    modelMappings: {},
    ...DEFAULT_APP_PREFERENCES,
    agentCapabilities: { disabledPlugins: [], disabledSkills: [], disabledMcpServers: [] },
  }
}

function createService(settings: Pick<ClaudeskSettings, 'defaultModel' | 'providers'>) {
  const proxy = createProxy()
  const { persist, store } = createStore(completeSettings(settings))
  const service = createClaudeDesktopService(createEvents(), proxy, store)
  return { persist, proxy, service, store }
}

describe('Claude desktop service settings', () => {
  test('normalizes unsupported model reasoning levels before saving', async () => {
    const { service, store } = createService({ providers: [] })
    const provider = {
      ...newProvider,
      models: [{ ...newProvider.models[0]!, reasoning: 'turbo' }],
    } as unknown as ModelProvider

    await service.createProvider({ provider })

    expect(store.get().providers[0]?.models[0]?.thinkingLevel).toBe('on')
  })

  test('reserves the Claude provider ID for authenticated first-party models', async () => {
    const { service } = createService({ providers: [] })

    await expect(
      service.createProvider({
        provider: { ...newProvider, id: 'claude', name: 'Custom Claude' },
      }),
    ).rejects.toThrow('Provider ID is reserved: claude')
  })

  test('does not refresh proxy settings when persistence fails', async () => {
    const { persist, proxy, service, store } = createService({
      providers: [existingProvider],
      defaultModel: 'zhipu/glm-5.2',
    })
    persist.mockRejectedValueOnce(new Error('disk full'))

    await expect(service.createProvider({ provider: newProvider })).rejects.toThrow('disk full')

    expect(proxy.replaceSettings).not.toHaveBeenCalled()
    expect(store.get()).toEqual({
      providers: [existingProvider],
      defaultModel: 'zhipu/glm-5.2',
      modelMappings: {},
      ...DEFAULT_APP_PREFERENCES,
      agentCapabilities: { disabledPlugins: [], disabledSkills: [], disabledMcpServers: [] },
    })
  })

  test('clears the default model that references a deleted provider', async () => {
    const { persist, proxy, service } = createService({
      providers: [existingProvider, newProvider],
      defaultModel: 'zhipu/glm-5.2',
    })

    await service.deleteProvider({ id: existingProvider.id })

    const expected = {
      providers: [newProvider],
      defaultModel: undefined,
      modelMappings: {},
      ...DEFAULT_APP_PREFERENCES,
      agentCapabilities: { disabledPlugins: [], disabledSkills: [], disabledMcpServers: [] },
    }
    expect(persist).toHaveBeenCalledWith(expected)
    expect(proxy.replaceSettings).toHaveBeenCalledWith(expected)
  })

  test('clears the default model when an edited provider removes its model', async () => {
    const { service, store } = createService({
      providers: [existingProvider],
      defaultModel: 'zhipu/glm-4.7',
    })

    await service.updateProvider({
      provider: { ...existingProvider, models: [existingProvider.models[0]!] },
    })

    expect(store.get().defaultModel).toBeUndefined()
  })

  test('rejects a default model that is not in the provider catalog', async () => {
    const { persist, service } = createService({ providers: [existingProvider] })

    await expect(service.saveDefaultModel({ defaultModel: 'zhipu/missing' })).rejects.toThrow(
      'Invalid default model',
    )
    expect(persist).not.toHaveBeenCalled()
  })

  test('saves a default model from the provider catalog', async () => {
    const { proxy, service, store } = createService({ providers: [existingProvider] })

    await expect(service.saveDefaultModel({ defaultModel: 'zhipu/glm-4.7' })).resolves.toBe(
      'zhipu/glm-4.7',
    )

    expect(store.get().defaultModel).toBe('zhipu/glm-4.7')
    expect(proxy.replaceSettings).toHaveBeenCalledWith(store.get())
  })

  test('rejects creating a provider with an existing id instead of overwriting it', async () => {
    const { persist, proxy, service, store } = createService({ providers: [existingProvider] })

    await expect(
      service.createProvider({
        provider: { ...newProvider, id: existingProvider.id },
      }),
    ).rejects.toThrow(`Provider ID already exists: ${existingProvider.id}`)

    expect(store.get().providers).toEqual([existingProvider])
    expect(persist).not.toHaveBeenCalled()
    expect(proxy.replaceSettings).not.toHaveBeenCalled()
  })

  test('persists application preferences and refreshes proxy role mappings', async () => {
    const { persist, proxy, service } = createService({
      providers: [existingProvider],
      defaultModel: 'zhipu/glm-5.2',
    })
    const preferences: AppPreferences = {
      ...DEFAULT_APP_PREFERENCES,
      language: 'zh-CN',
      appearance: { ...DEFAULT_APP_PREFERENCES.appearance, theme: 'dark' },
      modelMappings: { haiku: 'zhipu/glm-4.7' },
    }

    await expect(service.saveAppPreferences({ preferences })).resolves.toEqual(preferences)

    const expected = {
      providers: [existingProvider],
      defaultModel: 'zhipu/glm-5.2',
      ...preferences,
      agentCapabilities: { disabledPlugins: [], disabledSkills: [], disabledMcpServers: [] },
    }
    expect(persist).toHaveBeenCalledWith(expected)
    expect(proxy.replaceSettings).toHaveBeenCalledWith(expected)
  })
})

describe('Claude desktop service agent capability delegation', () => {
  /** Isolates HOME so domain modules never touch the developer's real ~/.claude. */
  async function withIsolatedHome(run: () => Promise<void>) {
    const home = await mkdtemp(path.join(tmpdir(), 'clotho-svc-'))
    const previousHome = process.env.HOME
    process.env.HOME = home
    try {
      await run()
    } finally {
      if (previousHome === undefined) delete process.env.HOME
      else process.env.HOME = previousHome
      await rm(home, { recursive: true, force: true })
    }
  }

  test('delegates subagent operations with expected args', async () => {
    await withIsolatedHome(async () => {
      const { service } = createService({ providers: [] })
      await expect(service.listAgentSubagents()).resolves.toEqual([])
      await service.saveAgentSubagent({
        subagent: { file: 'a', body: 'x' },
      })
      const listed = await service.listAgentSubagents()
      expect(listed).toHaveLength(1)
      expect(listed[0]?.file).toBe('a')
      expect(listed[0]?.body?.trim()).toBe('x')
      await service.deleteAgentSubagent({ file: 'a' })
      await expect(service.listAgentSubagents()).resolves.toEqual([])
    })
  })

  test('delegates MCP server rename as save plus delete of the old name', async () => {
    await withIsolatedHome(async () => {
      const { service } = createService({ providers: [] })
      await expect(service.listAgentMcpServers()).resolves.toEqual([])
      await service.saveAgentMcpServer({
        server: { name: 'docs', type: 'http', url: 'https://mcp.example' },
      })
      await service.saveAgentMcpServer({
        server: { name: 'docs2', type: 'http', url: 'https://mcp.example' },
        previousName: 'docs',
      })
      await expect(service.listAgentMcpServers()).resolves.toEqual([
        { name: 'docs2', type: 'http', url: 'https://mcp.example' },
      ])
    })
  })

  test('delegates hook, skill, marketplace, plugin, and workflow operations', async () => {
    await withIsolatedHome(async () => {
      const { service } = createService({ providers: [] })
      await expect(service.listAgentHookGroups()).resolves.toEqual([])
      await expect(service.listAgentSkills()).resolves.toEqual([])
      await expect(service.listAgentPlugins()).resolves.toEqual([])
      await expect(service.listAgentMarketplaces()).resolves.toEqual([])
      await expect(service.listAgentWorkflows()).resolves.toEqual([])
      await expect(service.removeAgentMarketplace({ name: 'nope' })).rejects.toThrow(
        /Unknown marketplace/,
      )
      await expect(service.removeAgentPlugin({ id: 'p@nope' })).rejects.toThrow(
        /Unknown installed plugin/,
      )
    })
  })
})
