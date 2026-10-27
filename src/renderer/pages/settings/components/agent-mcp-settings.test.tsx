import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import * as agentConfig from '../../../services/claude/agent-config'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { AgentMcpSettings } from './agent-mcp-settings'

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

describe('AgentMcpSettings', () => {
  it('lists servers with type badges and connection summary', async () => {
    mock.listAgentMcpServers.mockResolvedValue([
      { name: 'docs', type: 'http', url: 'https://mcp.example' },
      { name: 'local', type: 'stdio', command: 'npx', args: ['-y', 'server'] },
    ])
    renderWithProviders(<AgentMcpSettings />)

    expect(await screen.findByText('docs')).toBeInTheDocument()
    expect(screen.getByText('https://mcp.example')).toBeInTheDocument()
    expect(screen.getByText('npx -y server')).toBeInTheDocument()
    expect(screen.getAllByText('http')).toHaveLength(1)
    expect(screen.getAllByText('stdio')).toHaveLength(1)
  })

  it('switches editor fields with the server type and saves through the RPC', async () => {
    mock.listAgentMcpServers.mockResolvedValue([])
    mock.saveAgentMcpServer.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentMcpSettings />)

    await user.click(await screen.findByRole('button', { name: '添加服务器' }))
    await user.type(screen.getByLabelText('名称'), 'remote')
    await user.click(screen.getByRole('button', { name: 'http' }))
    await user.type(screen.getByLabelText('URL'), 'https://mcp.example')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mock.saveAgentMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'remote', type: 'http', url: 'https://mcp.example' }),
        undefined,
      ),
    )
  })

  it('toggles a server through the capability toggle RPC', async () => {
    mock.listAgentMcpServers.mockResolvedValue([
      { name: 'docs', type: 'http', url: 'https://mcp.example' },
    ])
    mock.setAgentCapabilityToggle.mockResolvedValue({
      disabledPlugins: [],
      disabledSkills: [],
      disabledMcpServers: ['docs'],
    })
    const user = userEvent.setup()
    renderWithProviders(<AgentMcpSettings />)

    await user.click(await screen.findByRole('switch', { name: '在 Clotho 会话中启用' }))

    await waitFor(() =>
      expect(mock.setAgentCapabilityToggle).toHaveBeenCalledWith('mcp', 'docs', false),
    )
  })

  it('deletes a server after confirmation', async () => {
    mock.listAgentMcpServers.mockResolvedValue([
      { name: 'docs', type: 'http', url: 'https://mcp.example' },
    ])
    mock.deleteAgentMcpServer.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentMcpSettings />)

    await user.click(await screen.findByRole('button', { name: 'docs' }))
    await user.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => expect(mock.deleteAgentMcpServer).toHaveBeenCalledWith('docs'))
  })
})
