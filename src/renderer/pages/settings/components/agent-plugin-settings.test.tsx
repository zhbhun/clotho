import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import * as agentConfig from '../../../services/claude/agent-config'
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
  mock.listAgentPlugins.mockResolvedValue([])
  mock.listAgentMarketplaces.mockResolvedValue([])
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

describe('AgentPluginSettings', () => {
  it('lists installed plugins with marketplace, version, and enabled state', async () => {
    mock.listAgentPlugins.mockResolvedValue([installedPlugin({ notes: ['uses a yarn lockfile'] })])
    renderWithProviders(<AgentPluginSettings />)

    expect(await screen.findByText('formatter')).toBeInTheDocument()
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.getByText(/acme/)).toBeInTheDocument()
    expect(screen.getByText(/uses a yarn lockfile/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '在 Clotho 会话中启用' })).toBeChecked()
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

  it('adds a marketplace from any CLI-supported source', async () => {
    mock.addAgentMarketplace.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.type(
      await screen.findByPlaceholderText('市场来源（git URL、GitHub 仓库、URL 或本地路径）'),
      'https://github.com/acme/plugins.git',
    )
    await user.click(screen.getByRole('button', { name: '添加市场' }))

    await waitFor(() =>
      expect(mock.addAgentMarketplace).toHaveBeenCalledWith('https://github.com/acme/plugins.git'),
    )
  })

  it('refreshes a marketplace', async () => {
    mock.listAgentMarketplaces.mockResolvedValue([
      {
        name: 'acme',
        source: { source: 'git', url: 'https://github.com/acme/plugins.git' },
        installLocation: '/mp/acme',
      },
    ])
    mock.refreshAgentMarketplace.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('button', { name: '刷新' }))

    await waitFor(() => expect(mock.refreshAgentMarketplace).toHaveBeenCalledWith('acme'))
  })

  it('browses the catalog and installs an available plugin by id', async () => {
    mock.listAgentAvailablePlugins.mockResolvedValue([
      {
        pluginId: 'formatter@acme',
        name: 'formatter',
        description: 'Formats things',
        marketplaceName: 'acme',
        installCount: 42,
      },
    ])
    mock.installAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('button', { name: '浏览目录' }))

    expect(await screen.findByText('formatter')).toBeInTheDocument()
    expect(screen.getByText(/Formats things/)).toBeInTheDocument()
    expect(screen.getByText('42 次安装')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '安装' }))
    await waitFor(() => expect(mock.installAgentPlugin).toHaveBeenCalledWith('formatter@acme'))
    expect(await screen.findByText('插件变更将在新会话中生效')).toBeInTheDocument()
  })
})
