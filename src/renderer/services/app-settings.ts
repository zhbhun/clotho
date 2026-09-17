import type {
  AppDefaultPermissionMode,
  AppPreferences,
  AppReducedMotionPreference,
  AppTheme,
} from '@/shared/rpc'

import { LANGUAGE_PREFERENCES, type LanguagePreference } from '../i18n/languages'
import { isDesktopRuntime, requestFromDesktop } from './desktop/client'
import {
  DEFAULT_THEME_PALETTES,
  type ThemePalettes,
  isThemePalettes,
  resolveThemePalettes,
} from './theme-presets'

export const CONFIGURABLE_PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'auto',
  'plan',
  'bypassPermissions',
] as const
export type ConfigurablePermissionMode = AppDefaultPermissionMode
export const DEFAULT_PERMISSION_MODE: ConfigurablePermissionMode = 'default'

export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'system'

export const REDUCED_MOTION_PREFERENCES = ['system', 'reduce', 'no-preference'] as const
export type ReducedMotionPreference = AppReducedMotionPreference

export type AppearancePreferences = {
  theme: AppTheme
  pointerCursor: boolean
  reducedMotion: ReducedMotionPreference
  themePalettes: ThemePalettes
}

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  theme: 'system',
  pointerCursor: false,
  reducedMotion: 'system',
  themePalettes: DEFAULT_THEME_PALETTES,
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  language: DEFAULT_LANGUAGE_PREFERENCE,
  defaultPermissionMode: DEFAULT_PERMISSION_MODE,
  appearance: DEFAULT_APPEARANCE_PREFERENCES,
}

export type AppSettingsClient = {
  load: () => Promise<AppPreferences>
  save: (preferences: AppPreferences) => Promise<AppPreferences>
}

function isConfigurablePermissionMode(value: unknown): value is ConfigurablePermissionMode {
  return CONFIGURABLE_PERMISSION_MODES.includes(value as ConfigurablePermissionMode)
}

function isReducedMotionPreference(value: unknown): value is ReducedMotionPreference {
  return REDUCED_MOTION_PREFERENCES.includes(value as ReducedMotionPreference)
}

function isLanguagePreference(value: unknown): value is LanguagePreference {
  return LANGUAGE_PREFERENCES.includes(value as LanguagePreference)
}

function isTheme(value: unknown): value is AppTheme {
  return value === 'dark' || value === 'light' || value === 'system'
}

function sanitizePreferences(value: unknown): AppPreferences {
  const candidate =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const appearance =
    candidate.appearance &&
    typeof candidate.appearance === 'object' &&
    !Array.isArray(candidate.appearance)
      ? (candidate.appearance as Record<string, unknown>)
      : {}

  return {
    language: isLanguagePreference(candidate.language)
      ? candidate.language
      : DEFAULT_LANGUAGE_PREFERENCE,
    defaultPermissionMode: isConfigurablePermissionMode(candidate.defaultPermissionMode)
      ? candidate.defaultPermissionMode
      : DEFAULT_PERMISSION_MODE,
    appearance: {
      theme: isTheme(appearance.theme) ? appearance.theme : DEFAULT_APPEARANCE_PREFERENCES.theme,
      pointerCursor:
        typeof appearance.pointerCursor === 'boolean'
          ? appearance.pointerCursor
          : DEFAULT_APPEARANCE_PREFERENCES.pointerCursor,
      reducedMotion: isReducedMotionPreference(appearance.reducedMotion)
        ? appearance.reducedMotion
        : DEFAULT_APPEARANCE_PREFERENCES.reducedMotion,
      themePalettes: isThemePalettes(appearance.themePalettes)
        ? resolveThemePalettes(appearance.themePalettes)
        : DEFAULT_APPEARANCE_PREFERENCES.themePalettes,
    },
  }
}

function clonePreferences(preferences: AppPreferences): AppPreferences {
  return {
    ...preferences,
    appearance: {
      ...preferences.appearance,
      themePalettes: {
        dark: { ...preferences.appearance.themePalettes.dark },
        light: { ...preferences.appearance.themePalettes.light },
      },
    },
  }
}

export function createAppSettingsService(client: AppSettingsClient) {
  let current = clonePreferences(DEFAULT_APP_PREFERENCES)
  let confirmed = clonePreferences(DEFAULT_APP_PREFERENCES)
  let hasLoaded = false
  let write: Promise<void> | undefined
  const dirtyFields = new Set<keyof AppPreferences>()

  const mergeDirtyFields = (base: AppPreferences) => ({
    language: dirtyFields.has('language') ? current.language : base.language,
    defaultPermissionMode: dirtyFields.has('defaultPermissionMode')
      ? current.defaultPermissionMode
      : base.defaultPermissionMode,
    appearance: dirtyFields.has('appearance') ? current.appearance : base.appearance,
  })

  const writeDirtyFields = async () => {
    if (!hasLoaded) {
      confirmed = clonePreferences(sanitizePreferences(await client.load()))
      current = clonePreferences(mergeDirtyFields(confirmed))
      hasLoaded = true
    }

    while (dirtyFields.size) {
      dirtyFields.clear()
      const snapshot = clonePreferences(current)
      try {
        const saved = sanitizePreferences(await client.save(snapshot))
        confirmed = clonePreferences(saved)
        current = clonePreferences(mergeDirtyFields(saved))
      } catch (caught) {
        dirtyFields.clear()
        current = clonePreferences(confirmed)
        throw caught
      }
    }
  }

  const startWrite = () => {
    if (write) return write
    const pending = Promise.resolve().then(writeDirtyFields)
    write = pending
    void pending
      .finally(() => {
        if (write === pending) write = undefined
      })
      .catch(() => undefined)
    return pending
  }

  const persist = (field: keyof AppPreferences) => {
    dirtyFields.add(field)
    return startWrite()
  }

  return {
    async initialize() {
      try {
        current = sanitizePreferences(await client.load())
        confirmed = clonePreferences(current)
        hasLoaded = true
      } catch {
        current = clonePreferences(DEFAULT_APP_PREFERENCES)
        confirmed = clonePreferences(DEFAULT_APP_PREFERENCES)
        hasLoaded = false
      }
      return this.get()
    },
    get() {
      return clonePreferences(current)
    },
    loadDefaultPermissionMode() {
      return current.defaultPermissionMode
    },
    saveDefaultPermissionMode(permissionMode: ConfigurablePermissionMode) {
      if (!isConfigurablePermissionMode(permissionMode)) return Promise.resolve()
      current = { ...current, defaultPermissionMode: permissionMode }
      return persist('defaultPermissionMode')
    },
    loadLanguagePreference() {
      return current.language as LanguagePreference
    },
    saveLanguagePreference(language: LanguagePreference) {
      if (!isLanguagePreference(language)) return Promise.resolve()
      current = { ...current, language }
      return persist('language')
    },
    loadAppearancePreferences(): AppearancePreferences {
      return {
        ...current.appearance,
        themePalettes: {
          dark: { ...current.appearance.themePalettes.dark },
          light: { ...current.appearance.themePalettes.light },
        } as ThemePalettes,
      }
    },
    saveAppearancePreferences(preferences: AppearancePreferences) {
      current = sanitizePreferences({ ...current, appearance: preferences })
      return persist('appearance')
    },
    async flush() {
      while (write || dirtyFields.size) await (write ?? startWrite())
    },
  }
}

const desktopSettingsClient: AppSettingsClient = {
  async load() {
    if (!isDesktopRuntime()) return DEFAULT_APP_PREFERENCES
    return requestFromDesktop('appGetPreferences', {})
  },
  async save(preferences) {
    if (!isDesktopRuntime()) return preferences
    return requestFromDesktop('appSavePreferences', { preferences })
  },
}

let appSettings = createAppSettingsService(desktopSettingsClient)

export function initializeAppSettings(client: AppSettingsClient = desktopSettingsClient) {
  appSettings = createAppSettingsService(client)
  return appSettings.initialize()
}
export const flushAppSettings = () => appSettings.flush()
export const loadDefaultPermissionMode = () => appSettings.loadDefaultPermissionMode()
export const saveDefaultPermissionMode = (permissionMode: ConfigurablePermissionMode) =>
  appSettings.saveDefaultPermissionMode(permissionMode)
export const loadLanguagePreference = () => appSettings.loadLanguagePreference()
export const saveLanguagePreference = (language: LanguagePreference) =>
  appSettings.saveLanguagePreference(language)
export const loadAppearancePreferences = () => appSettings.loadAppearancePreferences()
export const saveAppearancePreferences = (preferences: AppearancePreferences) =>
  appSettings.saveAppearancePreferences(preferences)
