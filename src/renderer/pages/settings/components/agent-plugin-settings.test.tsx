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
  it('lists installed plugins with scope, marketplace, and version on the second line', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin()])
    renderWithProviders(<AgentPluginSettings />)

    expect(await screen.findByText('formatter')).toBeInTheDocument()
    expect(screen.getByText('user · acme · 1.0.0')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '在 Clotho 会话中启用' })).toBeChecked()
    // Rows carry no delete action: the only button naming the plugin is the chevron.
    expect(screen.getAllByRole('button', { name: 'formatter@acme' })).toHaveLength(1)
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

  it('opens the plugin detail page from the row chevron', async () => {
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

    await user.click(await screen.findByRole('button', { name: 'formatter@acme' }))

    expect(useSettingsDetailStore.getState().view.kind).toBe('detail')
    const view = useSettingsDetailStore.getState().view
    if (view.kind === 'detail') expect(view.file).toBe('formatter@acme')
    expect(await screen.findByText('Formats things')).toBeInTheDocument()
    expect(screen.getByText('format')).toBeInTheDocument()
  })

  it('refreshes all marketplaces from the overflow menu', async () => {
    mock.refreshAgentMarketplace.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    await user.click(within(menu).getByRole('menuitem', { name: '全部刷新' }))

    await waitFor(() => expect(mock.refreshAgentMarketplace).toHaveBeenCalledWith())
  })

  it('opens the marketplaces page from the overflow menu', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('button', { name: '更多操作' }))
    const menu = await screen.findByRole('menu', { name: '更多操作' })
    await user.click(within(menu).getByRole('menuitem', { name: '插件市场' }))

    const view = useSettingsDetailStore.getState().view
    expect(view.kind).toBe('detail')
    if (view.kind === 'detail') expect(view.page).toBe('marketplaces')
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

  it('classifies catalog entries into Public/Community/Personal tabs', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([
      catalogEntry(),
      catalogEntry({
        pluginId: 'docs@anthropic-plugin-directory',
        name: 'docs',
        marketplaceName: 'anthropic-plugin-directory',
      }),
      catalogEntry({
        pluginId: 'local@zhbhun',
        name: 'local-tool',
        marketplaceName: 'zhbhun',
        installCount: undefined,
      }),
    ])
    mock.listAgentMarketplaces.mockResolvedValue([
      {
        name: 'acme',
        source: { source: 'github', repo: 'acme/plugins' },
        installLocation: '/mp/acme',
      },
      {
        name: 'zhbhun',
        source: { source: 'directory', url: '/tmp/z' },
        installLocation: '/mp/z',
      },
    ])
    renderWithProviders(<InstallPluginPage />)

    // Public tab (default): only the directory entry.
    expect(await screen.findByText('docs')).toBeInTheDocument()
    expect(screen.queryByText('formatter')).toBeNull()

    // Community tab: the github marketplace entry with install count.
    await userEvent.setup().click(screen.getByRole('tab', { name: '社区' }))
    expect(await screen.findByText('formatter')).toBeInTheDocument()
    expect(screen.getByText('42 次安装 · Formats things')).toBeInTheDocument()
    expect(screen.queryByText('docs')).toBeNull()

    // Personal tab: the local-directory entry falls back to the marketplace name.
    await userEvent.setup().click(screen.getByRole('tab', { name: '个人' }))
    expect(await screen.findByText('local-tool')).toBeInTheDocument()
    expect(screen.getByText(/zhbhun/)).toBeInTheDocument()
  })

  it('filters entries by search text within the active tab', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([
      catalogEntry({ pluginId: 'a@acme', name: 'alpha' }),
      catalogEntry({ pluginId: 'b@acme', name: 'beta' }),
    ])
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    await user.click(await screen.findByRole('tab', { name: '社区' }))
    await user.type(screen.getByPlaceholderText('搜索插件…'), 'alp')

    expect(await screen.findByText('alpha')).toBeInTheDocument()
    expect(screen.queryByText('beta')).toBeNull()
  })

  it('installs from the grid plus button and flips the entry to installed', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([catalogEntry()])
    mock.installAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<InstallPluginPage />)

    await user.click(await screen.findByRole('tab', { name: '社区' }))
    await user.click(await screen.findByRole('button', { name: '安装' }))

    await waitFor(() => expect(mock.installAgentPlugin).toHaveBeenCalledWith('formatter@acme'))
    expect(await screen.findByText('已安装')).toBeInTheDocument()
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()
  })
})
