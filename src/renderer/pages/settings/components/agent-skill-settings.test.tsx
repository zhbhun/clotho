import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import * as agentConfig from '../../../services/claude/agent-config'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { AgentSkillSettings } from './agent-skill-settings'

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
    disabledSkills: ['already-off'],
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

describe('AgentSkillSettings', () => {
  it('lists skills with their descriptions', async () => {
    mock.listAgentSkills.mockResolvedValue([
      { name: 'commit', description: 'Commit helper' },
      { name: 'review', description: 'Review helper' },
    ])
    renderWithProviders(<AgentSkillSettings />)

    expect(await screen.findByText('commit')).toBeInTheDocument()
    expect(screen.getByText('Commit helper')).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
  })

  it('toggles a skill through the capability toggle RPC', async () => {
    mock.listAgentSkills.mockResolvedValue([{ name: 'commit', description: '' }])
    mock.setAgentCapabilityToggle.mockResolvedValue({
      disabledPlugins: [],
      disabledSkills: ['commit'],
      disabledMcpServers: [],
    })
    const user = userEvent.setup()
    renderWithProviders(<AgentSkillSettings />)

    const switches = await screen.findAllByRole('switch', { name: '在 Clotho 会话中启用' })
    await user.click(switches[0]!)

    await waitFor(() =>
      expect(mock.setAgentCapabilityToggle).toHaveBeenCalledWith('skill', 'commit', false),
    )
  })

  it('deletes a skill after confirmation', async () => {
    mock.listAgentSkills.mockResolvedValue([{ name: 'old', description: '' }])
    mock.deleteAgentSkill.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentSkillSettings />)

    await user.click(await screen.findByRole('button', { name: 'old' }))
    await user.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => expect(mock.deleteAgentSkill).toHaveBeenCalledWith('old'))
  })
})
