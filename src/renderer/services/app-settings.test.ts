import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_APPEARANCE_PREFERENCES, createAppSettingsService } from './app-settings'

describe('app settings persistence', () => {
  it('loads settings from the desktop store and persists complete preference snapshots', async () => {
    const saved: unknown[] = []
    const service = createAppSettingsService({
      load: async () => ({
        language: 'system',
        defaultPermissionMode: 'acceptEdits',
        appearance: {
          ...DEFAULT_APPEARANCE_PREFERENCES,
          theme: 'light',
        },
      }),
      save: async (preferences) => {
        saved.push(preferences)
        return preferences
      },
    })
    const preferences = {
      theme: 'dark' as const,
      pointerCursor: true,
      reducedMotion: 'reduce' as const,
      themePalettes: DEFAULT_APPEARANCE_PREFERENCES.themePalettes,
    }

    await service.initialize()
    service.saveAppearancePreferences(preferences)
    service.saveLanguagePreference('fr')
    await service.flush()

    expect(service.get()).toEqual({
      defaultPermissionMode: 'acceptEdits',
      language: 'fr',
      appearance: preferences,
    })
    expect(saved).toHaveLength(1)
    expect(saved.at(-1)).toEqual(service.get())
  })

  it('rebases changed fields onto disk settings after a transient load failure', async () => {
    const diskPreferences = {
      language: 'es' as const,
      defaultPermissionMode: 'bypassPermissions' as const,
      appearance: {
        ...DEFAULT_APPEARANCE_PREFERENCES,
        theme: 'light' as const,
      },
    }
    let loadAttempts = 0
    const saved: unknown[] = []
    const service = createAppSettingsService({
      load: async () => {
        loadAttempts += 1
        if (loadAttempts === 1) throw new Error('RPC unavailable')
        return diskPreferences
      },
      save: async (preferences) => {
        saved.push(preferences)
        return preferences
      },
    })

    await service.initialize()
    service.saveLanguagePreference('fr')
    await service.flush()

    expect(saved).toEqual([
      {
        ...diskPreferences,
        language: 'fr',
      },
    ])
    expect(service.get()).toEqual(saved[0])
  })

  it('restores the last saved value after a persistence failure', async () => {
    const save = vi.fn(async () => {
      throw new Error('Disk write failed')
    })
    const service = createAppSettingsService({
      load: async () => ({
        language: 'system',
        defaultPermissionMode: 'acceptEdits',
        appearance: DEFAULT_APPEARANCE_PREFERENCES,
      }),
      save,
    })

    await service.initialize()
    await expect(service.saveLanguagePreference('fr')).rejects.toThrow('Disk write failed')

    await service.flush()

    expect(service.loadLanguagePreference()).toBe('system')
    expect(save).toHaveBeenCalledOnce()
  })

  it('returns persistence failures to the setting that triggered the write', async () => {
    const service = createAppSettingsService({
      load: async () => ({
        language: 'system',
        defaultPermissionMode: 'acceptEdits',
        appearance: DEFAULT_APPEARANCE_PREFERENCES,
      }),
      save: async () => {
        throw new Error('Disk write failed')
      },
    })

    await service.initialize()

    await expect(service.saveLanguagePreference('fr')).rejects.toThrow('Disk write failed')
  })
})
