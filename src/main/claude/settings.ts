import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { CLAUDE_MODEL_MAPPING_ROLES } from '@/shared/provider'
import type {
  AppAppearancePreferences,
  AppDefaultPermissionMode,
  AppLanguagePreference,
  AppPreferences,
  AppReducedMotionPreference,
  AppTheme,
  AppThemePalette,
  ClaudeModelMappings,
  ModelProvider,
} from '@/shared/rpc'

import { clothoDir } from '../app-data'
import { getLogger } from '../logging/runtime'
import { normalizeProvider } from './providers'

const logger = getLogger('settings')

/** Main-process persisted shape for `~/.clotho/settings.json`. */
export interface ClaudeskSettings {
  providers: ModelProvider[]
  models: ClaudeModelMappings
  language: AppLanguagePreference
  defaultPermissionMode: AppDefaultPermissionMode
  appearance: AppAppearancePreferences
}

const LANGUAGES: AppLanguagePreference[] = [
  'system',
  'de',
  'en',
  'es',
  'fr',
  'hi',
  'id',
  'ja',
  'ko',
  'pt-BR',
  'ru',
  'tr',
  'vi',
  'zh-CN',
  'zh-TW',
]
const PERMISSION_MODES: AppDefaultPermissionMode[] = [
  'default',
  'acceptEdits',
  'auto',
  'plan',
  'bypassPermissions',
]
const THEMES: AppTheme[] = ['dark', 'light', 'system']
const REDUCED_MOTION_PREFERENCES: AppReducedMotionPreference[] = [
  'system',
  'reduce',
  'no-preference',
]
const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/i

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
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
}

export function defaultSettings(): ClaudeskSettings {
  return { providers: [], models: {}, ...sanitizeAppPreferences({}) }
}

export function settingsJsonPath() {
  return path.join(clothoDir(), 'settings.json')
}

export function sanitizeModelMappings(
  value: unknown,
  providers: ModelProvider[],
): ClaudeModelMappings {
  const candidate =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const availableModels = new Set(
    providers.flatMap((provider) => provider.models.map((model) => `${provider.id}/${model.id}`)),
  )
  const models: ClaudeModelMappings = {}
  for (const role of CLAUDE_MODEL_MAPPING_ROLES) {
    const mapping = candidate[role]
    if (typeof mapping === 'string' && mapping.trim() && availableModels.has(mapping)) {
      models[role] = mapping
    }
  }
  return models
}

function sanitizeThemePalette(value: unknown, fallback: AppThemePalette): AppThemePalette {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback }
  const candidate = value as Record<string, unknown>
  return {
    accent:
      typeof candidate.accent === 'string' && HEX_COLOR_PATTERN.test(candidate.accent)
        ? candidate.accent.toLowerCase()
        : fallback.accent,
    background:
      typeof candidate.background === 'string' && HEX_COLOR_PATTERN.test(candidate.background)
        ? candidate.background.toLowerCase()
        : fallback.background,
    foreground:
      typeof candidate.foreground === 'string' && HEX_COLOR_PATTERN.test(candidate.foreground)
        ? candidate.foreground.toLowerCase()
        : fallback.foreground,
    preset:
      typeof candidate.preset === 'string' && candidate.preset.trim()
        ? candidate.preset
        : fallback.preset,
  }
}

export function sanitizeAppPreferences(value: unknown): AppPreferences {
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
  const palettes =
    appearance.themePalettes &&
    typeof appearance.themePalettes === 'object' &&
    !Array.isArray(appearance.themePalettes)
      ? (appearance.themePalettes as Record<string, unknown>)
      : {}

  return {
    language: LANGUAGES.includes(candidate.language as AppLanguagePreference)
      ? (candidate.language as AppLanguagePreference)
      : DEFAULT_APP_PREFERENCES.language,
    defaultPermissionMode: PERMISSION_MODES.includes(
      candidate.defaultPermissionMode as AppDefaultPermissionMode,
    )
      ? (candidate.defaultPermissionMode as AppDefaultPermissionMode)
      : DEFAULT_APP_PREFERENCES.defaultPermissionMode,
    appearance: {
      theme: THEMES.includes(appearance.theme as AppTheme)
        ? (appearance.theme as AppTheme)
        : DEFAULT_APP_PREFERENCES.appearance.theme,
      pointerCursor:
        typeof appearance.pointerCursor === 'boolean'
          ? appearance.pointerCursor
          : DEFAULT_APP_PREFERENCES.appearance.pointerCursor,
      reducedMotion: REDUCED_MOTION_PREFERENCES.includes(
        appearance.reducedMotion as AppReducedMotionPreference,
      )
        ? (appearance.reducedMotion as AppReducedMotionPreference)
        : DEFAULT_APP_PREFERENCES.appearance.reducedMotion,
      themePalettes: {
        dark: sanitizeThemePalette(
          palettes.dark,
          DEFAULT_APP_PREFERENCES.appearance.themePalettes.dark,
        ),
        light: sanitizeThemePalette(
          palettes.light,
          DEFAULT_APP_PREFERENCES.appearance.themePalettes.light,
        ),
      },
    },
  }
}

export async function readSettings(filePath = settingsJsonPath()): Promise<ClaudeskSettings> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Clotho settings must be a JSON object')
    }
    const candidate = parsed as Record<string, unknown>
    const providers = Array.isArray(candidate.providers)
      ? candidate.providers.flatMap((provider) => {
          const normalized = normalizeProvider(provider)
          return normalized ? [normalized] : []
        })
      : []
    return {
      providers,
      models: sanitizeModelMappings(candidate.models, providers),
      ...sanitizeAppPreferences(candidate),
    }
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultSettings()
    }
    logger.warning('settings.read_failed', 'Failed to read Clotho settings', {
      errorName: caught instanceof Error ? caught.name : 'Error',
      filePath,
    })
    throw caught
  }
}

export async function writeSettings(settings: ClaudeskSettings, filePath = settingsJsonPath()) {
  const parent = path.dirname(filePath)
  const temporary = path.join(parent, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}`)
  await fs.mkdir(parent, { recursive: true })

  try {
    await fs.writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    await fs.rename(temporary, filePath)
    await fs.chmod(filePath, 0o600)
  } catch (caught) {
    logger.error('settings.write_failed', 'Failed to write Clotho settings', {
      context: { filePath },
      error: caught,
    })
    throw caught
  } finally {
    await fs.unlink(temporary).catch(() => undefined)
  }
}

function cloneSettings(settings: ClaudeskSettings): ClaudeskSettings {
  return {
    providers: settings.providers.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => ({ ...model })),
    })),
    models: { ...settings.models },
    language: settings.language,
    defaultPermissionMode: settings.defaultPermissionMode,
    appearance: {
      ...settings.appearance,
      themePalettes: {
        dark: { ...settings.appearance.themePalettes.dark },
        light: { ...settings.appearance.themePalettes.light },
      },
    },
  }
}

export function createSettingsStore(
  initialSettings: ClaudeskSettings,
  persist: (settings: ClaudeskSettings) => Promise<void> = writeSettings,
  recover?: () => Promise<ClaudeskSettings>,
) {
  let current = cloneSettings(initialSettings)
  let tail: Promise<unknown> = Promise.resolve()
  let shouldRecover = Boolean(recover)

  return {
    get() {
      return cloneSettings(current)
    },
    update(updater: (settings: ClaudeskSettings) => ClaudeskSettings): Promise<ClaudeskSettings> {
      const result = tail.then(async () => {
        const isRecovering = shouldRecover && Boolean(recover)
        const base = isRecovering && recover ? await recover() : current
        const next = cloneSettings(updater(cloneSettings(base)))
        await persist(next)
        current = next
        shouldRecover = false
        if (isRecovering) {
          logger.info('settings.recovered', 'Clotho settings were recovered')
        }
        return cloneSettings(current)
      })
      tail = result.catch(() => undefined)
      return result
    },
  }
}

export type SettingsStore = ReturnType<typeof createSettingsStore>
