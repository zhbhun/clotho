import { render, screen, waitFor, within } from '@testing-library/react'
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
  listAgentAvailableSubagents: vi.fn(),
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

function getCard(source: string) {
  return document.querySelector(`[data-source-card="${source}"]`) as HTMLElement
}

async function setup(subagents: agentConfig.AgentSubagentConfig[]) {
  mock.listAgentAvailableSubagents.mockResolvedValue(subagents)
  renderWithProviders(<AgentSubagentSettings />)
  // Loading renders a bare spinner; wait for the installed-count heading.
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: /已安装 \d+ 项/ })).toBeInTheDocument(),
  )
}

const BUILTIN = {
  file: 'Explore',
  name: 'Explore',
  description: 'Read-only search agent',
  model: 'inherit',
  body: '',
  builtin: true,
  source: 'builtin' as const,
}

const PLUGIN = {
  file: 'caveman:cavecrew-reviewer',
  name: 'caveman:cavecrew-reviewer',
  description: 'Plugin agent',
  model: 'haiku',
  body: '',
  builtin: true,
  source: 'plugin' as const,
}

const CUSTOM = {
  file: 'reviewer',
  name: 'reviewer',
  description: 'Reviews code',
  model: 'sonnet',
  body: 'p',
  builtin: false,
  source: 'custom' as const,
}

describe('AgentSubagentSettings', () => {
  it('renders all three cards stacked with text-only subtle source labels under the heading', async () => {
    await setup([CUSTOM, BUILTIN, PLUGIN])

    // All three cards exist simultaneously.
    expect(getCard('builtin')).toBeInTheDocument()
    expect(getCard('plugin')).toBeInTheDocument()
    expect(getCard('custom')).toBeInTheDocument()

    const builtin = within(getCard('builtin'))
    expect(builtin.getByText('Explore')).toBeInTheDocument()
    expect(builtin.getByText('内置')).toHaveClass('text-foreground-subtlest')
    // Card labels are text-only: no icon before the label.
    expect(
      within(builtin.getByText('内置').closest('div') as HTMLElement).queryByRole('img'),
    ).not.toBeInTheDocument()

    expect(within(getCard('plugin')).getByText('caveman:cavecrew-reviewer')).toBeInTheDocument()
    expect(within(getCard('custom')).getByText('reviewer')).toBeInTheDocument()

    // No tabs; the heading is an installed summary with the Add button on its right.
    expect(document.querySelector('[role="tablist"]')).not.toBeInTheDocument()
    const heading = screen.getByRole('heading', { name: '已安装 3 项' })
    expect(heading).toBeInTheDocument()
    const countSpan = within(heading).getByText('3 项')
    expect(countSpan).toHaveClass('text-foreground-subtlest')
    expect(screen.getByRole('button', { name: '添加' })).toBeInTheDocument()
  })

  it('keeps builtin and plugin rows read-only and hides no card', async () => {
    await setup([BUILTIN, PLUGIN])

    expect(
      within(getCard('builtin')).queryByRole('button', { name: '编辑' }),
    ).not.toBeInTheDocument()
    expect(
      within(getCard('builtin')).queryByRole('button', { name: '删除' }),
    ).not.toBeInTheDocument()
    expect(
      within(getCard('plugin')).queryByRole('button', { name: '编辑' }),
    ).not.toBeInTheDocument()
    expect(
      within(getCard('plugin')).queryByRole('button', { name: '删除' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刷新' })).not.toBeInTheDocument()
  })

  it('shows the empty hint on empty cards while keeping their labels', async () => {
    await setup([BUILTIN])

    const custom = within(getCard('custom'))
    expect(custom.getByText('自定义')).toBeInTheDocument()
    expect(custom.getByText('暂无内容')).toBeInTheDocument()

    const plugin = within(getCard('plugin'))
    expect(plugin.getByText('插件')).toBeInTheDocument()
    expect(plugin.getByText('暂无内容')).toBeInTheDocument()
  })

  it('edits a custom subagent through the chevron and the RPC', async () => {
    await setup([CUSTOM])
    mock.saveAgentSubagent.mockResolvedValue(undefined)
    const user = userEvent.setup()

    await user.click(within(getCard('custom')).getByRole('button', { name: '编辑' }))
    await user.type(screen.getByLabelText('名称'), '-x')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mock.saveAgentSubagent).toHaveBeenCalledWith(
        expect.objectContaining({ file: 'reviewer', name: 'reviewer-x' }),
      ),
    )
  })

  it('deletes a custom subagent from the editor after confirmation', async () => {
    await setup([{ ...CUSTOM, file: 'old', name: 'old', model: undefined }])
    mock.deleteAgentSubagent.mockResolvedValue(undefined)
    const user = userEvent.setup()

    // The row has no delete action; open the editor via the chevron.
    expect(
      within(getCard('custom')).queryByRole('button', { name: '删除' }),
    ).not.toBeInTheDocument()
    await user.click(within(getCard('custom')).getByRole('button', { name: '编辑' }))
    await user.click(await screen.findByRole('button', { name: '删除' }))
    // Confirm inside the dialog.
    await user.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => expect(mock.deleteAgentSubagent).toHaveBeenCalledWith('old'))
  })

  it('deletes a broken subagent from its row without opening the editor', async () => {
    await setup([{ ...CUSTOM, broken: true }])
    mock.deleteAgentSubagent.mockResolvedValue(undefined)
    const user = userEvent.setup()

    // The broken row shows the broken hint and a row delete button, no chevron.
    expect(
      within(getCard('custom')).getByText('文件无法解析，请删除或在磁盘上修复。'),
    ).toBeInTheDocument()
    expect(
      within(getCard('custom')).queryByRole('button', { name: '编辑' }),
    ).not.toBeInTheDocument()
    await user.click(within(getCard('custom')).getByRole('button', { name: 'reviewer' }))
    // Confirm inside the dialog.
    await user.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => expect(mock.deleteAgentSubagent).toHaveBeenCalledWith('reviewer'))
  })

  it('shows the capitalized model label or the default tag', async () => {
    await setup([{ ...BUILTIN, model: undefined }])

    const row = screen.getByText('Explore').closest('div[class*="items-center"]') as HTMLElement
    expect(within(row).getByText('默认')).toBeInTheDocument()
  })

  it('falls back to the file list with an error toast when resolve fails', async () => {
    mock.listAgentAvailableSubagents.mockRejectedValue(new Error('resolve failed'))
    mock.listAgentSubagents.mockResolvedValue([
      { file: 'reviewer', name: 'reviewer', description: 'Reviews code', body: 'p' },
    ])
    renderWithProviders(<AgentSubagentSettings />)

    await waitFor(() => expect(getCard('custom')).toBeInTheDocument())
    expect(within(getCard('custom')).getByText('reviewer')).toBeInTheDocument()
    expect(
      await screen.findByText('无法获取子智能体列表，已回退显示文件中的自定义子智能体'),
    ).toBeInTheDocument()
  })

  it('saves a new subagent through the Add button', async () => {
    mock.listAgentAvailableSubagents.mockResolvedValue([BUILTIN])
    mock.saveAgentSubagent.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(<AgentSubagentSettings />)

    await user.click(await screen.findByRole('button', { name: '添加' }))
    await user.type(screen.getByLabelText('名称'), 'my-agent')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mock.saveAgentSubagent).toHaveBeenCalledWith(
        expect.objectContaining({ file: 'my-agent', name: 'my-agent' }),
      ),
    )
  })

  it('strips newlines from the description', async () => {
    await setup([CUSTOM])
    const user = userEvent.setup()

    await user.click(within(getCard('custom')).getByRole('button', { name: '编辑' }))
    const description = screen.getByLabelText('描述')
    await user.type(description, '{Enter}')
    expect(description).toHaveValue('Reviews code')
  })

  it('opens the advanced section expanded with a set count for a configured agent', async () => {
    await setup([{ ...CUSTOM, permissionMode: 'acceptEdits', background: true }])
    const user = userEvent.setup()

    await user.click(within(getCard('custom')).getByRole('button', { name: '编辑' }))
    // Header shows the count of set advanced fields; the body is expanded.
    // CUSTOM already sets model, plus permissionMode and background here = 3.
    expect(screen.getByRole('button', { name: /高级选项\s*已设 3 项/ })).toBeInTheDocument()
    expect(screen.getByLabelText('权限模式')).toBeInTheDocument()
  })

  it('starts the advanced section collapsed for a plain agent', async () => {
    await setup([{ ...CUSTOM, model: undefined }])
    const user = userEvent.setup()

    await user.click(within(getCard('custom')).getByRole('button', { name: '编辑' }))
    expect(screen.getByRole('button', { name: /高级选项\s*已设 0 项/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('权限模式')).not.toBeInTheDocument()
  })

  it('keeps a hand-written unknown model id selectable in the model select', async () => {
    await setup([{ ...CUSTOM, model: 'claude-opus-5-5' }])
    const user = userEvent.setup()

    await user.click(within(getCard('custom')).getByRole('button', { name: '编辑' }))
    // The select shows the raw id as its value; saving it back preserves it.
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mock.saveAgentSubagent).toHaveBeenCalledWith(
        expect.objectContaining({ file: 'reviewer', model: 'claude-opus-5-5' }),
      ),
    )
  })

  it('omits the tools key in all-tools mode and writes checked names in custom mode', async () => {
    await setup([CUSTOM])
    mock.saveAgentSubagent.mockResolvedValue(undefined)
    const user = userEvent.setup()

    await user.click(within(getCard('custom')).getByRole('button', { name: '编辑' }))
    // CUSTOM sets model, so the advanced section starts expanded.

    // Switch to all tools: no tools field.
    const toolsTrigger = screen.getByLabelText('工具')
    await user.click(toolsTrigger)
    await user.click(await screen.findByRole('option', { name: '所有工具' }))
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(mock.saveAgentSubagent).toHaveBeenCalledWith(
        expect.objectContaining({ file: 'reviewer', tools: undefined }),
      ),
    )
  })
})
