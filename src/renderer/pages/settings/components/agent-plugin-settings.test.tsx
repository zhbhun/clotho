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
import { useCatalogCache } from './catalog-cache'
import { InstallPluginDetailPage, InstallPluginPage } from './install-page'
import { MarketplaceAddPage, MarketplaceDetailPage, MarketplaceListPage } from './marketplace-pages'
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
  useCatalogCache.setState({
    catalog: null,
    installed: null,
    installedChanges: new Map(),
    catalogLoading: false,
    catalogError: false,
    installedError: false,
    marketplaces: null,
    marketplacesError: false,
  })
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

describe('MarketplaceListPage cache', () => {
  it('shows descriptions in borderless tiles and opens a marketplace without a description', async () => {
    mock.listAgentMarketplaces.mockResolvedValue([
      {
        name: 'acme',
        description: 'Development tools',
        source: { source: 'github', repo: 'acme/plugins' },
        installLocation: '/acme',
      },
      {
        name: 'local',
        source: { source: 'directory', path: '/opt/local' },
        installLocation: '/opt/local',
      },
    ])
    const user = userEvent.setup()
    const view = renderWithProviders(<MarketplaceListPage />)
    expect(await screen.findByText('Development tools')).toBeInTheDocument()
    const tiles = view.container.querySelectorAll('[data-marketplace-tile]')
    expect(tiles).toHaveLength(2)
    expect(within(tiles[0] as HTMLElement).getByText('github · acme/plugins')).toBeInTheDocument()
    expect(within(tiles[1] as HTMLElement).getByText('directory · /opt/local')).toBeInTheDocument()
    await user.click(within(tiles[1] as HTMLElement).getByText('local'))
    expect(useSettingsDetailStore.getState().view).toMatchObject({
      kind: 'detail',
      file: 'local',
      page: 'marketplaces',
    })
  })

  it('shows a directory marketplace source in the list and detail', async () => {
    mock.listAgentMarketplaces.mockResolvedValue([
      {
        name: 'local',
        source: { source: 'directory', path: '/Users/alice/projects/local' },
        installLocation: '/Users/alice/projects/local',
      },
    ])
    const view = renderWithProviders(<MarketplaceListPage />)
    expect(await screen.findByText('directory · ~/projects/local')).toBeInTheDocument()
    view.unmount()
    renderWithProviders(<MarketplaceDetailPage marketplaceName="local" />)
    expect(await screen.findByText('directory · ~/projects/local')).toBeInTheDocument()
    expect(screen.getByText('~/projects/local')).toBeInTheDocument()
  })

  it('shows cached results on return while revalidating without requesting the catalog', async () => {
    const marketplace = {
      name: 'acme',
      description: 'Development tools',
      source: { source: 'github', repo: 'acme/plugins' },
      installLocation: '/acme',
    }
    mock.listAgentMarketplaces
      .mockResolvedValueOnce([marketplace])
      .mockReturnValueOnce(new Promise(() => {}))
    const view = renderWithProviders(<MarketplaceListPage />)
    expect(await screen.findByText('github · acme/plugins')).toBeInTheDocument()
    view.unmount()
    renderWithProviders(<MarketplaceListPage />)
    expect(screen.getByText('github · acme/plugins')).toBeInTheDocument()
    expect(screen.getByText('Development tools')).toBeInTheDocument()
    expect(document.querySelector('[data-install-skeleton]')).toBeNull()
    expect(mock.listAgentMarketplaces).toHaveBeenCalledTimes(2)
    expect(mock.listAgentAvailablePlugins).not.toHaveBeenCalled()
  })

  it('shows a cached empty list without a loading skeleton', () => {
    useCatalogCache.setState({ marketplaces: [] })
    mock.listAgentMarketplaces.mockReturnValue(new Promise(() => {}))
    const view = renderWithProviders(<MarketplaceListPage />)
    expect(view.container.querySelector('[data-install-skeleton]')).toBeNull()
  })

  it('shows the tile skeleton on the first visit while the marketplace list loads', () => {
    mock.listAgentMarketplaces.mockReturnValue(new Promise(() => {}))
    const view = renderWithProviders(<MarketplaceListPage />)
    expect(view.container.querySelector('[data-install-skeleton]')).not.toBeNull()
  })

  it('updates descriptions after refreshing marketplaces', async () => {
    const marketplace = { name: 'acme', source: { source: 'github' }, installLocation: '/acme' }
    mock.listAgentMarketplaces
      .mockResolvedValueOnce([{ ...marketplace, description: 'Before refresh' }])
      .mockResolvedValueOnce([{ ...marketplace, description: 'After refresh' }])
    mock.refreshAgentMarketplace.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<MarketplaceListPage />)
    expect(await screen.findByText('Before refresh')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '更多操作' }))
    await user.click(await screen.findByRole('menuitem', { name: '全部刷新' }))
    expect(await screen.findByText('After refresh')).toBeInTheDocument()
  })
})

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
      commands: [],
      mcpServers: [],
      subagents: [],
      hooks: [],
    })
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByText('formatter'))

    expect(useSettingsDetailStore.getState().view.kind).toBe('detail')
    const view = useSettingsDetailStore.getState().view
    if (view.kind === 'detail') expect(view.file).toBe('formatter@acme')
    expect(await screen.findByText('Formats things')).toBeInTheDocument()
    expect(screen.getByText('Format')).toBeInTheDocument()
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
    commands: [] as { name: string; description?: string }[],
    mcpServers: [{ name: 'fmt-server', summary: 'stdio' }],
    subagents: [] as { name: string; description?: string }[],
    hooks: [] as { name: string; description?: string }[],
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
    expect(screen.getByText('Format')).toBeInTheDocument()
    expect(screen.getByText('Fmt Server')).toBeInTheDocument()
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
    mock.listAgentPlugins.mockResolvedValue([])
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
    commands: [],
    mcpServers: [],
    subagents: [],
    hooks: [],
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

  it('shows cached results on return, retains them after a failure, and retries', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValueOnce([catalogEntry()])
    const first = renderWithProviders(<InstallPluginPage />)
    expect((await findInstallList()).getByText('formatter')).toBeInTheDocument()
    first.unmount()

    let rejectRefresh!: (reason: Error) => void
    mock.listAgentAvailablePlugins.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectRefresh = reject
      }),
    )
    const second = renderWithProviders(<InstallPluginPage />)
    expect(screen.getByText('formatter')).toBeInTheDocument()
    rejectRefresh(new Error('offline'))
    await waitFor(() => expect(useCatalogCache.getState().catalogError).toBe(true))
    expect(screen.getByText('formatter')).toBeInTheDocument()
    second.unmount()

    mock.listAgentAvailablePlugins.mockResolvedValueOnce([catalogEntry({ name: 'updated' })])
    renderWithProviders(<InstallPluginPage />)
    expect(await screen.findByText('updated')).toBeInTheDocument()
  })

  it('keeps a successful install visible when installed records have not loaded and refresh fails', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([catalogEntry()])
    mock.listAgentPlugins.mockRejectedValue(new Error('unavailable'))
    mock.getAgentPluginDetails.mockResolvedValue(emptyDetails)
    mock.installAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    await user.click(await (await findInstallList()).findByRole('button', { name: '安装插件' }))
    expect(
      await (await findInstallList()).findByRole('button', { name: '更多操作' }),
    ).toBeInTheDocument()
    expect(useCatalogCache.getState().installed).toBeNull()
  })

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

  it('shows same-name entries from both sources with independent installation state', async () => {
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
    expect(list.getAllByText('superpowers')).toHaveLength(2)
    expect(list.getByRole('button', { name: '更多操作' })).toBeInTheDocument()
    expect(list.getByRole('button', { name: '安装插件' })).toBeInTheDocument()
    expect(list.getByText('superpowers-marketplace')).toBeInTheDocument()
    expect(list.getByText('anthropic-plugin-directory')).toBeInTheDocument()
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

  it('finds same-name plugins in each source and installs the selected source', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([
      catalogEntry({
        pluginId: 'frontend-design@claude-plugins-official',
        name: 'frontend-design',
        marketplaceName: 'claude-plugins-official',
      }),
      catalogEntry({
        pluginId: 'frontend-design@anthropic-plugin-directory',
        name: 'frontend-design',
        marketplaceName: 'anthropic-plugin-directory',
      }),
    ])
    mock.listAgentPlugins.mockResolvedValue([
      installedPlugin({
        id: 'frontend-design@claude-plugins-official',
        name: 'frontend-design',
        marketplace: 'claude-plugins-official',
      }),
    ])
    mock.installAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    const list = await findInstallList()
    await user.type(screen.getByPlaceholderText('搜索插件…'), 'frontend-de')
    expect(list.getAllByText('frontend-design')).toHaveLength(2)
    expect(list.getByText('claude-plugins-official')).toBeInTheDocument()
    expect(list.getByText('anthropic-plugin-directory')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '来源' }))
    await user.click(await screen.findByRole('option', { name: 'anthropic-plugin-directory' }))
    expect(list.getByText('frontend-design')).toBeInTheDocument()
    expect(list.getByText('anthropic-plugin-directory')).toBeInTheDocument()
    await user.click(list.getByRole('button', { name: '安装插件' }))
    await waitFor(() =>
      expect(mock.installAgentPlugin).toHaveBeenCalledWith(
        'frontend-design@anthropic-plugin-directory',
      ),
    )

    await user.click(screen.getByRole('combobox', { name: '来源' }))
    await user.click(await screen.findByRole('option', { name: 'claude-plugins-official' }))
    expect(list.getByText('frontend-design')).toBeInTheDocument()
    expect(list.getByText('claude-plugins-official')).toBeInTheDocument()
    expect(list.getByRole('button', { name: '更多操作' })).toBeInTheDocument()
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

  it('shows exact matches from both sources before other search results', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([
      catalogEntry({
        pluginId: 'related@acme',
        name: 'related',
        description: 'Uses superpowers',
        installCount: 5000,
      }),
      catalogEntry({
        pluginId: 'superpowers-extra@acme',
        name: 'superpowers-extra',
        installCount: 2000,
      }),
      catalogEntry({
        pluginId: 'superpowers@claude-plugins-official',
        name: 'superpowers',
        marketplaceName: 'claude-plugins-official',
        installCount: 1000,
      }),
      catalogEntry({
        pluginId: 'superpowers@anthropic-plugin-directory',
        name: 'superpowers',
        marketplaceName: 'anthropic-plugin-directory',
        installCount: undefined,
      }),
    ])
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)
    await findInstallList()
    await user.type(screen.getByPlaceholderText('搜索插件…'), 'superpowers')

    const tiles = [...document.querySelectorAll('[data-install-tile]')]
    expect(tiles).toHaveLength(4)
    expect(tiles[0]).toHaveTextContent('claude-plugins-official')
    expect(tiles[1]).toHaveTextContent('anthropic-plugin-directory')
    expect(tiles[2]).toHaveTextContent('superpowers-extra')
    expect(tiles[3]).toHaveTextContent('related')
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
    mock.listAgentPlugins.mockResolvedValue([installedPlugin({ enabled: false })])
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
    mock.listAgentPlugins.mockResolvedValue([])
    await user.click(within(menu).getByRole('menuitem', { name: '卸载' }))

    await waitFor(() => expect(mock.removeAgentPlugin).toHaveBeenCalledWith('formatter@acme'))
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()
    const list = await findInstallList()
    expect(list.getByRole('button', { name: '安装插件' })).toBeInTheDocument()
    expect(list.queryByRole('button', { name: '更多操作' })).toBeNull()
  })

  it('installs from the plus button and flips the entry to the menu', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([catalogEntry()])
    mock.installAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    const installButton = await (await findInstallList()).findByRole('button', { name: '安装插件' })
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    await user.click(installButton)

    await waitFor(() => expect(mock.installAgentPlugin).toHaveBeenCalledWith('formatter@acme'))
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()
    const list = await findInstallList()
    expect(list.getByRole('button', { name: '更多操作' })).toBeInTheDocument()
    expect(list.queryByRole('button', { name: '安装插件' })).toBeNull()
  })
})

describe('InstallPluginDetailPage', () => {
  it('renders catalog-cache component sections for an uninstalled entry', async () => {
    mock.getAgentPluginDetails.mockResolvedValue({
      pluginId: 'stripe@claude-plugins-official',
      name: 'stripe',
      displayName: 'Stripe',
      description: 'Stripe development plugin',
      category: 'development',
      version: '1.5.5',
      marketplace: 'claude-plugins-official',
      installCount: 87174,
      installed: false,
      skills: [{ name: 'stripe-pay', description: 'Payment flows' }],
      commands: [{ name: 'test-cards' }],
      mcpServers: [{ name: 'stripe' }],
      subagents: [{ name: 'researcher' }],
      hooks: [],
    })
    renderWithProviders(<InstallPluginDetailPage pluginId="stripe@claude-plugins-official" />)

    // Section titles with counts (skills count scoped to its heading).
    expect(await screen.findByText('技能')).toBeInTheDocument()
    const skillsHeading = screen.getByText('技能').closest('h3')
    assert(skillsHeading instanceof HTMLHeadingElement)
    expect(within(skillsHeading).getByText('1')).toBeInTheDocument()
    expect(screen.getByText('命令')).toBeInTheDocument()
    expect(screen.getByText('MCP 服务器')).toBeInTheDocument()
    expect(screen.getByText('子智能体')).toBeInTheDocument()
    // Empty sections are omitted (hooks).
    expect(screen.queryByText('Hooks')).toBeNull()
    // Component rows render.
    expect(screen.getByText('Stripe Pay')).toBeInTheDocument()
    expect(screen.getByText('Test Cards')).toBeInTheDocument()
    // Info block rows: version + installs, no author.
    expect(screen.getByText('1.5.5')).toBeInTheDocument()
    expect(screen.getByText('87,174')).toBeInTheDocument()
    expect(screen.queryByText('开发者')).toBeNull()
    // Install action for uninstalled entries.
    expect(screen.getByRole('button', { name: '安装插件' })).toBeInTheDocument()
  })

  it('shows a thin detail for a directory-only entry with no component data', async () => {
    mock.getAgentPluginDetails.mockResolvedValue({
      pluginId: 'docs@anthropic-plugin-directory',
      name: 'docs',
      description: 'Docs workflows',
      version: '1.2.0',
      marketplace: 'anthropic-plugin-directory',
      installed: false,
      skills: [],
      commands: [],
      mcpServers: [],
      subagents: [],
      hooks: [],
    })
    renderWithProviders(<InstallPluginDetailPage pluginId="docs@anthropic-plugin-directory" />)

    expect(await screen.findByText('Docs workflows')).toBeInTheDocument()
    expect(screen.getByText('信息')).toBeInTheDocument()
    expect(screen.getByText('1.2.0')).toBeInTheDocument()
    expect(screen.queryByText('技能')).toBeNull()
    expect(screen.queryByText('命令')).toBeNull()
    expect(screen.queryByText('MCP 服务器')).toBeNull()
    expect(screen.queryByText('子智能体')).toBeNull()
  })

  it('renders the homepage as a clickable row value', async () => {
    mock.getAgentPluginDetails.mockResolvedValue({
      pluginId: 'fmt@acme',
      name: 'fmt',
      description: 'Formats things',
      homepage: 'https://example.com/fmt',
      installed: false,
      skills: [],
      commands: [],
      mcpServers: [],
      subagents: [],
      hooks: [],
    })
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginDetailPage pluginId="fmt@acme" />)

    const link = await screen.findByRole('button', { name: 'https://example.com/fmt' })
    await user.click(link)
    const { requestFromDesktop } = await import('../../../services/desktop/client')
    expect(requestFromDesktop).toHaveBeenCalledWith('appOpenLink', {
      href: 'https://example.com/fmt',
      projectPath: '',
    })
  })

  it('installs from the detail page and flips to the Installed badge', async () => {
    mock.getAgentPluginDetails.mockResolvedValue({
      pluginId: 'fmt@acme',
      name: 'fmt',
      description: 'Formats things',
      installed: false,
      skills: [],
      commands: [],
      mcpServers: [],
      subagents: [],
      hooks: [],
    })
    mock.installAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginDetailPage pluginId="fmt@acme" />)

    await user.click(await screen.findByRole('button', { name: '安装插件' }))
    await waitFor(() => expect(mock.installAgentPlugin).toHaveBeenCalledWith('fmt@acme'))
    expect(await screen.findByText('已安装')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '安装插件' })).toBeNull()
  })
})
