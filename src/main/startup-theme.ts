import type { AppAppearancePreferences } from '@/shared/rpc'

export function createStartupThemePreload(appearance: AppAppearancePreferences) {
  const startupAppearance = {
    theme: appearance.theme,
    themePalettes: {
      dark: {
        accent: appearance.themePalettes.dark.accent,
        background: appearance.themePalettes.dark.background,
        foreground: appearance.themePalettes.dark.foreground,
      },
      light: {
        accent: appearance.themePalettes.light.accent,
        background: appearance.themePalettes.light.background,
        foreground: appearance.themePalettes.light.foreground,
      },
    },
  }

  return `(() => {
    const appearance = ${JSON.stringify(startupAppearance)}
    const resolvedTheme = appearance.theme === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : appearance.theme
    const palette = appearance.themePalettes[resolvedTheme]
    const applyTheme = () => {
      const root = document.documentElement
      if (!root) return false
      root.classList.remove('light', 'dark')
      root.classList.add(resolvedTheme)
      root.style.setProperty('--primary', palette.accent)
      root.style.setProperty('--background', palette.background)
      root.style.setProperty('--foreground', palette.foreground)
      return true
    }
    if (!applyTheme()) {
      const observer = new MutationObserver(() => {
        if (!applyTheme()) return
        observer.disconnect()
      })
      observer.observe(document, { childList: true })
    }
  })()`
}
