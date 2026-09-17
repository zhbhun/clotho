import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './app'
import { ThemeProvider } from './components/theme-provider'
import { LanguageProvider } from './i18n/language-provider'
import { appI18n, initializeAppI18n } from './i18n/runtime'
import { requestFromDesktop } from './services/desktop/client'

vi.mock('./services/desktop/client', () => ({
  isDesktopRuntime: () => true,
  requestFromDesktop: vi.fn(async (command: string) => {
    if (command === 'claudeListProjects') {
      return []
    }
    if (command === 'claudeStartup') {
      return { cwd: '/Users/test', commands: [], agents: [], models: [] }
    }
    if (command === 'claudeListProviders') {
      return []
    }
    if (command === 'claudeListModelMappings') {
      return {}
    }
    return null
  }),
  listenDesktopEvent: vi.fn(() => Promise.resolve(() => {})),
}))

describe('App shell', () => {
  beforeEach(async () => {
    // Assertions in this suite expect the English catalog; the global setup resets to zh-CN.
    await initializeAppI18n('en', ['en-US'])
    window.history.replaceState({}, '', '/index.html')
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect = vi.fn()
        observe = vi.fn()
        takeRecords = vi.fn(() => [])
        unobserve = vi.fn()
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(requestFromDesktop).mockClear()
    window.history.replaceState({}, '', '/')
  })

  it('renders the workbench when the desktop runtime loads /index.html', async () => {
    render(
      <LanguageProvider initialPreference="en" instance={appI18n}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </LanguageProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeInTheDocument()
    })
  })

  it('opens settings from the workbench sidebar', async () => {
    const user = userEvent.setup()

    render(
      <LanguageProvider initialPreference="en" instance={appI18n}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </LanguageProvider>,
    )

    const settingsButton = await screen.findByRole('button', { name: 'Settings' })
    const prompt = screen.getByRole('textbox', { name: 'Prompt' })
    await user.click(settingsButton)

    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to app' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
      expect(settingsButton).toHaveFocus()
    })
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBe(prompt)

    await user.click(settingsButton)
    await screen.findByRole('dialog', { name: 'Settings' })
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
      expect(settingsButton).toHaveFocus()
    })
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBe(prompt)
  })
})
