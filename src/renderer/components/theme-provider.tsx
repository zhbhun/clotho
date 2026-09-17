import { MotionConfig } from 'motion/react'
import * as React from 'react'

import { toast } from '@/shadcn/toast'

import { appI18n } from '../i18n/runtime'
import {
  type AppearancePreferences,
  type ReducedMotionPreference,
  loadAppearancePreferences,
  saveAppearancePreferences,
} from '../services/app-settings'
import {
  type ThemeColor,
  type ThemePalette,
  type ThemePalettes,
  type ThemePresetId,
  type ThemeVariant,
  normalizeHexColor,
  paletteFromPreset,
} from '../services/theme-presets'

export type Theme = 'dark' | 'light' | 'system'
type ResolvedTheme = 'dark' | 'light'

type ThemeProviderProps = {
  children: React.ReactNode
  disableTransitionOnChange?: boolean
}

type ThemeProviderState = {
  isReducedMotion: boolean
  pointerCursor: boolean
  reducedMotion: ReducedMotionPreference
  setPointerCursor: (pointerCursor: boolean) => void
  setReducedMotion: (reducedMotion: ReducedMotionPreference) => void
  setThemeColor: (variant: ThemeVariant, color: ThemeColor, value: string) => void
  setThemePreset: (variant: ThemeVariant, preset: ThemePresetId) => void
  theme: Theme
  themePalettes: ThemePalettes
  setTheme: (theme: Theme) => void
}

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const ThemeProviderContext = React.createContext<ThemeProviderState | undefined>(undefined)

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
    return 'dark'
  }

  return 'light'
}

export function applyAppearanceTheme(
  appearancePreferences: AppearancePreferences,
  nextTheme: Theme = appearancePreferences.theme,
) {
  const root = document.documentElement
  const resolvedTheme = nextTheme === 'system' ? getSystemTheme() : nextTheme
  const palette = appearancePreferences.themePalettes[resolvedTheme]

  root.classList.remove('light', 'dark')
  root.classList.add(resolvedTheme)

  if (palette.preset === 'clotho') {
    root.style.removeProperty('--primary')
    root.style.removeProperty('--background')
    root.style.removeProperty('--foreground')
  } else {
    root.style.setProperty('--primary', palette.accent)
    root.style.setProperty('--background', palette.background)
    root.style.setProperty('--foreground', palette.foreground)
  }
}

function getSystemReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function useSystemReducedMotion() {
  const [isReducedMotion, setIsReducedMotion] = React.useState(getSystemReducedMotion)

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
    const handleChange = (event: MediaQueryListEvent) => setIsReducedMotion(event.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return isReducedMotion
}

function disableTransitionsTemporarily() {
  const style = document.createElement('style')
  style.appendChild(
    document.createTextNode(
      '*,*::before,*::after{-webkit-transition:none!important;transition:none!important}',
    ),
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove()
      })
    })
  }
}

export function ThemeProvider({
  children,
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [appearancePreferences, setAppearancePreferences] =
    React.useState(loadAppearancePreferences)
  const isSystemReducedMotion = useSystemReducedMotion()
  const theme = appearancePreferences.theme
  const persistAppearancePreferences = React.useCallback((preferences: AppearancePreferences) => {
    void saveAppearancePreferences(preferences).catch(() => {
      setAppearancePreferences(loadAppearancePreferences())
      toast.add({
        id: 'settings-appearance-save-error',
        title: appI18n.t('common.toast.saveFailed'),
        description: appI18n.t('settings.save.appearanceError'),
        type: 'error',
      })
    })
  }, [])

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      setAppearancePreferences((current) => {
        const next = { ...current, theme: nextTheme }
        persistAppearancePreferences(next)
        return next
      })
    },
    [persistAppearancePreferences],
  )

  const setPointerCursor = React.useCallback(
    (pointerCursor: boolean) => {
      setAppearancePreferences((current) => {
        const next = { ...current, pointerCursor }
        persistAppearancePreferences(next)
        return next
      })
    },
    [persistAppearancePreferences],
  )

  const setReducedMotion = React.useCallback(
    (reducedMotion: ReducedMotionPreference) => {
      setAppearancePreferences((current) => {
        const next = { ...current, reducedMotion }
        persistAppearancePreferences(next)
        return next
      })
    },
    [persistAppearancePreferences],
  )

  const updateThemePalette = React.useCallback(
    (variant: ThemeVariant, update: (palette: ThemePalette) => ThemePalette) => {
      setAppearancePreferences((current) => {
        const next = {
          ...current,
          themePalettes: {
            ...current.themePalettes,
            [variant]: update(current.themePalettes[variant]),
          },
        }
        persistAppearancePreferences(next)
        return next
      })
    },
    [persistAppearancePreferences],
  )

  const setThemePreset = React.useCallback(
    (variant: ThemeVariant, presetId: ThemePresetId) => {
      const palette = paletteFromPreset(variant, presetId)
      if (!palette) return
      updateThemePalette(variant, () => palette)
    },
    [updateThemePalette],
  )

  const setThemeColor = React.useCallback(
    (variant: ThemeVariant, color: ThemeColor, value: string) => {
      const normalized = normalizeHexColor(value)
      if (!normalized) return
      updateThemePalette(variant, (palette) => ({
        ...palette,
        [color]: normalized,
        preset: 'custom',
      }))
    },
    [updateThemePalette],
  )

  const isReducedMotion =
    appearancePreferences.reducedMotion === 'system'
      ? isSystemReducedMotion
      : appearancePreferences.reducedMotion === 'reduce'

  const applyTheme = React.useCallback(
    (nextTheme: Theme) => {
      const restoreTransitions = disableTransitionOnChange ? disableTransitionsTemporarily() : null
      applyAppearanceTheme(appearancePreferences, nextTheme)

      if (restoreTransitions) {
        restoreTransitions()
      }
    },
    [appearancePreferences, disableTransitionOnChange],
  )

  React.useEffect(() => {
    applyTheme(theme)

    if (theme !== 'system') {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => {
      applyTheme('system')
    }

    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme, applyTheme])

  React.useEffect(() => {
    const root = document.documentElement
    root.dataset.pointerCursor = String(appearancePreferences.pointerCursor)
    root.dataset.reducedMotion = isReducedMotion ? 'reduce' : 'no-preference'
  }, [appearancePreferences.pointerCursor, isReducedMotion])

  const value = React.useMemo(
    () => ({
      isReducedMotion,
      pointerCursor: appearancePreferences.pointerCursor,
      reducedMotion: appearancePreferences.reducedMotion,
      setPointerCursor,
      setReducedMotion,
      setThemeColor,
      setThemePreset,
      theme,
      themePalettes: appearancePreferences.themePalettes,
      setTheme,
    }),
    [
      appearancePreferences.pointerCursor,
      appearancePreferences.reducedMotion,
      isReducedMotion,
      setPointerCursor,
      setReducedMotion,
      setThemeColor,
      setThemePreset,
      theme,
      appearancePreferences.themePalettes,
      setTheme,
    ],
  )

  const motionPreference =
    appearancePreferences.reducedMotion === 'system'
      ? 'user'
      : appearancePreferences.reducedMotion === 'reduce'
        ? 'always'
        : 'never'

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      <MotionConfig reducedMotion={motionPreference}>{children}</MotionConfig>
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}

export function useAppReducedMotion() {
  const context = React.useContext(ThemeProviderContext)
  return context?.isReducedMotion ?? false
}
