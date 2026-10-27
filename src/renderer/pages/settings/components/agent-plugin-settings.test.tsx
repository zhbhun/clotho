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
  listAgentMarketplaces: vi.fn(),
  addAgentMarketplace: vi.fn(),
  removeAgentMarketplace: vi.fn(),
  installAgentPlugin: vi.fn(),
  removeAgentPlugin: vi.fn(),
  listAgentWorkflows: vi.fn(),
  readAgentWorkflow: vi.fn(),
  saveAgentWorkflow: vi.fn(),
  renameAgentWorkflow: vi.fn(),
  deleteAgentWorkflow: vi.fn(),
  getAgentCapabilityToggles: vi.fn(),
  setAgentCapabilityToggle: vi.fn(),
}))

const mock = vi.mocked(agentConfig, true)

beforeEach(async () => {
  await appI18n.changeLanguage('zh-CN')
  vi.clearAllMocks()
  mock.getAgentCapabilityToggles.mockResolvedValue({
    disabledPlugins: [],
    disabledSkills: [],
    disabledMcpServers: [],
  })
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

describe('AgentPluginSettings', () => {
  it('lists installed plugins with marketplace and version', async () => {
    mock.listAgentPlugins.mockResolvedValue([
      {
        id: 'formatter@acme',
        name: 'formatter',
        marketplace: 'acme',
        version: '1.0.0',
        installPath: '/tmp/formatter',
      },
    ])
    mock.listAgentMarketplaces.mockResolvedValue([])
    renderWithProviders(<AgentPluginSettings />)

    expect(await screen.findByText('formatter')).toBeInTheDocument()
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.getByText('acme')).toBeInTheDocument()
  })

  it('toggles a plugin through the capability toggle RPC', async () => {
    mock.listAgentPlugins.mockResolvedValue([
      {
        id: 'formatter@acme',
        name: 'formatter',
        marketplace: 'acme',
        version: '1.0.0',
        installPath: '/tmp/formatter',
      },
    ])
    mock.listAgentMarketplaces.mockResolvedValue([])
    mock.setAgentCapabilityToggle.mockResolvedValue({
      disabledPlugins: ['formatter@acme'],
      disabledSkills: [],
      disabledMcpServers: [],
    })
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('switch', { name: '在 Clotho 会话中启用' }))

    await waitFor(() =>
      expect(mock.setAgentCapabilityToggle).toHaveBeenCalledWith('plugin', 'formatter@acme', false),
    )
  })

  it('adds a marketplace by git URL', async () => {
    mock.listAgentPlugins.mockResolvedValue([])
    mock.listAgentMarketplaces.mockResolvedValue([])
    mock.addAgentMarketplace.mockResolvedValue({ name: 'acme' })
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.type(
      await screen.findByPlaceholderText('Git URL'),
      'https://github.com/acme/plugins.git',
    )
    await user.click(screen.getByRole('button', { name: '添加市场' }))

    await waitFor(() =>
      expect(mock.addAgentMarketplace).toHaveBeenCalledWith('https://github.com/acme/plugins.git'),
    )
  })

  it('installs a plugin from a marketplace', async () => {
    mock.listAgentPlugins.mockResolvedValue([])
    mock.listAgentMarketplaces.mockResolvedValue([
      {
        name: 'acme',
        source: { source: 'git', url: 'https://github.com/acme/plugins.git' },
        plugins: [{ name: 'formatter', description: 'Formats' }],
      },
    ])
    mock.installAgentPlugin.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentPluginSettings />)

    await user.click(await screen.findByRole('button', { name: '安装' }))

    await waitFor(() => expect(mock.installAgentPlugin).toHaveBeenCalledWith('acme', 'formatter'))
  })
})
