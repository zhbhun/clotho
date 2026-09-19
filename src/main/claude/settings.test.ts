// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { ModelProvider } from '@/shared/rpc'

import {
  type ClaudeskSettings,
  DEFAULT_APP_PREFERENCES,
  createSettingsStore,
  readSettings,
  writeSettings,
} from './settings'

const fsMock = vi.hoisted(() => ({
  chmod: vi.fn<(filePath: string, mode: number) => Promise<void>>(),
  mkdir: vi.fn<(directory: string, options: { recursive: boolean }) => Promise<void>>(),
  readFile: vi.fn<(filePath: string, encoding: string) => Promise<string>>(),
  rename: vi.fn<(from: string, to: string) => Promise<void>>(),
  unlink: vi.fn<(filePath: string) => Promise<void>>(),
  writeFile:
    vi.fn<
      (
        filePath: string,
        content: string,
        options: { encoding: string; flag: string; mode: number },
      ) => Promise<void>
    >(),
}))

vi.mock('node:fs', () => ({ promises: fsMock }))

const provider: ModelProvider = {
  id: 'zhipu',
  name: 'Zhipu',
  baseURL: 'https://open.bigmodel.cn/api/anthropic',
  authToken: 'provider-secret',
  models: [{ id: 'glm-5.2/fast', displayName: 'GLM 5.2 Fast', contextWindow: 200000 }],
}

function settings(overrides: Partial<ClaudeskSettings> = {}): ClaudeskSettings {
  return {
    providers: [],
    models: {},
    ...DEFAULT_APP_PREFERENCES,
    ...overrides,
  }
}

function missingFileError() {
  return Object.assign(new Error('missing'), { code: 'ENOENT' })
}

describe('Clotho settings store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fsMock.chmod.mockResolvedValue(undefined)
    fsMock.mkdir.mockResolvedValue(undefined)
    fsMock.readFile.mockRejectedValue(missingFileError())
    fsMock.rename.mockResolvedValue(undefined)
    fsMock.unlink.mockResolvedValue(undefined)
    fsMock.writeFile.mockResolvedValue(undefined)
  })

  test('keeps persisted thinking levels and defaults missing ones to on', async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        providers: [
          {
            ...provider,
            models: [
              { ...provider.models[0], thinkingLevel: 'turbo' },
              { id: 'second', displayName: 'Second', contextWindow: 200000 },
            ],
          },
        ],
        models: {},
      }),
    )

    await expect(readSettings('/test/settings.json')).resolves.toMatchObject({
      providers: [{ models: [{ thinkingLevel: 'turbo' }, { thinkingLevel: 'on' }] }],
    })
  })

  test('ignores mappings that do not resolve to a configured provider model', async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        providers: [provider],
        models: {
          sonnet: 'zhipu/glm-5.2/fast',
          opus: 'zhipu/missing',
          haiku: 'missing/glm-5.2/fast',
          subagent: '',
          unknown: 'zhipu/glm-5.2/fast',
        },
      }),
    )

    await expect(readSettings('/test/settings.json')).resolves.toEqual({
      providers: [
        {
          ...provider,
          apiType: 'anthropic-messages',
          models: [{ ...provider.models[0], thinkingLevel: 'on' }],
        },
      ],
      models: { sonnet: 'zhipu/glm-5.2/fast' },
      language: 'system',
      defaultPermissionMode: 'default',
      appearance: {
        theme: 'system',
        pointerCursor: false,
        reducedMotion: 'system',
        themePalettes: {
          dark: {
            accent: '#f5f5f5',
            background: '#0a0a0a',
            foreground: '#f5f5f5',
            preset: 'clotho',
          },
          light: {
            accent: '#171717',
            background: '#ffffff',
            foreground: '#171717',
            preset: 'clotho',
          },
        },
      },
    })
  })

  test('sanitizes durable application preferences from the settings file', async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        providers: [],
        models: {},
        language: 'zh-CN',
        defaultPermissionMode: 'default',
        appearance: {
          theme: 'dark',
          pointerCursor: true,
          reducedMotion: 'no-preference',
          themePalettes: {
            dark: {
              accent: '#ff79c6',
              background: '#282a36',
              foreground: '#f8f8f2',
              preset: 'dracula',
            },
            light: {
              accent: '#171717',
              background: '#ffffff',
              foreground: '#171717',
              preset: 'clotho',
            },
          },
        },
      }),
    )

    await expect(readSettings('/test/settings.json')).resolves.toMatchObject({
      language: 'zh-CN',
      defaultPermissionMode: 'default',
      appearance: {
        theme: 'dark',
        pointerCursor: true,
        reducedMotion: 'no-preference',
        themePalettes: {
          dark: { preset: 'dracula' },
          light: { preset: 'clotho' },
        },
      },
    })
  })

  test('rejects unreadable settings instead of treating them as defaults', async () => {
    fsMock.readFile.mockResolvedValue('{invalid json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(readSettings('/test/settings.json')).rejects.toBeInstanceOf(SyntaxError)

    warn.mockRestore()
  })

  test('rejects a non-object settings document instead of treating it as defaults', async () => {
    fsMock.readFile.mockResolvedValue('[]')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(readSettings('/test/settings.json')).rejects.toThrow(
      'Clotho settings must be a JSON object',
    )

    warn.mockRestore()
  })

  test('atomically writes settings with private permissions', async () => {
    const file = '/test/.clotho/settings.json'
    const value: ClaudeskSettings = settings({
      providers: [provider],
      models: { haiku: 'zhipu/glm-5.2/fast' },
    })

    await writeSettings(value, file)

    expect(fsMock.mkdir).toHaveBeenCalledWith('/test/.clotho', { recursive: true })
    const [temporary, content, options] = fsMock.writeFile.mock.calls[0]!
    expect(content).toBe(`${JSON.stringify(value, null, 2)}\n`)
    expect(options).toEqual({ encoding: 'utf8', flag: 'wx', mode: 0o600 })
    expect(fsMock.rename).toHaveBeenCalledWith(temporary, file)
    expect(fsMock.chmod).toHaveBeenCalledWith(file, 0o600)
    expect(fsMock.unlink).toHaveBeenCalledWith(temporary)
  })

  test('serializes updates against the latest persisted settings snapshot', async () => {
    const persist = vi.fn(async () => {})
    const store = createSettingsStore(settings(), persist)

    await Promise.all([
      store.update((current) => ({ ...current, providers: [provider] })),
      store.update((current) => ({
        ...current,
        models: { sonnet: 'zhipu/glm-5.2/fast' },
      })),
    ])

    expect(store.get()).toEqual({
      providers: [provider],
      models: { sonnet: 'zhipu/glm-5.2/fast' },
      ...DEFAULT_APP_PREFERENCES,
    })
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist).toHaveBeenLastCalledWith({
      providers: [provider],
      models: { sonnet: 'zhipu/glm-5.2/fast' },
      ...DEFAULT_APP_PREFERENCES,
    })
  })

  test('rolls back a rejected update and continues processing queued updates', async () => {
    const persist = vi
      .fn<(settings: ClaudeskSettings) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined)
    const store = createSettingsStore(settings(), persist)

    const rejected = store.update((current) => ({
      ...current,
      models: { sonnet: 'zhipu/glm-5.2/fast' },
    }))
    const queued = store.update((current) => ({ ...current, providers: [provider] }))

    await expect(rejected).rejects.toThrow('disk full')
    await expect(queued).resolves.toEqual(settings({ providers: [provider], models: {} }))
    expect(store.get()).toEqual(settings({ providers: [provider], models: {} }))
  })

  test('rebases the first update onto recovered settings after a startup read failure', async () => {
    const recovered = settings({
      providers: [provider],
      models: { sonnet: 'zhipu/glm-5.2/fast' },
      language: 'zh-CN',
    })
    const persist = vi.fn(async () => {})
    const recover = vi.fn(async () => recovered)
    const store = createSettingsStore(settings(), persist, recover)

    await store.update((current) => ({ ...current, language: 'fr' }))

    expect(recover).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith({ ...recovered, language: 'fr' })
    expect(store.get()).toEqual({ ...recovered, language: 'fr' })
  })
})
