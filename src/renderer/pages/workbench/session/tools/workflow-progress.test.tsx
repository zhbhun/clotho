import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { WorkflowProgress } from './workflow-progress'

const workflows = [
  {
    runId: 'wf-live',
    name: 'math-pipeline-demo',
    summary: 'Subagents generate random numbers and calculator agents perform all four operations',
    status: 'running' as const,
    toolUseId: 'workflow-tool-1',
    agents: [
      {
        agentId: 'agent-a',
        label: 'Subagent 1',
        prompt: 'Generate a random integer',
        state: 'done',
      },
      {
        agentId: 'agent-b',
        label: 'Subagent 2',
        prompt: 'Generate an uncommon random integer',
        state: 'running',
      },
    ],
  },
]

describe('WorkflowProgress', () => {
  it('shows active workflows grouped by summary with live agent states', async () => {
    render(<WorkflowProgress workflows={workflows} />)

    await userEvent.click(screen.getByText('Workflow'))

    expect(
      screen.getByText(
        'Subagents generate random numbers and calculator agents perform all four operations',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('math-pipeline-demo')).not.toBeInTheDocument()
    expect(screen.queryByText('agent-a')).not.toBeInTheDocument()
    expect(screen.queryByText('agent-b')).not.toBeInTheDocument()
    const completedAgent = screen.getByTestId('workflow-progress-agent-agent-a')
    const runningAgent = screen.getByTestId('workflow-progress-agent-agent-b')
    expect(within(completedAgent).getByText('Subagent 1')).toBeInTheDocument()
    expect(completedAgent).toHaveAttribute('data-workflow-agent-state', 'done')
    expect(within(runningAgent).getByText('Subagent 2')).toBeInTheDocument()
    expect(runningAgent).toHaveAttribute('data-workflow-agent-state', 'running')
  })

  it('opens a workflow subagent from its progress row', async () => {
    const onOpenAgent = vi.fn()
    render(<WorkflowProgress workflows={workflows} onOpenAgent={onOpenAgent} />)

    await userEvent.click(screen.getByText('Workflow'))
    await userEvent.click(screen.getByText('Subagent 2'))

    expect(onOpenAgent).toHaveBeenCalledWith(workflows[0].agents[1])
  })

  it('hides when every workflow is terminal', () => {
    render(
      <WorkflowProgress
        workflows={workflows.map((workflow) => ({ ...workflow, status: 'completed' as const }))}
      />,
    )

    expect(screen.queryByText('Workflow')).not.toBeInTheDocument()
  })
})
