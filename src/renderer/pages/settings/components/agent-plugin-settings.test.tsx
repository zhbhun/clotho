import assert from 'node:assert'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { useCatalogCache } from '../../../components/marketplace/catalog-cache'
import { Extensions } from '../../../components/marketplace/extensions'
import {
  InstallPluginDetailPage,
  InstallPluginPage,
} from '../../../components/marketplace/install-page'
import {
  MarketplaceAddPage,
  MarketplaceDetailPage,
  MarketplaceListPage,
} from '../../../components/marketplace/marketplace-pages'
import { MarketplaceSettings } from '../../../components/marketplace/marketplace-settings'
import { useSettingsDetailStore } from '../../../components/marketplace/settings-detail-store'
import { appI18n } from '../../../i18n/runtime'
import * as agentConfig from '../../../services/claude/agent-config'
import { requestFromDesktop } from '../../../services/desktop/client'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { AgentPluginSettings } from './agent-plugin-settings'

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
    expect(screen.queryByText('github · acme/plugins')).not.toBeInTheDocument()
    expect(screen.queryByText('directory · /opt/local')).not.toBeInTheDocument()
    await user.click(within(tiles[0] as HTMLElement).getByText('acme'))
    expect(requestFromDesktop).toHaveBeenCalledWith('appOpenLink', {
      href: 'https://github.com/acme/plugins',
      projectPath: '',
    })
    await user.click(within(tiles[1] as HTMLElement).getByText('local'))
    expect(requestFromDesktop).toHaveBeenCalledWith('appOpenDirectory', { path: '/opt/local' })
    expect(useSettingsDetailStore.getState().view).toEqual({ kind: 'list' })
    await user.click(tiles[1] as HTMLElement)
    expect(useSettingsDetailStore.getState().view).toMatchObject({
      kind: 'detail',
      file: 'local',
      page: 'marketplaces',
    })
  })

  it('keeps the directory marketplace source in the detail only', async () => {
    mock.listAgentMarketplaces.mockResolvedValue([
      {
        name: 'local',
        source: { source: 'directory', path: '/Users/alice/projects/local' },
        installLocation: '/Users/alice/projects/local',
      },
    ])
    const view = renderWithProviders(<MarketplaceListPage />)
    expect(await screen.findByText('local')).toBeInTheDocument()
    expect(screen.queryByText('directory · ~/projects/local')).not.toBeInTheDocument()
    view.unmount()
    renderWithProviders(<MarketplaceDetailPage marketplaceName="local" />)
    expect(await screen.findByText('~/projects/local')).toBeInTheDocument()
    expect(screen.getByText('directory')).toBeInTheDocument()
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
    expect(await screen.findByText('acme')).toBeInTheDocument()
    view.unmount()
    renderWithProviders(<MarketplaceListPage />)
    expect(screen.getByText('acme')).toBeInTheDocument()
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

  it('opens the add form from the marketplace toolbar', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MarketplaceListPage />)
    await user.click(screen.getByRole('button', { name: '添加市场' }))
    expect(useSettingsDetailStore.getState().view).toMatchObject({
      kind: 'detail',
      page: 'marketplaces',
      file: null,
    })
  })
})

describe('AgentPluginSettings list page', () => {
  it('lists installed plugins with marketplace, and version on the second line', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    renderWithProviders(<AgentPluginSettings />)

    expect(await screen.findByText('formatter')).toBeInTheDocument()
    expect(screen.getByText('acme · 1.0.0')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '在 Claude Code 中启用' })).toBeChecked()
    // The row div is the click target, so no button names the plugin.
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

    await user.click(await screen.findByRole('switch', { name: '在 Claude Code 中启用' }))

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

    const toggle = await screen.findByRole('switch', { name: '在 Claude Code 中启用' })
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

  it('opens plugin details from the row menu without opening them when the menu is shown', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('button', { name: '更多操作 · formatter' }))
    expect(useSettingsDetailStore.getState().view.kind).toBe('list')
    await user.click(await screen.findByRole('menuitem', { name: '打开' }))

    expect(useSettingsDetailStore.getState().view).toMatchObject({
      kind: 'detail',
      file: 'formatter@acme',
    })
  })

  it('uninstalls a plugin from the row menu and updates the list and cache', async () => {
    mock.listAgentPlugins.mockResolvedValueOnce([installedPlugin()]).mockResolvedValue([])
    useCatalogCache.setState({ installed: [installedPlugin()] })
    mock.removeAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('button', { name: '更多操作 · formatter' }))
    await user.click(await screen.findByRole('menuitem', { name: '卸载' }))

    await waitFor(() => expect(mock.removeAgentPlugin).toHaveBeenCalledWith('formatter@acme'))
    await waitFor(() => expect(screen.queryByText('formatter')).not.toBeInTheDocument())
    expect(useCatalogCache.getState().installed).toEqual([])
    expect(useSettingsDetailStore.getState().view.kind).toBe('list')
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()
  })

  it('keeps the plugin in the list when uninstall fails', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    mock.removeAgentPlugin.mockRejectedValue(new Error('CLI failed'))
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('button', { name: '更多操作 · formatter' }))
    await user.click(await screen.findByRole('menuitem', { name: '卸载' }))

    expect(await screen.findByText('删除失败')).toBeInTheDocument()
    expect(screen.getByText('formatter')).toBeInTheDocument()
    expect(useSettingsDetailStore.getState().view.kind).toBe('list')
  })

  it('omits the header refresh button', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    renderWithProviders(<AgentPluginSettings />)

    expect(await screen.findByText('formatter')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刷新' })).not.toBeInTheDocument()
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

  it('shows marketplace identity and description with only its own plugins', async () => {
    mock.listAgentMarketplaces.mockResolvedValue([
      marketplaceEntry({ owner: 'Alice', description: 'Helpful tools' }),
    ])
    mock.listAgentAvailablePlugins.mockResolvedValue([
      {
        pluginId: 'one@acme',
        name: 'one',
        marketplaceName: 'acme',
        description: 'First tool',
        installCount: 1234,
      },
      { pluginId: 'other@elsewhere', name: 'other', marketplaceName: 'elsewhere' },
    ])
    renderWithProviders(<MarketplaceDetailPage marketplaceName="acme" />)
    expect(await screen.findByText('Helpful tools')).toBeInTheDocument()
    expect(screen.getByText('By Alice')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('First tool')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('acme/plugins')).toBeInTheDocument()
    expect(screen.queryByText('other')).toBeNull()
  })

  it('refreshes the marketplace from the overflow menu', async () => {
    mock.listAgentMarketplaces.mockResolvedValue([marketplaceEntry()])
    mock.refreshAgentMarketplace.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<MarketplaceDetailPage marketplaceName="acme" />)
    await screen.findByText('acme/plugins')
    expect(screen.queryByRole('button', { name: '刷新' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '更多操作' }))
    await user.click(await screen.findByRole('menuitem', { name: '刷新' }))
    await waitFor(() => expect(mock.refreshAgentMarketplace).toHaveBeenCalledWith('acme'))
  })

  it('keeps the installed badge when an older installed-list request finishes late', async () => {
    let resolveOld!: (plugins: agentConfig.AgentPluginInfo[]) => void
    mock.listAgentPlugins
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockReturnValue(new Promise(() => {}))
    mock.listAgentMarketplaces.mockResolvedValue([marketplaceEntry()])
    mock.listAgentAvailablePlugins.mockResolvedValue([
      { pluginId: 'one@acme', name: 'one', marketplaceName: 'acme' },
    ])
    mock.installAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<MarketplaceDetailPage marketplaceName="acme" />)
    await user.click(await screen.findByRole('button', { name: '安装插件' }))
    expect(mock.installAgentPlugin).toHaveBeenCalledWith('one@acme')
    expect(await screen.findByText('已安装')).toBeInTheDocument()
    await act(async () => resolveOld([]))
    expect(screen.getByText('已安装')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '安装插件' })).toBeNull()
  })

  it('retains the plus action after a failed install and shows existing installed plugins', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin({ id: 'one@acme', name: 'one' })])
    mock.listAgentMarketplaces.mockResolvedValue([marketplaceEntry()])
    mock.listAgentAvailablePlugins.mockResolvedValue([
      { pluginId: 'one@acme', name: 'one', marketplaceName: 'acme' },
      { pluginId: 'two@acme', name: 'two', marketplaceName: 'acme' },
    ])
    mock.installAgentPlugin.mockRejectedValue(new Error('install failed'))
    const user = userEvent.setup()
    renderWithProviders(<MarketplaceDetailPage marketplaceName="acme" />)
    expect(await screen.findByText('已安装')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '安装插件' }))
    expect(await screen.findByText('安装失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '安装插件' })).toBeInTheDocument()
  })

  it('removes only after confirming and returns to the marketplaces page', async () => {
    mock.listAgentMarketplaces.mockResolvedValue([marketplaceEntry()])
    mock.removeAgentMarketplace.mockResolvedValue(undefined)
    const user = userEvent.setup()
    useSettingsDetailStore.setState(marketplaceState)
    renderWithProviders(<AgentPluginSettings />)

    await screen.findByText('acme/plugins')
    await user.click(await screen.findByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    await user.click(within(menu).getByRole('menuitem', { name: '卸载' }))

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
    await user.click(within(menu).getByRole('menuitem', { name: '卸载' }))

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

  function section(id: string) {
    const element = document.querySelector(`[data-catalog-section="${id}"]`)
    assert(element instanceof HTMLElement, `section ${id} rendered`)
    return element
  }

  function groupedCatalog() {
    const developers = [
      'superpowers',
      'feature-dev',
      'pr-review-toolkit',
      'vercel',
      'supabase',
      'plugin-dev',
      'agent-sdk-dev',
      'ralph-loop',
      'hookify',
      'code-review',
      'code-simplifier',
      'commit-commands',
    ].map((name, index) =>
      catalogEntry({
        pluginId: `${name}@anthropic-plugin-directory`,
        name,
        marketplaceName: 'anthropic-plugin-directory',
        installCount: 1000 - index,
      }),
    )
    const personal = Array.from({ length: 12 }, (_, index) =>
      catalogEntry({
        pluginId: `local-${index}@acme`,
        name: `local-${index}`,
        installCount: 100000 - index,
      }),
    )
    return [...developers, ...personal]
  }

  it('previews 10 per group, opens full sections, and returns from plugin details to their section', async () => {
    const catalog = groupedCatalog()
    mock.listAgentAvailablePlugins.mockResolvedValue(catalog)
    mock.getAgentPluginDetails.mockResolvedValue({
      ...emptyDetails,
      pluginId: 'superpowers@anthropic-plugin-directory',
      name: 'superpowers',
      installed: false,
    })
    const user = userEvent.setup()
    renderWithProviders(<MarketplaceSettings initialTab="plugins" hideTabs />)
    await findInstallList()

    expect(section('popular').querySelectorAll('[data-install-tile]')).toHaveLength(10)
    expect(
      section('category:developer-tools').querySelectorAll('[data-install-tile]'),
    ).toHaveLength(10)
    expect(section('marketplace:acme').querySelectorAll('[data-install-tile]')).toHaveLength(10)
    expect(section('popular').querySelector('[data-install-tile]')).toHaveTextContent('superpowers')
    act(() =>
      useCatalogCache.setState({
        catalog: catalog.map((entry) =>
          entry.name === 'feature-dev' ? { ...entry, installCount: 20000 } : entry,
        ),
      }),
    )
    expect(section('popular').querySelector('[data-install-tile]')).toHaveTextContent('feature-dev')

    await user.click(within(section('category:developer-tools')).getByRole('heading'))
    expect(useSettingsDetailStore.getState().view).toMatchObject({
      page: 'install-section',
      file: 'category:developer-tools',
    })
    expect(document.querySelectorAll('[data-install-tile]')).toHaveLength(12)

    await user.click(screen.getByText('superpowers'))
    await waitFor(() =>
      expect(document.querySelector('[data-install-detail-page]')).toBeInTheDocument(),
    )
    expect(useSettingsDetailStore.getState().view).toMatchObject({
      sub: { page: 'install-detail', file: 'superpowers@anthropic-plugin-directory' },
    })
    act(() => useSettingsDetailStore.getState().requestLeave())
    expect(document.querySelectorAll('[data-install-tile]')).toHaveLength(12)
    act(() => useSettingsDetailStore.getState().requestLeave())

    await user.click(within(section('marketplace:acme')).getByRole('heading'))
    expect(document.querySelectorAll('[data-install-tile]')).toHaveLength(12)
    act(() => useSettingsDetailStore.getState().requestLeave())

    await user.click(within(section('popular')).getByRole('heading'))
    expect(document.querySelectorAll('[data-install-tile]')).toHaveLength(12)
    expect(screen.queryByText('local-0')).toBeNull()
  })

  it('filters within Popular and retains the original ranks when sorting results', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue(
      groupedCatalog().map((entry) =>
        entry.name === 'agent-sdk-dev' ? { ...entry, description: 'Uses code-review' } : entry,
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<Extensions />)
    await findInstallList()
    await user.click(within(section('popular')).getByRole('heading'))
    const search = screen.getByPlaceholderText('搜索插件…')
    await user.type(search, 'local-')
    expect(document.querySelectorAll('[data-install-tile]')).toHaveLength(0)
    await user.clear(search)
    await user.type(search, 'ode-')
    expect(document.querySelectorAll('[data-install-tile]')).toHaveLength(3)
    for (const [label, first, rank] of [
      ['下载量从低到高', 'code-simplifier', '11'],
      ['名称降序', 'code-simplifier', '11'],
      ['名称升序', 'code-review', '10'],
      ['下载量从高到低', 'code-review', '10'],
    ]) {
      await user.click(screen.getByRole('button', { name: '插件排序' }))
      await user.click(await screen.findByRole('menuitemradio', { name: label }))
      const tile = document.querySelector('[data-install-tile]')
      expect(tile).toHaveTextContent(first)
      expect(tile?.querySelector('[data-avatar-rank]')).toHaveTextContent(rank)
    }
  })

  it('keeps all excluded component shapes and unknown directory entries searchable', async () => {
    const excluded = [
      'frontend-design',
      'context7',
      'api-drift-detector-typescript-contract-checker',
      'unreviewed-plugin',
    ]
    mock.listAgentAvailablePlugins.mockResolvedValue([
      catalogEntry(),
      ...excluded.map((name) =>
        catalogEntry({
          pluginId: `${name}@anthropic-plugin-directory`,
          name,
          marketplaceName: 'anthropic-plugin-directory',
        }),
      ),
    ])
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)
    await findInstallList()
    for (const name of excluded) expect(screen.queryByText(name)).toBeNull()
    for (const name of excluded) {
      await user.clear(screen.getByPlaceholderText('搜索插件…'))
      await user.type(screen.getByPlaceholderText('搜索插件…'), name)
      expect(screen.getByText(name)).toBeInTheDocument()
      expect(document.querySelectorAll('[data-install-tile]')).toHaveLength(1)
    }
  })

  it.each([
    {
      group: 'popular',
      title: '热门',
      name: 'superpowers',
      pluginId: 'superpowers@anthropic-plugin-directory',
    },
    {
      group: 'category:developer-tools',
      title: '开发工具',
      name: 'superpowers',
      pluginId: 'superpowers@anthropic-plugin-directory',
    },
    { group: 'marketplace:acme', title: 'acme', name: 'formatter', pluginId: 'formatter@acme' },
  ])(
    'opens a single-entry $group section from its title and returns there from preview details',
    async ({ group, title, name, pluginId }) => {
      mock.listAgentAvailablePlugins.mockResolvedValue([
        catalogEntry(),
        catalogEntry({
          pluginId: 'superpowers@anthropic-plugin-directory',
          name: 'superpowers',
          marketplaceName: 'anthropic-plugin-directory',
        }),
      ])
      mock.getAgentPluginDetails.mockResolvedValue({ ...emptyDetails, pluginId, name })
      const user = userEvent.setup()
      renderWithProviders(<MarketplaceSettings initialTab="plugins" hideTabs />)
      await findInstallList()
      await user.click(within(section(group)).getByRole('heading', { name: title }))
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
      act(() => useSettingsDetailStore.getState().requestLeave())

      await user.click(within(section(group)).getByText(name))
      expect(useSettingsDetailStore.getState().view).toMatchObject({
        page: 'install-section',
        file: group,
        sub: { page: 'install-detail', file: pluginId },
      })
      await waitFor(() =>
        expect(document.querySelector('[data-install-detail-page]')).toBeInTheDocument(),
      )

      act(() => useSettingsDetailStore.getState().requestLeave())
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
      expect(document.querySelectorAll('[data-install-tile]')).toHaveLength(1)
      act(() => useSettingsDetailStore.getState().requestLeave())
      expect(section(group)).toBeInTheDocument()
    },
  )

  it('shares successful installation state between Popular and category occurrences', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([
      catalogEntry({
        pluginId: 'superpowers@anthropic-plugin-directory',
        name: 'superpowers',
        marketplaceName: 'anthropic-plugin-directory',
      }),
    ])
    mock.installAgentPlugin.mockResolvedValue(undefined)
    mock.getAgentPluginDetails.mockResolvedValue({
      ...emptyDetails,
      pluginId: 'superpowers@anthropic-plugin-directory',
      name: 'superpowers',
    })
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)
    await findInstallList()
    expect(document.querySelectorAll('[data-install-tile]')).toHaveLength(2)
    expect(within(section('popular')).queryByRole('button', { name: '查看全部' })).toBeNull()
    expect(
      within(section('category:developer-tools')).queryByRole('button', { name: '查看全部' }),
    ).toBeNull()
    mock.listAgentPlugins.mockResolvedValue([
      installedPlugin({
        id: 'superpowers@anthropic-plugin-directory',
        name: 'superpowers',
        marketplace: 'anthropic-plugin-directory',
      }),
    ])
    await user.click(within(section('popular')).getByRole('button', { name: '安装插件' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: '更多操作' })).toHaveLength(2))
    expect(screen.queryByRole('button', { name: '安装插件' })).toBeNull()
  })

  it('previews category leaders by alias runtime counts and still installs their original directory ids', async () => {
    const directory = groupedCatalog()
      .filter((entry) => entry.marketplaceName === 'anthropic-plugin-directory')
      .map((entry) => ({ ...entry, installCount: undefined }))
    const aliases = directory.map((entry, index) => ({
      ...entry,
      pluginId: `${entry.name}@claude-plugins-official`,
      marketplaceName: 'claude-plugins-official',
      installCount: 1000 + index,
    }))
    mock.listAgentAvailablePlugins.mockResolvedValue([...directory, ...aliases])
    mock.installAgentPlugin.mockResolvedValue(undefined)
    mock.getAgentPluginDetails.mockResolvedValue(emptyDetails)
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)
    await findInstallList()
    const category = section('category:developer-tools')
    const tiles = [...category.querySelectorAll('[data-install-tile]')]
    expect(tiles).toHaveLength(10)
    expect(tiles[0]).toHaveTextContent('commit-commands')
    expect(tiles[0]).toHaveTextContent('1,011')
    expect(tiles[5]).toHaveTextContent('agent-sdk-dev')
    await user.click(within(tiles[0] as HTMLElement).getByRole('button', { name: '安装插件' }))
    await waitFor(() =>
      expect(mock.installAgentPlugin).toHaveBeenCalledWith(
        'commit-commands@anthropic-plugin-directory',
      ),
    )
  })

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

  it('groups custom marketplaces and leaves unreviewed directory entries searchable', async () => {
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

    const list = await findInstallList()
    expect(list.queryByText('docs')).toBeNull()
    expect(list.getByText('formatter')).toBeInTheDocument()
    expect(document.querySelector('[data-catalog-section="marketplace:acme"]')).toBeInTheDocument()
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
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)
    await findInstallList()
    await user.type(screen.getByPlaceholderText('搜索插件…'), 'superpowers')

    const list = await findInstallList()
    expect(list.getAllByText('superpowers')).toHaveLength(2)
    expect(list.getByRole('button', { name: '更多操作' })).toBeInTheDocument()
    expect(list.getByRole('button', { name: '安装插件' })).toBeInTheDocument()
    expect(list.queryByText('superpowers-marketplace')).toBeNull()
    expect(list.queryByText('anthropic-plugin-directory')).toBeNull()
    expect(
      [...document.querySelectorAll('[data-install-tile]')].map((tile) =>
        tile.getAttribute('data-plugin-id'),
      ),
    ).toEqual(['superpowers@anthropic-plugin-directory', 'superpowers@superpowers-marketplace'])
  })

  it('searches across sources without a source selector', async () => {
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
    await user.type(screen.getByPlaceholderText('搜索插件…'), 'Formats')
    expect(list.getByText('docs')).toBeInTheDocument()
    expect(list.getByText('formatter')).toBeInTheDocument()

    expect(screen.queryByRole('combobox', { name: '来源' })).toBeNull()
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
    expect(list.queryByText('claude-plugins-official')).toBeNull()
    expect(list.queryByText('anthropic-plugin-directory')).toBeNull()

    const directoryTile = document.querySelector(
      '[data-plugin-id="frontend-design@anthropic-plugin-directory"]',
    ) as HTMLElement
    await user.click(within(directoryTile).getByRole('button', { name: '安装插件' }))
    await waitFor(() =>
      expect(mock.installAgentPlugin).toHaveBeenCalledWith(
        'frontend-design@anthropic-plugin-directory',
      ),
    )

    const officialTile = document.querySelector(
      '[data-plugin-id="frontend-design@claude-plugins-official"]',
    ) as HTMLElement
    expect(within(officialTile).getByRole('button', { name: '更多操作' })).toBeInTheDocument()
  })

  it('filters the full catalog by search', async () => {
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
    expect(tiles[0]).toHaveAttribute('data-plugin-id', 'superpowers@claude-plugins-official')
    expect(tiles[1]).toHaveAttribute('data-plugin-id', 'superpowers@anthropic-plugin-directory')
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

  it('installs and uninstalls from the detail page', async () => {
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
    await user.click(await screen.findByRole('button', { name: '卸载' }))
    expect(mock.removeAgentPlugin).toHaveBeenCalledWith('fmt@acme')
    expect(await screen.findByRole('button', { name: '安装插件' })).toBeEnabled()
  })
})
