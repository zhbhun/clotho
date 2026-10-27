import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import * as agentConfig from '../../../services/claude/agent-config'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { AgentWorkflowSettings } from './agent-workflow-settings'

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

describe('AgentWorkflowSettings', () => {
  it('lists workflows with their last-modified time', async () => {
    mock.listAgentWorkflows.mockResolvedValue([
      { name: 'deploy.md', lastModifiedMs: new Date('2026-01-15T10:00:00Z').getTime() },
    ])
    renderWithProviders(<AgentWorkflowSettings />)

    expect(await screen.findByText('deploy.md')).toBeInTheDocument()
    expect(screen.getByText(/修改时间/)).toBeInTheDocument()
  })

  it('edits and saves a workflow through the RPC', async () => {
    mock.listAgentWorkflows.mockResolvedValue([{ name: 'deploy.md', lastModifiedMs: 1 }])
    mock.readAgentWorkflow.mockResolvedValue({ content: '# steps' })
    mock.saveAgentWorkflow.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentWorkflowSettings />)

    await user.click(await screen.findByRole('button', { name: '编辑' }))
    const editor = await screen.findByLabelText('内容')
    await user.clear(editor)
    await user.type(editor, '# new steps')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mock.saveAgentWorkflow).toHaveBeenCalledWith('deploy.md', '# new steps'),
    )
  })

  it('renames a workflow through the RPC', async () => {
    mock.listAgentWorkflows.mockResolvedValue([{ name: 'deploy.md', lastModifiedMs: 1 }])
    mock.readAgentWorkflow.mockResolvedValue({ content: '# steps' })
    mock.saveAgentWorkflow.mockResolvedValue(undefined)
    mock.renameAgentWorkflow.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentWorkflowSettings />)

    await user.click(await screen.findByRole('button', { name: '编辑' }))
    const nameInput = await screen.findByLabelText('名称')
    await user.clear(nameInput)
    await user.type(nameInput, 'release.md')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mock.renameAgentWorkflow).toHaveBeenCalledWith('deploy.md', 'release.md'),
    )
  })

  it('deletes a workflow after confirmation', async () => {
    mock.listAgentWorkflows.mockResolvedValue([{ name: 'deploy.md', lastModifiedMs: 1 }])
    mock.deleteAgentWorkflow.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentWorkflowSettings />)

    await user.click(await screen.findByRole('button', { name: 'deploy.md' }))
    await user.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => expect(mock.deleteAgentWorkflow).toHaveBeenCalledWith('deploy.md'))
  })
})
