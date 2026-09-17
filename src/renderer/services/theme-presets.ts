export const THEME_VARIANTS = ['dark', 'light'] as const

export type ThemeVariant = (typeof THEME_VARIANTS)[number]

export const THEME_PRESET_IDS = {
  dark: ['clotho', 'dracula', 'github', 'material', 'notion', 'one', 'xcode'],
  light: ['clotho', 'github', 'notion', 'one', 'xcode'],
} as const

type DarkThemePresetId = (typeof THEME_PRESET_IDS.dark)[number]
type LightThemePresetId = (typeof THEME_PRESET_IDS.light)[number]

export type ThemePresetId = DarkThemePresetId | LightThemePresetId
export type ThemePalettePreset = ThemePresetId | 'custom'
export type ThemeColor = 'accent' | 'background' | 'foreground'

export type ThemePalette = {
  accent: string
  background: string
  foreground: string
  preset: ThemePalettePreset
}

export type ThemePalettes = Record<ThemeVariant, ThemePalette>

export type ThemePreset = Omit<ThemePalette, 'preset'> & {
  id: ThemePresetId
  name: string
}

export const THEME_PRESETS: Record<ThemeVariant, readonly ThemePreset[]> = {
  dark: [
    {
      id: 'clotho',
      name: 'Clotho',
      accent: '#f5f5f5',
      background: '#0a0a0a',
      foreground: '#f5f5f5',
    },
    {
      id: 'dracula',
      name: 'Dracula',
      accent: '#ff79c6',
      background: '#282a36',
      foreground: '#f8f8f2',
    },
    {
      id: 'github',
      name: 'GitHub',
      accent: '#1f6feb',
      background: '#0d1117',
      foreground: '#e6edf3',
    },
    {
      id: 'material',
      name: 'Material',
      accent: '#80cbc4',
      background: '#212121',
      foreground: '#eeffff',
    },
    {
      id: 'notion',
      name: 'Notion',
      accent: '#3183d8',
      background: '#191919',
      foreground: '#d9d9d8',
    },
    {
      id: 'one',
      name: 'One',
      accent: '#4d78cc',
      background: '#282c34',
      foreground: '#abb2bf',
    },
    {
      id: 'xcode',
      name: 'Xcode',
      accent: '#5482ff',
      background: '#1f1f24',
      foreground: '#ffffff',
    },
  ],
  light: [
    {
      id: 'clotho',
      name: 'Clotho',
      accent: '#171717',
      background: '#ffffff',
      foreground: '#171717',
    },
    {
      id: 'github',
      name: 'GitHub',
      accent: '#0969da',
      background: '#ffffff',
      foreground: '#1f2328',
    },
    {
      id: 'notion',
      name: 'Notion',
      accent: '#3183d8',
      background: '#ffffff',
      foreground: '#37352f',
    },
    {
      id: 'one',
      name: 'One',
      accent: '#526fff',
      background: '#fafafa',
      foreground: '#383a42',
    },
    {
      id: 'xcode',
      name: 'Xcode',
      accent: '#0e0eff',
      background: '#ffffff',
      foreground: '#000000',
    },
  ],
}

export const DEFAULT_THEME_PALETTES: ThemePalettes = {
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
}

const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/i

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value)
}

export function normalizeHexColor(value: string): string | undefined {
  const normalized = value.trim().toLowerCase()
  return isHexColor(normalized) ? normalized : undefined
}

export function getThemePreset(
  variant: ThemeVariant,
  presetId: ThemePresetId,
): ThemePreset | undefined {
  return THEME_PRESETS[variant].find((preset) => preset.id === presetId)
}

export function paletteFromPreset(
  variant: ThemeVariant,
  presetId: ThemePresetId,
): ThemePalette | undefined {
  const preset = getThemePreset(variant, presetId)
  if (!preset) return undefined

  return {
    accent: preset.accent,
    background: preset.background,
    foreground: preset.foreground,
    preset: preset.id,
  }
}

export function resolveThemePalettes(palettes: ThemePalettes): ThemePalettes {
  return {
    dark:
      palettes.dark.preset === 'custom'
        ? palettes.dark
        : (paletteFromPreset('dark', palettes.dark.preset) ?? DEFAULT_THEME_PALETTES.dark),
    light:
      palettes.light.preset === 'custom'
        ? palettes.light
        : (paletteFromPreset('light', palettes.light.preset) ?? DEFAULT_THEME_PALETTES.light),
  }
}

function isThemePreset(variant: ThemeVariant, value: unknown): value is ThemePalettePreset {
  return (
    value === 'custom' ||
    (typeof value === 'string' && (THEME_PRESET_IDS[variant] as readonly string[]).includes(value))
  )
}

function isThemePalette(variant: ThemeVariant, value: unknown): value is ThemePalette {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const palette = value as Record<string, unknown>
  return (
    isHexColor(palette.accent) &&
    isHexColor(palette.background) &&
    isHexColor(palette.foreground) &&
    isThemePreset(variant, palette.preset)
  )
}

export function isThemePalettes(value: unknown): value is ThemePalettes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const palettes = value as Record<string, unknown>
  return isThemePalette('dark', palettes.dark) && isThemePalette('light', palettes.light)
}
