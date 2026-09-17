import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/shadcn/sidebar'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import { commandCatalog } from '../../../services/shortcuts/catalog'
import { ShortcutRuntimeProvider, createShortcutRuntime } from '../../../services/shortcuts/runtime'
import { MacWindowChrome } from './mac-window-chrome'

beforeEach(() => {
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
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderChrome() {
  const runtime = createShortcutRuntime({
    catalog: commandCatalog,
    client: {
      async load() {
        return {}
      },
      async reset() {
        return {}
      },
      async set() {
        return {}
      },
    },
    platform: 'mac',
  })
  render(
    <ShortcutRuntimeProvider runtime={runtime}>
      <TooltipProvider delay={0}>
        <SidebarProvider>
          <MacWindowChrome />
        </SidebarProvider>
      </TooltipProvider>
    </ShortcutRuntimeProvider>,
  )
  return runtime
}

function historyButton(name: 'history-back' | 'history-forward') {
  const button = document.querySelector<HTMLButtonElement>(`[data-sidebar="${name}"]`)
  if (!button) throw new Error(`history button not found: ${name}`)
  return button
}

describe('MacWindowChrome', () => {
  it('disables the history buttons while navigation commands are unavailable', () => {
    renderChrome()

    expect(historyButton('history-back').disabled).toBe(true)
    expect(historyButton('history-forward').disabled).toBe(true)
  })

  it('runs the navigation commands when the history buttons are clicked', async () => {
    await appI18n.changeLanguage('zh-CN')
    const user = userEvent.setup()
    const runtime = renderChrome()
    const goBack = vi.fn()
    const goForward = vi.fn()
    let backRegistration: ReturnType<typeof runtime.registry.register> | undefined
    act(() => {
      backRegistration = runtime.registry.register('workbench.navigation.back', goBack)
      runtime.registry.register('workbench.navigation.forward', goForward)
    })

    const backButton = historyButton('history-back')
    const forwardButton = historyButton('history-forward')
    expect(backButton.disabled).toBe(false)
    expect(forwardButton.disabled).toBe(false)

    await user.hover(backButton)
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('返回')

    await user.click(backButton)
    expect(goBack).toHaveBeenCalledTimes(1)
    expect(goForward).not.toHaveBeenCalled()

    await user.click(forwardButton)
    expect(goForward).toHaveBeenCalledTimes(1)

    act(() => {
      backRegistration?.setEnabled(false)
    })
    expect(historyButton('history-back').disabled).toBe(true)
  })
})
