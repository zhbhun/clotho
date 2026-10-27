import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import * as agentConfig from '../../../services/claude/agent-config'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { AgentHookSettings } from './agent-hook-settings'

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

describe('AgentHookSettings', () => {
  it('lists hook groups by event', async () => {
    mock.listAgentHookGroups.mockResolvedValue([
      {
        event: 'Stop',
        entries: [{ matcher: '', hooks: [{ type: 'command', command: "echo 'done'" }] }],
      },
    ])
    renderWithProviders(<AgentHookSettings />)

    expect(await screen.findByText('Stop')).toBeInTheDocument()
    expect(screen.getByText('1 × command')).toBeInTheDocument()
  })

  it('adds command rows and saves the CLI-shaped payload', async () => {
    mock.listAgentHookGroups.mockResolvedValue([])
    mock.saveAgentHookGroup.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentHookSettings />)

    await user.click(await screen.findByRole('button', { name: '添加钩子' }))
    await user.type(screen.getByLabelText('事件'), 'Stop')
    await user.type(screen.getByLabelText('命令'), 'echo one')
    await user.click(screen.getByRole('button', { name: '添加命令' }))
    await user.type(screen.getAllByLabelText('命令')[1]!, 'echo two')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mock.saveAgentHookGroup).toHaveBeenCalledWith({
        event: 'Stop',
        entries: [
          {
            matcher: '',
            hooks: [
              { type: 'command', command: 'echo one' },
              { type: 'command', command: 'echo two' },
            ],
          },
        ],
      }),
    )
  })

  it('deletes a hook group after confirmation', async () => {
    mock.listAgentHookGroups.mockResolvedValue([
      { event: 'Stop', entries: [{ hooks: [{ type: 'command', command: 'x' }] }] },
    ])
    mock.deleteAgentHookGroup.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentHookSettings />)

    await user.click(await screen.findByRole('button', { name: 'Stop' }))
    await user.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => expect(mock.deleteAgentHookGroup).toHaveBeenCalledWith('Stop'))
  })
})
