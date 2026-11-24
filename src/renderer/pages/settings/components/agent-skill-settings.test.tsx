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
  readAgentSkill: vi.fn(),
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
  mock.getAgentCapabilityToggles.mockResolvedValue({ disabledSkills: [], disabledMcpServers: [] })
  useSettingsDetailStore.getState().backToList()
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
  it('lists skills with their persisted enable states', async () => {
    mock.listAgentSkills.mockResolvedValue([
      { name: 'commit', description: 'Commit helper' },
      { name: 'review', description: 'Review helper' },
    ])
    mock.getAgentCapabilityToggles.mockResolvedValue({
      disabledSkills: ['review'],
      disabledMcpServers: [],
    })
    renderWithProviders(<AgentSkillSettings onOpenMarketplace={vi.fn()} />)

    expect(await screen.findByText('commit')).toBeInTheDocument()
    expect(screen.getByText('Commit helper')).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
    const toggles = screen.getAllByRole('switch')
    expect(toggles[0]).toBeChecked()
    expect(toggles[1]).not.toBeChecked()
  })

  it.each([true, false])('saves a skill toggle when initially enabled=%s', async (enabled) => {
    mock.listAgentSkills.mockResolvedValue([{ name: 'review', description: 'Review code' }])
    mock.getAgentCapabilityToggles.mockResolvedValue({
      disabledSkills: enabled ? [] : ['review'],
      disabledMcpServers: [],
    })
    mock.setAgentCapabilityToggle.mockResolvedValue({
      disabledSkills: enabled ? ['review'] : [],
      disabledMcpServers: [],
    })
    const user = userEvent.setup()
    renderWithProviders(<AgentSkillSettings onOpenMarketplace={vi.fn()} />)

    const toggle = await screen.findByRole('switch')
    await user.click(toggle)

    await waitFor(() =>
      expect(mock.setAgentCapabilityToggle).toHaveBeenCalledWith('skill', 'review', !enabled),
    )
    expect(toggle).toHaveAttribute('aria-checked', String(!enabled))
    expect(mock.readAgentSkill).not.toHaveBeenCalled()
    expect(screen.getByText('Review code')).toBeInTheDocument()
  })

  it('keeps the original enable state when saving fails', async () => {
    mock.listAgentSkills.mockResolvedValue([{ name: 'review', description: 'Review code' }])
    mock.setAgentCapabilityToggle.mockRejectedValue(new Error('Cannot write settings'))
    const user = userEvent.setup()
    renderWithProviders(<AgentSkillSettings onOpenMarketplace={vi.fn()} />)

    const toggle = await screen.findByRole('switch')
    await user.click(toggle)

    expect(await screen.findByText('保存失败')).toBeInTheDocument()
    expect(toggle).toBeChecked()
    expect(toggle).not.toBeDisabled()
  })

  it.each(['row', 'menu'])('opens the installed document from the %s', async (entry) => {
    mock.listAgentSkills.mockResolvedValue([{ name: 'review', description: 'Review code' }])
    mock.readAgentSkill.mockResolvedValue({
      metadata: { name: 'review', version: '2.0' },
      body: '# Review steps',
    })
    const user = userEvent.setup()
    renderWithProviders(<AgentSkillSettings onOpenMarketplace={vi.fn()} />)
    if (entry === 'menu') {
      await user.click(await screen.findByRole('button', { name: /review/ }))
      await user.click(await screen.findByRole('menuitem', { name: '打开' }))
    } else {
      await user.click(await screen.findByText('review'))
    }
    expect(await screen.findByText('2.0')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Review steps' })).toBeInTheDocument()
    expect(mock.readAgentSkill).toHaveBeenCalledWith('review')
  })

  it('deletes a skill after confirmation', async () => {
    mock.listAgentSkills
      .mockResolvedValueOnce([{ name: 'old', description: '' }])
      .mockResolvedValueOnce([])
    mock.deleteAgentSkill.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentSkillSettings onOpenMarketplace={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /old/ }))
    await user.click(await screen.findByRole('menuitem', { name: '卸载' }))
    expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription(
      /从 ~\/\.claude\/skills 中删除「old」.*Claude Code/,
    )
    expect(mock.deleteAgentSkill).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: '卸载' }))

    await waitFor(() => expect(mock.deleteAgentSkill).toHaveBeenCalledWith('old'))
    expect(await screen.findByText('暂无内容')).toBeInTheDocument()
  })
})
