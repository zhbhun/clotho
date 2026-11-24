import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { useSettingsDetailStore } from '../../../components/marketplace/settings-detail-store'
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
  useSettingsDetailStore.getState().backToList()
  mock.getAgentCapabilityToggles.mockResolvedValue({
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
  it.each(['url', 'command'] as const)(
    'shows a locked off switch for a %s deny rule',
    async (blockedBy) => {
      mock.listAgentMcpServers.mockResolvedValue([
        { name: 'docs', type: 'http', url: 'https://mcp.example', disabled: true, blockedBy },
      ])
      const user = userEvent.setup()
      renderWithProviders(<AgentMcpSettings />)
      const toggle = await screen.findByRole('switch')
      expect(toggle).not.toBeChecked()
      expect(toggle).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByText(/需在 Claude Code 用户设置中修改规则后启用/)).toBeInTheDocument()
      await user.click(toggle)
      expect(mock.setAgentCapabilityToggle).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('名称')).not.toBeInTheDocument()
    },
  )

  it('lists servers with type and connection summary on the second line', async () => {
    mock.listAgentMcpServers.mockResolvedValue([
      { name: 'docs', type: 'http', url: 'https://mcp.example' },
      { name: 'local', type: 'stdio', command: 'npx', args: ['-y', 'server'] },
    ])
    renderWithProviders(<AgentMcpSettings />)

    expect(await screen.findByText('docs')).toBeInTheDocument()
    expect(screen.getByText('http · https://mcp.example')).toBeInTheDocument()
    expect(screen.getByText('stdio · npx -y server')).toBeInTheDocument()
  })

  it('switches editor fields with the server type and saves through the RPC', async () => {
    mock.listAgentMcpServers.mockResolvedValue([])
    mock.saveAgentMcpServer.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentMcpSettings />)

    await user.click(await screen.findByRole('button', { name: '添加服务器' }))
    await user.type(screen.getByLabelText('名称'), 'remote')
    await user.click(screen.getByRole('button', { name: 'Streamable HTTP' }))
    await user.type(screen.getByLabelText('URL'), 'https://mcp.example')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mock.saveAgentMcpServer).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'remote', type: 'http', url: 'https://mcp.example' }),
        undefined,
      ),
    )
  })

  it('opens the existing server editor when clicking the row', async () => {
    mock.listAgentMcpServers.mockResolvedValue([
      { name: 'docs', type: 'http', url: 'https://mcp.example' },
    ])
    const user = userEvent.setup()
    renderWithProviders(<AgentMcpSettings />)

    await user.click(await screen.findByText('http · https://mcp.example'))

    expect(screen.getByLabelText('名称')).toHaveValue('docs')
    expect(screen.getByLabelText('URL')).toHaveValue('https://mcp.example')
  })

  it('opens the menu without editing, then edits from the menu', async () => {
    mock.listAgentMcpServers.mockResolvedValue([
      { name: 'docs', type: 'http', url: 'https://mcp.example' },
    ])
    const user = userEvent.setup()
    renderWithProviders(<AgentMcpSettings />)

    await user.click(await screen.findByRole('button', { name: '更多操作 · docs' }))
    expect(screen.queryByLabelText('名称')).toBeNull()
    await user.click(await screen.findByRole('menuitem', { name: '编辑' }))

    expect(screen.getByLabelText('名称')).toHaveValue('docs')
  })

  it('toggles a server through the capability toggle RPC', async () => {
    mock.listAgentMcpServers.mockResolvedValue([
      { name: 'docs', type: 'http', url: 'https://mcp.example' },
    ])
    mock.setAgentCapabilityToggle.mockResolvedValue({
      disabledSkills: [],
      disabledMcpServers: ['docs'],
    })
    const user = userEvent.setup()
    renderWithProviders(<AgentMcpSettings />)

    await user.click(await screen.findByRole('switch', { name: '在 Claude Code 中启用' }))

    await waitFor(() =>
      expect(mock.setAgentCapabilityToggle).toHaveBeenCalledWith('mcp', 'docs', false),
    )
    expect(screen.queryByLabelText('名称')).toBeNull()
  })

  it('deletes a server after confirmation', async () => {
    mock.listAgentMcpServers.mockResolvedValue([
      { name: 'docs', type: 'http', url: 'https://mcp.example' },
    ])
    mock.deleteAgentMcpServer.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentMcpSettings />)

    await user.click(await screen.findByRole('button', { name: '更多操作 · docs' }))
    await user.click(await screen.findByRole('menuitem', { name: '删除' }))
    expect(mock.deleteAgentMcpServer).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('名称')).toBeNull()
    await user.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => expect(mock.deleteAgentMcpServer).toHaveBeenCalledWith('docs'))
  })
})
