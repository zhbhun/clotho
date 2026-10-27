import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import * as agentConfig from '../../../services/claude/agent-config'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { AgentSubagentSettings } from './agent-subagent-settings'

vi.mock('../../../services/claude/agent-config', () => ({
  listAgentSubagents: vi.fn(),
  saveAgentSubagent: vi.fn(),
  deleteAgentSubagent: vi.fn(),
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
describe('AgentSubagentSettings', () => {
  it('lists subagents from the RPC', async () => {
    mock.listAgentSubagents.mockResolvedValue([
      {
        file: 'reviewer',
        name: 'reviewer',
        description: 'Reviews code',
        model: 'sonnet',
        body: 'p',
      },
    ])
    renderWithProviders(<AgentSubagentSettings />)

    expect(await screen.findByText('reviewer')).toBeInTheDocument()
    expect(screen.getByText('Reviews code')).toBeInTheDocument()
    expect(screen.getByText('sonnet')).toBeInTheDocument()
  })

  it('saves a new subagent through the RPC', async () => {
    mock.listAgentSubagents.mockResolvedValue([])
    mock.saveAgentSubagent.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentSubagentSettings />)

    await user.click(await screen.findByRole('button', { name: '新建子智能体' }))
    await user.type(screen.getByLabelText('名称'), 'my-agent')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mock.saveAgentSubagent).toHaveBeenCalledWith(
        expect.objectContaining({ file: 'my-agent', name: 'my-agent' }),
      ),
    )
  })

  it('deletes a subagent after confirmation', async () => {
    mock.listAgentSubagents.mockResolvedValue([
      { file: 'old', name: 'old', description: '', body: '' },
    ])
    mock.deleteAgentSubagent.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentSubagentSettings />)

    await user.click(await screen.findByRole('button', { name: 'old' }))
    await user.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => expect(mock.deleteAgentSubagent).toHaveBeenCalledWith('old'))
  })

  it('flags broken files as not editable', async () => {
    mock.listAgentSubagents.mockResolvedValue([{ file: 'damaged', body: '', broken: true }])
    renderWithProviders(<AgentSubagentSettings />)

    expect(await screen.findByText('damaged')).toBeInTheDocument()
    expect(screen.getByText('文件无法解析，请删除或在磁盘上修复。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()
  })
})
