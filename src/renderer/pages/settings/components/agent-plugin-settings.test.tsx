import assert from 'node:assert'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import * as agentConfig from '../../../services/claude/agent-config'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { AgentPluginSettings } from './agent-plugin-settings'
import { InstallPluginPage } from './install-page'
import { MarketplaceAddPage } from './marketplace-pages'
import { useSettingsDetailStore } from './settings-detail-store'

vi.mock('../../../services/claude/agent-config', () => ({
  listAgentSubagents: vi.fn(),
  saveAgentSubagent: vi.fn(),
  deleteAgentSubagent: vi.fn(),
  listAgentMcpServers: vi.fn(),
  saveAgentMcpServer: vi.fn(),
  deleteAgentMcpServer: vi.fn(),
  listAgentHookGroups: vi.fn(),
  saveAgentHookGroup: vi.fn(),
  deleteAgentHookGroup: vi.fn(),
  listAgentSkills: vi.fn(),
  deleteAgentSkill: vi.fn(),
  getAgentPluginDetails: vi.fn(),
  listAgentPlugins: vi.fn(),
  listAgentAvailablePlugins: vi.fn(),
  listAgentMarketplaces: vi.fn(),
  addAgentMarketplace: vi.fn(),
  removeAgentMarketplace: vi.fn(),
  refreshAgentMarketplace: vi.fn(),
  installAgentPlugin: vi.fn(),
  removeAgentPlugin: vi.fn(),
  setAgentPluginEnabled: vi.fn(),
  listAgentWorkflows: vi.fn(),
  readAgentWorkflow: vi.fn(),
  saveAgentWorkflow: vi.fn(),
  renameAgentWorkflow: vi.fn(),
  deleteAgentWorkflow: vi.fn(),
}))

vi.mock('../../../services/desktop/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/desktop/client')>()),
  requestFromDesktop: vi.fn(),
}))

const mock = vi.mocked(agentConfig, true)

beforeEach(async () => {
  await appI18n.changeLanguage('zh-CN')
  vi.clearAllMocks()
  useSettingsDetailStore.setState({ view: { kind: 'list' }, leaf: '', subLeaf: '', isDirty: false })
  mock.listAgentPlugins.mockResolvedValue([])
  mock.listAgentMarketplaces.mockResolvedValue([])
  mock.listAgentAvailablePlugins.mockResolvedValue([])
})

function renderWithProviders(element: ReactElement) {
  return render(
    <ShortcutRuntimeProvider runtime={shortcutRuntime}>
      <TooltipProvider>
        {element}
        <Toaster />
      </TooltipProvider>
    </ShortcutRuntimeProvider>,
  )
}

function installedPlugin(overrides: Partial<agentConfig.AgentPluginInfo> = {}) {
  return {
    id: 'formatter@acme',
    name: 'formatter',
    marketplace: 'acme',
    version: '1.0.0',
    scope: 'user',
    installPath: '/tmp/formatter',
    enabled: true,
    ...overrides,
  }
}

describe('AgentPluginSettings list page', () => {
  it('lists installed plugins with marketplace, and version on the second line', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    renderWithProviders(<AgentPluginSettings />)

    expect(await screen.findByText('formatter')).toBeInTheDocument()
    expect(screen.getByText('acme · 1.0.0')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '在 Clotho 会话中启用' })).toBeChecked()
    // The chevron is decorative: the row div is the click target, so no button
    // names the plugin.
    expect(screen.queryByRole('button', { name: 'formatter@acme' })).toBeNull()
  })

  it('hides local-scope plugins until unified local handling lands', async () => {
    mock.listAgentPlugins.mockResolvedValue([
      installedPlugin(),
      installedPlugin({ id: 'trading@zhbhun', name: 'trading', scope: 'local' }),
    ])
    renderWithProviders(<AgentPluginSettings />)

    expect(await screen.findByText('formatter')).toBeInTheDocument()
    expect(screen.queryByText('trading')).toBeNull()
  })

  it('toggles a plugin through the CLI enable state RPC', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    mock.setAgentPluginEnabled.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('switch', { name: '在 Clotho 会话中启用' }))

    await waitFor(() =>
      expect(mock.setAgentPluginEnabled).toHaveBeenCalledWith('formatter@acme', false),
    )
    // Restart hint surfaces after the change.
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()
  })

  it('rolls the switch back when the CLI toggle fails', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    mock.setAgentPluginEnabled.mockRejectedValue(new Error('CLI failed'))
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    const toggle = await screen.findByRole('switch', { name: '在 Clotho 会话中启用' })
    await user.click(toggle)

    // The failed call rolls the optimistic flip back to enabled, and shows the error.
    expect(await screen.findByText('保存失败')).toBeInTheDocument()
    await waitFor(() => expect(toggle).toBeChecked())
  })

  it('opens the plugin detail page from the row click', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    mock.getAgentPluginDetails.mockResolvedValue({
      pluginId: 'formatter@acme',
      name: 'formatter',
      description: 'Formats things',
      version: '1.0.0',
      marketplace: 'acme',
      scope: 'user',
      installPath: '/tmp/formatter',
      enabled: true,
      installed: true,
      skills: [{ name: 'format', description: 'Format a file' }],
      mcpServers: [],
      subagents: [],
    })
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByText('formatter'))

    expect(useSettingsDetailStore.getState().view.kind).toBe('detail')
    const view = useSettingsDetailStore.getState().view
    if (view.kind === 'detail') expect(view.file).toBe('formatter@acme')
    expect(await screen.findByText('Formats things')).toBeInTheDocument()
    expect(screen.getByText('format')).toBeInTheDocument()
  })

  it('refreshes all marketplaces from the header refresh button', async () => {
    mock.refreshAgentMarketplace.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('button', { name: '刷新' }))

    await waitFor(() => expect(mock.refreshAgentMarketplace).toHaveBeenCalledWith())
  })
})

describe('PluginDetailPage', () => {
  const detailPayload = {
    pluginId: 'formatter@acme',
    name: 'formatter',
    description: 'Formats things',
    version: '1.0.0',
    marketplace: 'acme',
    scope: 'user',
    installPath: '/tmp/formatter',
    enabled: true,
    installed: true,
    skills: [{ name: 'format', description: 'Format a file' }],
    mcpServers: [{ name: 'fmt-server', summary: 'stdio' }],
    subagents: [],
  }

  function openDetail() {
    useSettingsDetailStore.setState({
      view: {
        kind: 'detail',
        categoryId: 'agent-plugins',
        file: 'formatter@acme',
        page: 'entry',
        sub: null,
      },
      leaf: 'formatter',
      subLeaf: '',
      isDirty: false,
    })
  }

  it('renders component sections and the info block', async () => {
    mock.getAgentPluginDetails.mockResolvedValue(detailPayload)
    openDetail()
    renderWithProviders(<AgentPluginSettings />)

    expect(await screen.findByText('Formats things')).toBeInTheDocument()
    expect(screen.getByText('format')).toBeInTheDocument()
    expect(screen.getByText('fmt-server')).toBeInTheDocument()
    expect(screen.getByText('/tmp/formatter')).toBeInTheDocument()
    // Installed entries show their enable state in the info block.
    expect(screen.getByText('启用')).toBeInTheDocument()
  })

  it('toggles enable state from the overflow menu', async () => {
    mock.getAgentPluginDetails.mockResolvedValue(detailPayload)
    mock.setAgentPluginEnabled.mockResolvedValue(undefined)
    const user = userEvent.setup()
    openDetail()
    renderWithProviders(<AgentPluginSettings />)

    await screen.findByText('Formats things')
    await user.click(await screen.findByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    await user.click(within(menu).getByRole('menuitem', { name: '停用' }))

    await waitFor(() =>
      expect(mock.setAgentPluginEnabled).toHaveBeenCalledWith('formatter@acme', false),
    )
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()
    // State-matched label flips after the toggle.
    await user.click(await screen.findByRole('button', { name: '更多操作' }))
    const reopened = await screen.findByRole('menu', { name: '更多操作' })
    expect(within(reopened).getByRole('menuitem', { name: '启用' })).toBeInTheDocument()
  })

  it('uninstalls from the overflow menu and returns to the list', async () => {
    mock.getAgentPluginDetails.mockResolvedValue(detailPayload)
    mock.removeAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    openDetail()
    renderWithProviders(<AgentPluginSettings />)

    await screen.findByText('Formats things')
    await user.click(await screen.findByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    await user.click(within(menu).getByRole('menuitem', { name: '卸载' }))

    await waitFor(() => expect(mock.removeAgentPlugin).toHaveBeenCalledWith('formatter@acme'))
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()
    expect(useSettingsDetailStore.getState().view.kind).toBe('list')
  })

  it('falls back to the catalog view for uninstalled entries', async () => {
    mock.getAgentPluginDetails.mockResolvedValue({ ...detailPayload, installed: false })
    openDetail()
    renderWithProviders(<AgentPluginSettings />)

    expect(await screen.findByText('Formats things')).toBeInTheDocument()
    expect(screen.getByText('已安装')).toBeInTheDocument()
    // No management actions for a catalog-only entry.
    expect(screen.queryByRole('button', { name: '更多操作' })).toBeNull()
  })
})

describe('MarketplaceAddPage', () => {
  it('adds a marketplace from any CLI-supported source', async () => {
    mock.addAgentMarketplace.mockResolvedValue(undefined)
    const user = userEvent.setup()
    useSettingsDetailStore.setState({
      view: {
        kind: 'detail',
        categoryId: 'agent-plugins',
        file: null,
        page: 'entry',
        sub: { page: 'add', file: null },
      },
      leaf: '插件市场',
      subLeaf: '添加市场',
    })
    renderWithProviders(<MarketplaceAddPage />)

    await user.type(
      screen.getByPlaceholderText('市场来源（git URL、GitHub 仓库、URL 或本地路径）'),
      'https://github.com/acme/plugins.git',
    )
    await user.click(screen.getByRole('button', { name: '添加市场' }))

    await waitFor(() =>
      expect(mock.addAgentMarketplace).toHaveBeenCalledWith('https://github.com/acme/plugins.git'),
    )
  })

  it('appends the git ref to repo-looking sources and hides the field for local paths', async () => {
    mock.addAgentMarketplace.mockResolvedValue(undefined)
    const user = userEvent.setup()
    useSettingsDetailStore.setState({
      view: {
        kind: 'detail',
        categoryId: 'agent-plugins',
        file: null,
        page: 'entry',
        sub: { page: 'add', file: null },
      },
      leaf: '插件市场',
      subLeaf: '添加市场',
    })
    renderWithProviders(<MarketplaceAddPage />)

    const sourceInput = screen.getByPlaceholderText(
      '市场来源（git URL、GitHub 仓库、URL 或本地路径）',
    )
    // Local path: no ref field.
    await user.type(sourceInput, '~/Projects/acme')
    expect(screen.queryByPlaceholderText('main')).toBeNull()

    // Repo shorthand: ref field appears and composes #ref on submit.
    await user.clear(sourceInput)
    await user.type(sourceInput, 'acme/plugins')
    const refInput = screen.getByPlaceholderText('main')
    expect(refInput).toBeInTheDocument()
    await user.type(refInput, 'v2.0.0')
    await user.click(screen.getByRole('button', { name: '添加市场' }))

    await waitFor(() =>
      expect(mock.addAgentMarketplace).toHaveBeenCalledWith('acme/plugins#v2.0.0'),
    )
  })

  it('marks the form dirty so list-bound navigation raises the discard dialog', async () => {
    const user = userEvent.setup()
    useSettingsDetailStore.setState({
      view: {
        kind: 'detail',
        categoryId: 'agent-plugins',
        file: null,
        page: 'entry',
        sub: { page: 'add', file: null },
      },
      leaf: '插件市场',
      subLeaf: '添加市场',
    })
    renderWithProviders(<MarketplaceAddPage />)

    await user.type(
      screen.getByPlaceholderText('市场来源（git URL、GitHub 仓库、URL 或本地路径）'),
      'acme/plugins',
    )
    expect(useSettingsDetailStore.getState().isDirty).toBe(true)

    // Leaving routes through the discard dialog instead of dropping the form.
    useSettingsDetailStore.getState().requestLeave()
    expect(useSettingsDetailStore.getState().isLeavePending).toBe(true)
    expect(useSettingsDetailStore.getState().view.kind).toBe('detail')
  })

  it('does not offer the ref field for bare words that are not repo sources', async () => {
    const user = userEvent.setup()
    useSettingsDetailStore.setState({
      view: {
        kind: 'detail',
        categoryId: 'agent-plugins',
        file: null,
        page: 'entry',
        sub: { page: 'add', file: null },
      },
      leaf: '插件市场',
      subLeaf: '添加市场',
    })
    renderWithProviders(<MarketplaceAddPage />)

    await user.type(
      screen.getByPlaceholderText('市场来源（git URL、GitHub 仓库、URL 或本地路径）'),
      'foo',
    )
    expect(screen.queryByPlaceholderText('main')).toBeNull()
  })
})

describe('MarketplaceDetailPage remove confirmation', () => {
  const marketplaceState = {
    view: {
      kind: 'detail' as const,
      categoryId: 'agent-plugins' as const,
      file: null,
      page: 'entry' as const,
      sub: { page: 'market-detail' as const, file: 'acme' },
    },
    leaf: '插件市场',
    subLeaf: 'acme',
    isDirty: false,
  }

  function marketplaceEntry(overrides: Partial<agentConfig.AgentMarketplaceInfo> = {}) {
    return {
      name: 'acme',
      source: { source: 'github', repo: 'acme/plugins' },
      installLocation: '/mp/acme',
      ...overrides,
    }
  }

  it('removes only after confirming and returns to the marketplaces page', async () => {
    mock.listAgentMarketplaces.mockResolvedValue([marketplaceEntry()])
    mock.removeAgentMarketplace.mockResolvedValue(undefined)
    const user = userEvent.setup()
    useSettingsDetailStore.setState(marketplaceState)
    renderWithProviders(<AgentPluginSettings />)

    await screen.findByText('acme/plugins')
    await user.click(await screen.findByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    await user.click(within(menu).getByRole('menuitem', { name: '移除市场' }))

    // Not removed until confirmed.
    expect(mock.removeAgentMarketplace).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: '移除市场' }))

    await waitFor(() => expect(mock.removeAgentMarketplace).toHaveBeenCalledWith('acme'))
    const view = useSettingsDetailStore.getState().view
    assert(view.kind === 'detail' && view.sub === null)
  })

  it('cancelling the dialog keeps the page open', async () => {
    mock.listAgentMarketplaces.mockResolvedValue([marketplaceEntry()])
    const user = userEvent.setup()
    useSettingsDetailStore.setState(marketplaceState)
    renderWithProviders(<AgentPluginSettings />)

    await screen.findByText('acme/plugins')
    await user.click(await screen.findByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    await user.click(within(menu).getByRole('menuitem', { name: '移除市场' }))

    await user.click(await screen.findByRole('button', { name: '取消' }))
    expect(mock.removeAgentMarketplace).not.toHaveBeenCalled()
    expect(useSettingsDetailStore.getState().view.kind).toBe('detail')
  })
})

describe('InstallPluginPage', () => {
  const emptyDetails = {
    pluginId: '',
    name: '',
    installed: true,
    skills: [],
    mcpServers: [],
    subagents: [],
  }

  function catalogEntry(overrides: Partial<agentConfig.AgentMarketplacePlugin> = {}) {
    return {
      pluginId: 'formatter@acme',
      name: 'formatter',
      description: 'Formats things',
      marketplaceName: 'acme',
      installCount: 42,
      ...overrides,
    }
  }

  /** The rendered row list, after waiting for the catalog to load. */
  async function findInstallList() {
    await waitFor(() => {
      const element = document.querySelector('[data-install-list]')
      assert(element instanceof HTMLElement, 'install list rendered')
    })
    const element = document.querySelector('[data-install-list]')
    assert(element instanceof HTMLElement)
    return within(element)
  }

  it('renders one unified list without tabs or a result count', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([
      catalogEntry(),
      catalogEntry({
        pluginId: 'docs@anthropic-plugin-directory',
        name: 'docs',
        marketplaceName: 'anthropic-plugin-directory',
        installCount: 1200,
      }),
    ])
    renderWithProviders(<InstallPluginPage />)

    // Directory and marketplace entries share one list.
    const list = await findInstallList()
    expect(list.getByText('docs')).toBeInTheDocument()
    expect(list.getByText('formatter')).toBeInTheDocument()
    expect(list.getByText('anthropic-plugin-directory')).toBeInTheDocument()
    // No Public/Community/Personal control anywhere.
    expect(screen.queryByRole('tablist')).toBeNull()
    // Counts render as icon + number only, no unit word, no summary line.
    expect(list.queryByText(/次安装/)).toBeNull()
    expect(screen.queryByText(/3 条|共 3/)).toBeNull()
  })

  it('dedupes same-name entries to one installed entry', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([
      catalogEntry({
        pluginId: 'superpowers@anthropic-plugin-directory',
        name: 'superpowers',
        marketplaceName: 'anthropic-plugin-directory',
        installCount: 3000,
      }),
      catalogEntry({
        pluginId: 'superpowers@superpowers-marketplace',
        name: 'superpowers',
        marketplaceName: 'superpowers-marketplace',
      }),
    ])
    mock.listAgentPlugins.mockResolvedValue([
      installedPlugin({
        id: 'superpowers@superpowers-marketplace',
        name: 'superpowers',
        marketplace: 'superpowers-marketplace',
      }),
    ])
    renderWithProviders(<InstallPluginPage />)

    const list = await findInstallList()
    // Exactly one superpowers row, shown as installed (⋮ menu instead of +).
    expect(list.getAllByText('superpowers')).toHaveLength(1)
    expect(list.getByRole('button', { name: '更多操作' })).toBeInTheDocument()
    expect(list.queryByRole('button', { name: '安装' })).toBeNull()
    // The registered marketplace wins as the source label; no directory copy.
    expect(list.getByText('superpowers-marketplace')).toBeInTheDocument()
    expect(list.queryByText('anthropic-plugin-directory')).toBeNull()
  })

  it('narrows the list through the source filter and restores All', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([
      catalogEntry(),
      catalogEntry({
        pluginId: 'docs@anthropic-plugin-directory',
        name: 'docs',
        marketplaceName: 'anthropic-plugin-directory',
        installCount: 1200,
      }),
    ])
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    const list = await findInstallList()
    expect(list.getByText('docs')).toBeInTheDocument()
    expect(list.getByText('formatter')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '来源' }))
    await user.click(await screen.findByRole('option', { name: 'acme' }))
    expect(list.getByText('formatter')).toBeInTheDocument()
    expect(list.queryByText('docs')).toBeNull()

    await user.click(screen.getByRole('combobox', { name: '来源' }))
    await user.click(await screen.findByRole('option', { name: '全部' }))
    expect(list.getByText('docs')).toBeInTheDocument()
  })

  it('applies search on top of the source filter', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([
      catalogEntry({ pluginId: 'alpha@acme', name: 'alpha', description: 'Alpha formats' }),
      catalogEntry({ pluginId: 'beta@acme', name: 'beta', description: 'Beta formats' }),
      catalogEntry({
        pluginId: 'gamma@anthropic-plugin-directory',
        name: 'gamma',
        marketplaceName: 'anthropic-plugin-directory',
        installCount: 1200,
        description: 'Gamma formats',
      }),
    ])
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    const list = await findInstallList()

    await user.click(screen.getByRole('combobox', { name: '来源' }))
    await user.click(await screen.findByRole('option', { name: 'acme' }))
    await user.type(screen.getByPlaceholderText('搜索插件…'), 'alp')

    expect(list.getByText('alpha')).toBeInTheDocument()
    expect(list.queryByText('beta')).toBeNull()
    expect(list.queryByText('gamma')).toBeNull()
  })

  it('toggles enable state from the installed menu', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([catalogEntry()])
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    mock.getAgentPluginDetails.mockResolvedValue({
      ...emptyDetails,
      pluginId: 'formatter@acme',
      name: 'formatter',
      homepage: 'https://example.com/formatter',
    })
    mock.setAgentPluginEnabled.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    await user.click(await (await findInstallList()).findByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    // Open is offered because the manifest declares a homepage.
    expect(await within(menu).findByRole('menuitem', { name: '打开' })).toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', { name: '停用' }))

    await waitFor(() =>
      expect(mock.setAgentPluginEnabled).toHaveBeenCalledWith('formatter@acme', false),
    )
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()

    // Reopening the menu offers Enable after the optimistic flip.
    await user.click(await (await findInstallList()).findByRole('button', { name: '更多操作' }))
    const reopened = await screen.findByRole('menu', { name: '更多操作' })
    expect(within(reopened).getByRole('menuitem', { name: '启用' })).toBeInTheDocument()
  })

  it('omits Open from the installed menu without a homepage', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([catalogEntry()])
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    mock.getAgentPluginDetails.mockResolvedValue({
      ...emptyDetails,
      pluginId: 'formatter@acme',
      name: 'formatter',
    })
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    await user.click(await (await findInstallList()).findByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    expect(within(menu).getByRole('menuitem', { name: '停用' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: '卸载' })).toBeInTheDocument()
    // No homepage declared: no Open item.
    expect(within(menu).queryByRole('menuitem', { name: '打开' })).toBeNull()
  })

  it('uninstalls from the installed menu and flips back to plus', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([catalogEntry()])
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    mock.removeAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    await user.click(await (await findInstallList()).findByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    await user.click(within(menu).getByRole('menuitem', { name: '卸载' }))

    await waitFor(() => expect(mock.removeAgentPlugin).toHaveBeenCalledWith('formatter@acme'))
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()
    const list = await findInstallList()
    expect(list.getByRole('button', { name: '安装' })).toBeInTheDocument()
    expect(list.queryByRole('button', { name: '更多操作' })).toBeNull()
  })

  it('installs from the plus button and flips the entry to the menu', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([catalogEntry()])
    mock.installAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    await user.click(await (await findInstallList()).findByRole('button', { name: '安装' }))

    await waitFor(() => expect(mock.installAgentPlugin).toHaveBeenCalledWith('formatter@acme'))
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()
    const list = await findInstallList()
    expect(list.getByRole('button', { name: '更多操作' })).toBeInTheDocument()
    expect(list.queryByRole('button', { name: '安装' })).toBeNull()
  })
})
