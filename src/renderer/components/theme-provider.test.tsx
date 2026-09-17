import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppPreferences } from '@/shared/rpc'

import {
  DEFAULT_APP_PREFERENCES,
  flushAppSettings,
  initializeAppSettings,
} from '../services/app-settings'
import { DEFAULT_THEME_PALETTES } from '../services/theme-presets'
import { ThemeProvider, applyAppearanceTheme, useTheme } from './theme-provider'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'
let savedPreferences: AppPreferences[] = []

async function configureAppearance(appearance: Partial<AppPreferences['appearance']> = {}) {
  savedPreferences = []
  const preferences: AppPreferences = {
    ...DEFAULT_APP_PREFERENCES,
    appearance: {
      ...DEFAULT_APP_PREFERENCES.appearance,
      ...appearance,
    },
  }
  await initializeAppSettings({
    load: async () => preferences,
    save: async (next) => {
      savedPreferences.push(next)
      return next
    },
  })
}

function AppearanceProbe() {
  const {
    isReducedMotion,
    pointerCursor,
    reducedMotion,
    setPointerCursor,
    setReducedMotion,
    setTheme,
    setThemePreset,
    theme,
  } = useTheme()

  return (
    <div>
      <output>{`${theme}/${pointerCursor}/${reducedMotion}/${isReducedMotion}`}</output>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setThemePreset('dark', 'clotho')}>clotho</button>
      <button onClick={() => setPointerCursor(true)}>pointer</button>
      <button onClick={() => setReducedMotion('reduce')}>reduce</button>
      <button onClick={() => setReducedMotion('no-preference')}>motion</button>
    </div>
  )
}

describe('ThemeProvider appearance preferences', () => {
  beforeEach(async () => {
    localStorage.clear()
    await configureAppearance()
    document.documentElement.className = ''
    document.documentElement.style.removeProperty('--primary')
    document.documentElement.style.removeProperty('--background')
    document.documentElement.style.removeProperty('--foreground')
    delete document.documentElement.dataset.themePreset
    delete document.documentElement.dataset.pointerCursor
    delete document.documentElement.dataset.reducedMotion
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies the persisted theme before React mounts', () => {
    applyAppearanceTheme({
      ...DEFAULT_APP_PREFERENCES.appearance,
      theme: 'dark',
      themePalettes: {
        ...DEFAULT_THEME_PALETTES,
        dark: {
          accent: '#ff79c6',
          background: '#282a36',
          foreground: '#f8f8f2',
          preset: 'dracula',
        },
      },
    })

    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#ff79c6')
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('#282a36')
    expect(document.documentElement.style.getPropertyValue('--foreground')).toBe('#f8f8f2')
  })

  it('restores persisted appearance preferences and applies them to the document', async () => {
    await configureAppearance({ theme: 'dark', pointerCursor: true, reducedMotion: 'reduce' })
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )

    render(
      <ThemeProvider>
        <AppearanceProbe />
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark')
      expect(document.documentElement).toHaveAttribute('data-pointer-cursor', 'true')
      expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'reduce')
    })
    expect(screen.getByText('dark/true/reduce/true')).toBeInTheDocument()
  })

  it('tracks the system reduced-motion preference while configured to follow the system', async () => {
    let handleChange: ((event: MediaQueryListEvent) => void) | undefined
    const reducedMotionQuery = {
      matches: false,
      media: REDUCED_MOTION_QUERY,
      addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === 'change') handleChange = listener
      }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) =>
        query === REDUCED_MOTION_QUERY
          ? reducedMotionQuery
          : {
              matches: false,
              media: query,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
            },
      ),
    )

    render(
      <ThemeProvider>
        <AppearanceProbe />
      </ThemeProvider>,
    )

    expect(screen.getByText('system/false/system/false')).toBeInTheDocument()

    reducedMotionQuery.matches = true
    handleChange?.({ matches: true } as MediaQueryListEvent)

    expect(await screen.findByText('system/false/system/true')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'reduce')
  })

  it('applies the independently stored palette when the resolved system theme changes', async () => {
    let isDark = false
    let handleColorSchemeChange: (() => void) | undefined
    await configureAppearance({
      themePalettes: {
        dark: {
          accent: '#ff79c6',
          background: '#282a36',
          foreground: '#f8f8f2',
          preset: 'dracula',
        },
        light: {
          accent: '#0969da',
          background: '#ffffff',
          foreground: '#1f2328',
          preset: 'github',
        },
      },
    })
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        get matches() {
          return query === '(prefers-color-scheme: dark)' ? isDark : false
        },
        media: query,
        addEventListener: vi.fn((event: string, listener: () => void) => {
          if (query === '(prefers-color-scheme: dark)' && event === 'change') {
            handleColorSchemeChange = listener
          }
        }),
        removeEventListener: vi.fn(),
      })),
    )

    render(
      <ThemeProvider disableTransitionOnChange={false}>
        <AppearanceProbe />
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('light')
      expect(document.documentElement).not.toHaveAttribute('data-theme-preset')
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#0969da')
      expect(document.documentElement.style.getPropertyValue('--background')).toBe('#ffffff')
      expect(document.documentElement.style.getPropertyValue('--foreground')).toBe('#1f2328')
    })

    act(() => {
      isDark = true
      handleColorSchemeChange?.()
    })

    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).not.toHaveAttribute('data-theme-preset')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#ff79c6')
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('#282a36')
    expect(document.documentElement.style.getPropertyValue('--foreground')).toBe('#f8f8f2')
  })

  it('uses the stylesheet defaults when switching back to Clotho', async () => {
    const user = userEvent.setup()
    await configureAppearance({
      theme: 'dark',
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
    })
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === COLOR_SCHEME_QUERY,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )

    render(
      <ThemeProvider disableTransitionOnChange={false}>
        <AppearanceProbe />
      </ThemeProvider>,
    )

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#ff79c6')
    })
    await user.click(screen.getByRole('button', { name: 'clotho' }))

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--foreground')).toBe('')
  })

  it('persists explicit cursor and reduced-motion overrides', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === REDUCED_MOTION_QUERY,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )

    render(
      <ThemeProvider>
        <AppearanceProbe />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'pointer' }))
    await user.click(screen.getByRole('button', { name: 'motion' }))

    expect(screen.getByText('system/true/no-preference/false')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-pointer-cursor', 'true')
    expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'no-preference')
    await flushAppSettings()
    expect(savedPreferences.at(-1)).toMatchObject({
      appearance: {
        pointerCursor: true,
        reducedMotion: 'no-preference',
      },
    })
  })

  it('restores the last saved appearance when persistence fails', async () => {
    await initializeAppSettings({
      load: async () => DEFAULT_APP_PREFERENCES,
      save: async () => {
        throw new Error('Disk write failed')
      },
    })
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )

    render(
      <ThemeProvider disableTransitionOnChange={false}>
        <AppearanceProbe />
      </ThemeProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'dark' }))

    expect(await screen.findByText('system/false/system/false')).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('light')
  })
})
