import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppPreferences } from '@/shared/rpc'

import { ThemeProvider } from '../../components/theme-provider'
import { LanguageProvider } from '../../i18n/language-provider'
import { appI18n } from '../../i18n/runtime'
import {
  DEFAULT_APP_PREFERENCES,
  flushAppSettings,
  initializeAppSettings,
} from '../../services/app-settings'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../services/shortcuts/runtime'
import { ModelConfigurationProvider } from '../../stores/model-configuration-context'
import { ProviderUsageProvider } from '../../stores/provider-usage-context'
import { useSettingsDetailStore } from './components/settings-detail-store'
import { SettingsPage } from './index'

let savedPreferences: AppPreferences[] = []

function TestSettingsPage(props: ComponentProps<typeof SettingsPage>) {
  return (
    <LanguageProvider initialPreference="zh-CN" instance={appI18n}>
      <ThemeProvider disableTransitionOnChange={false}>
        <ModelConfigurationProvider>
          <ProviderUsageProvider>
            <ShortcutRuntimeProvider runtime={shortcutRuntime}>
              <SettingsPage {...props} />
            </ShortcutRuntimeProvider>
          </ProviderUsageProvider>
        </ModelConfigurationProvider>
      </ThemeProvider>
    </LanguageProvider>
  )
}

describe('SettingsPage', () => {
  beforeEach(async () => {
    await appI18n.changeLanguage('zh-CN')
    localStorage.clear()
    savedPreferences = []
    useSettingsDetailStore.setState({ view: { kind: 'list' }, isDirty: false, leaf: '' })
    await initializeAppSettings({
      load: async () => DEFAULT_APP_PREFERENCES,
      save: async (preferences) => {
        savedPreferences.push(preferences)
        return preferences
      },
    })
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

  it('persists the default permission mode for new sessions', async () => {
    const user = userEvent.setup()
    render(<TestSettingsPage open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: /^允许编辑/ }))

    await flushAppSettings()
    expect(savedPreferences.at(-1)).toMatchObject({ defaultPermissionMode: 'acceptEdits' })
  })

  it('restores the last saved permission mode when persistence fails', async () => {
    await initializeAppSettings({
      load: async () => DEFAULT_APP_PREFERENCES,
      save: async () => {
        throw new Error('Disk write failed')
      },
    })
    const user = userEvent.setup()
    render(<TestSettingsPage open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: /^允许编辑/ }))

    await waitFor(() => expect(screen.getAllByRole('radio')[0]).toBeChecked())
    expect(screen.getAllByRole('radio')[1]).not.toBeChecked()
  })

  it('changes and persists the application language', async () => {
    const user = userEvent.setup()
    render(<TestSettingsPage open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('combobox', { name: '语言' }))
    await user.click(await screen.findByRole('option', { name: 'English' }))

    expect(screen.getByRole('heading', { level: 1, name: 'General' })).toBeInTheDocument()
    await flushAppSettings()
    expect(savedPreferences.at(-1)).toMatchObject({ language: 'en' })
  })

  it('applies and persists an explicit theme selection', async () => {
    const user = userEvent.setup()
    render(<TestSettingsPage open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '外观' }))
    await user.click(screen.getByRole('radio', { name: '深色' }))

    expect(document.documentElement).toHaveClass('dark')
    await flushAppSettings()
    expect(savedPreferences.at(-1)).toMatchObject({ appearance: { theme: 'dark' } })
  })

  it('cancels an unfinished color edit without closing settings or persisting it', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<TestSettingsPage open onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: '外观' }))

    const accentInput = screen.getByRole('textbox', { name: '亮色主题强调色' })
    await user.clear(accentInput)
    await user.type(accentInput, '#123456')
    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog', { name: '设置' })).toBeInTheDocument()
    expect(accentInput).toHaveValue('#171717')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(savedPreferences).toEqual([])
  })

  it('resets the selected category when settings is reopened', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const { rerender } = render(<TestSettingsPage open onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: '外观' }))

    rerender(<TestSettingsPage open={false} onOpenChange={onOpenChange} />)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument(),
    )
    rerender(<TestSettingsPage open onOpenChange={onOpenChange} />)

    expect(await screen.findByRole('heading', { level: 1, name: '常规' })).toBeInTheDocument()
  })

  it('keeps transient category state while switching settings categories', async () => {
    const user = userEvent.setup()
    render(<TestSettingsPage open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '快捷键' }))
    const search = await screen.findByRole('textbox', { name: '搜索快捷键' })
    await user.type(search, '对话')

    await user.click(screen.getByRole('button', { name: '常规' }))
    await user.click(screen.getByRole('button', { name: '快捷键' }))

    expect(screen.getByRole('textbox', { name: '搜索快捷键' })).toHaveValue('对话')
  })

  it('renders the six agent capability categories under the group label', async () => {
    render(<TestSettingsPage open onOpenChange={vi.fn()} />)

    expect(screen.getByText('Agent 能力')).toBeInTheDocument()
    for (const name of ['子智能体', '插件', 'MCP 服务器', '技能', '钩子', '工作流']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  describe('subagent detail leave guard', () => {
    function renderSubagentsPage(detailFile: string | null) {
      useSettingsDetailStore.setState({
        view: { kind: 'detail', categoryId: 'agent-subagents', file: detailFile },
        leaf: detailFile ?? '新建子智能体',
        isDirty: false,
      })
      render(<TestSettingsPage open initialCategory="agent-subagents" onOpenChange={vi.fn()} />)
      // The mounted editor re-derives isDirty from its untouched form; flip it
      // afterwards to simulate unsaved changes.
      return {
        markDirty: () => useSettingsDetailStore.setState({ isDirty: true }),
      }
    }

    it('lets a clean detail page hand off to a clicked sidebar category', async () => {
      const user = userEvent.setup()
      renderSubagentsPage('reviewer')

      // The detail page replaces the list; the category header is suppressed.
      expect(screen.getByRole('heading', { name: 'reviewer' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '外观' }))

      // A clean hand-off activates the clicked category and closes the detail.
      expect(screen.getByRole('heading', { name: '外观' })).toBeInTheDocument()
      expect(useSettingsDetailStore.getState().view.kind).toBe('list')
    })

    it('keeps the detail page and blocks the category when leaving dirty via the sidebar', async () => {
      const user = userEvent.setup()
      const { markDirty } = renderSubagentsPage('reviewer')
      markDirty()

      await user.click(screen.getByRole('button', { name: '外观' }))

      // The discard dialog is pending; the category never activated.
      expect(await screen.findByRole('alertdialog', { name: '放弃更改？' })).toBeInTheDocument()
      expect(useSettingsDetailStore.getState().view.kind).toBe('detail')
      expect(useSettingsDetailStore.getState().isLeavePending).toBe(true)

      // Resolve the dialog so its portal does not leak into the next test.
      await user.click(screen.getByRole('button', { name: '放弃' }))
      expect(useSettingsDetailStore.getState().isLeavePending).toBe(false)
    })

    it('keeps the detail page and blocks the leave when the breadcrumb root is dirty', async () => {
      const user = userEvent.setup()
      const { markDirty } = renderSubagentsPage('reviewer')
      markDirty()

      await user.click(screen.getByTestId('settings-breadcrumb-root'))

      expect(await screen.findByRole('alertdialog', { name: '放弃更改？' })).toBeInTheDocument()
      expect(useSettingsDetailStore.getState().view.kind).toBe('detail')

      // Resolve the dialog so its portal does not leak into the next test.
      await user.click(screen.getByRole('button', { name: '放弃' }))
      expect(useSettingsDetailStore.getState().isLeavePending).toBe(false)
    })

    it('returns to the list directly from a clean breadcrumb root', async () => {
      const user = userEvent.setup()
      renderSubagentsPage('reviewer')

      await user.click(screen.getByTestId('settings-breadcrumb-root'))

      // A clean breadcrumb-root leave goes straight back to the list header.
      expect(screen.getByRole('heading', { name: '子智能体' })).toBeInTheDocument()
      expect(useSettingsDetailStore.getState().view.kind).toBe('list')
    })
  })
})
