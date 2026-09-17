import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/shadcn/tooltip'

import { ToolItem as ToolCard } from './tool-item'

describe('ToolCard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('toggles an expandable tool from its focused title', async () => {
    const user = userEvent.setup()
    render(<ToolCard name="Bash" input={{ command: 'ls -la' }} result="result" />)

    const title = screen.getByRole('button', { name: 'Bash ls -la' })
    title.focus()
    await user.keyboard('{Enter}')

    expect(title).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('tool-item-body')).not.toBeInTheDocument()
  })

  it('toggles an AskUserQuestion result from its focused title', async () => {
    const user = userEvent.setup()
    render(
      <ToolCard
        name="AskUserQuestion"
        input={{
          questions: [
            {
              question: 'Choose a path',
              options: [{ label: 'Continue', description: 'Keep going' }],
            },
          ],
        }}
      />,
    )

    const title = screen.getByRole('button', {
      name: 'AskUserQuestion Choose a path',
    })
    title.focus()
    await user.keyboard('{Enter}')

    expect(title).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Continue')).not.toBeInTheDocument()
  })

  it('expands overflowing terminal output on request', async () => {
    vi.spyOn(HTMLPreElement.prototype, 'scrollHeight', 'get').mockReturnValue(320)
    render(
      <ToolCard
        name="Bash"
        input={{ command: 'ls -la' }}
        result={Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join('\n')}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))

    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })

  it('shows only the command while a background Bash launch is unconfirmed', () => {
    render(<ToolCard name="Bash" input={{ command: 'bun run build', run_in_background: true }} />)

    expect(screen.getByTestId('tool-item-body')).toHaveTextContent('$ bun run build')
    expect(screen.getByTestId('tool-item-body')).not.toHaveTextContent('后台运行中')
  })

  it('shows background completion output inside the original Bash card', () => {
    render(
      <ToolCard
        backgroundTask={{
          taskId: 'task-1',
          status: 'completed',
          output: 'build completed',
          exitCode: 0,
        }}
        name="Bash"
        input={{ command: 'bun run build', run_in_background: true }}
        result="Command running in background with ID: task-1."
      />,
    )

    expect(screen.getByTestId('tool-item-body')).toHaveTextContent('$ bun run build')
    expect(screen.getByTestId('tool-item-body')).toHaveTextContent('build completed')
    expect(screen.getByTestId('tool-item-body')).not.toHaveTextContent(
      'Command running in background',
    )
  })

  it('shows a stopped Monitor state after any partial output', () => {
    render(
      <ToolCard
        backgroundTask={{ taskId: 'task-2', status: 'stopped', output: 'last log line' }}
        name="Monitor"
        input={{ command: 'tail -f app.log', description: 'Watch logs' }}
      />,
    )

    expect(screen.getByTestId('tool-item-body')).toHaveTextContent('tail -f app.log')
    expect(screen.getByTestId('tool-item-body')).toHaveTextContent('last log line')
    expect(screen.getByTestId('tool-item-body')).toHaveTextContent('后台任务已停止')
  })

  it('does not offer broken subagent navigation after agent creation fails', async () => {
    const onOpenSubagent = vi.fn()
    render(
      <TooltipProvider>
        <ToolCard
          input={{
            description: 'Run a security audit',
            prompt: 'Check the current workspace security configuration',
            subagent_type: 'security-auditor',
          }}
          isError
          name="Agent"
          onOpenSubagent={onOpenSubagent}
          result="Agent type 'security-auditor' is not registered"
          toolUseId="agent-tool-create-failure"
        />
      </TooltipProvider>,
    )

    await userEvent.click(screen.getByLabelText('Agent security-auditor Run a security audit'))

    expect(onOpenSubagent).not.toHaveBeenCalled()
    expect(screen.queryByTestId('tool-item-body')).not.toBeInTheDocument()
  })

  it('keeps a failed agent execution navigable when its transcript exists', async () => {
    const onOpenSubagent = vi.fn()
    render(
      <ToolCard
        input={{ description: 'Read protected logs', subagent_type: 'general-purpose' }}
        isError
        name="Agent"
        onOpenSubagent={onOpenSubagent}
        result="Agent execution failed"
        toolUseId="agent-tool-execution-failure"
        toolUseResult={{ status: 'failed', agentId: 'agent-mock-protected-log' }}
      />,
    )

    await userEvent.click(screen.getByLabelText('Agent general-purpose Read protected logs'))

    expect(onOpenSubagent).toHaveBeenCalledWith('agent-tool-execution-failure')
  })

  it('keeps permission controls available when sending the response fails', async () => {
    const onRespond = vi.fn(async () => {
      throw new Error('RPC unavailable')
    })
    render(
      <ToolCard
        name="Write"
        pendingRequest={{ kind: 'permission', toolName: 'Write', toolUseId: 'permission-1' }}
        toolUseId="permission-1"
        onRespond={onRespond}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: '同意' }))

    expect(await screen.findByText('提交权限响应失败，请重试')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '同意' })).not.toBeDisabled()
  })
})
