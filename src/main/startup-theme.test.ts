import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_APP_PREFERENCES } from './claude/settings'
import { createStartupThemePreload } from './startup-theme'

describe('startup theme preload', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies the persisted dark palette before the page renders', () => {
    const appearance = {
      ...DEFAULT_APP_PREFERENCES.appearance,
      theme: 'dark' as const,
      themePalettes: {
        ...DEFAULT_APP_PREFERENCES.appearance.themePalettes,
        dark: {
          accent: '#ff79c6',
          background: '#282a36',
          foreground: '#f8f8f2',
          preset: 'dracula',
        },
      },
    }

    window.eval(createStartupThemePreload(appearance))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#ff79c6')
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('#282a36')
    expect(document.documentElement.style.getPropertyValue('--foreground')).toBe('#f8f8f2')
  })

  it('resolves the system theme inside the WebView', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )

    window.eval(createStartupThemePreload(DEFAULT_APP_PREFERENCES.appearance))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('#0a0a0a')
  })
})
