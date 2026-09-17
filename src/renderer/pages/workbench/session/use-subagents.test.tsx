import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type ClaudeSubagent, claude } from '../../../services/claude/claude'
import type { ClaudeMessage } from './services/message'
import { type UseSubagentsResult, type WorkflowSubagentGroup, useSubagents } from './use-subagents'

const rootMessages: ClaudeMessage[] = [
  {
    id: 'agent-use',
    role: 'assistant',
    content: '',
    timestamp: '2026-08-05T01:00:00.000Z',
    blocks: [
      {
        type: 'tool_use',
        name: 'Agent',
        toolUseId: 'agent-tool-1',
        input: {
          subagent_type: 'general-purpose',
          description: 'Query system information',
          prompt: 'Query system information for this macOS machine.',
        },
      },
    ],
  },
]

function HookHarness({
  isMockProject = false,
  messages = rootMessages,
  sessionId = 'session-1',
  workflowGroups,
}: {
  isMockProject?: boolean
  messages?: ClaudeMessage[]
  sessionId?: string
  workflowGroups?: WorkflowSubagentGroup[]
}) {
  const state = useSubagents({
    isMockProject,
    messages,
    projectId: 'project-1',
    sessionId,
    workflowGroups,
  })
  return <HookView state={state} />
}

function HookView({ state }: { state: UseSubagentsResult }) {
  return (
    <div>
      {state.subagents.map((subagent) => (
        <button
          key={subagent.toolUseId}
          type="button"
          onClick={() => state.openSubagent(subagent.toolUseId)}
        >
          {subagent.description}
        </button>
      ))}
      {state.workflows.map((workflow) => (
        <span key={workflow.runId}>workflow:{workflow.name}</span>
      ))}
      <button
        type="button"
        onClick={() =>
          state.openWorkflowSubagent({
            agentId: 'workflow-agent-1',
            label: 'generator-a',
            prompt: 'Generate one number',
            startedAt: 1_786_000_000_000,
            state: 'done',
          })
        }
      >
        open workflow agent
      </button>
      {state.selectedSubagent ? (
        <div>
          <span>selected:{state.selectedSubagent.description}</span>
          {state.isLoading ? <span>loading</span> : null}
          {state.error ? <span>{state.error}</span> : null}
          {state.selectedMessages.map((message) => (
            <span key={message.id}>{message.content}</span>
          ))}
          <button type="button" onClick={state.closeSubagent}>
            close
          </button>
          <button type="button" onClick={state.retry}>
            retry
          </button>
        </div>
      ) : null}
    </div>
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useSubagents', () => {
  it('does not expose an Agent creation failure without an agent id', async () => {
    vi.spyOn(claude, 'listSubagents').mockResolvedValue([])
    const getSubagentMessages = vi.spyOn(claude, 'getSubagentMessages').mockResolvedValue([])
    const failedCreationMessages: ClaudeMessage[] = [
      {
        id: 'agent-create-failure-use',
        role: 'assistant',
        content: '',
        blocks: [
          {
            type: 'tool_use',
            name: 'Agent',
            toolUseId: 'agent-create-failure',
            input: { subagent_type: 'unknown-agent', description: 'Create unavailable agent' },
          },
        ],
      },
      {
        id: 'agent-create-failure-result',
        role: 'tool',
        content: '',
        blocks: [
          {
            type: 'tool_result',
            toolUseId: 'agent-create-failure',
            content: 'Agent type is not registered',
            isError: true,
            toolUseResult: { status: 'failed' },
          },
        ],
      },
    ]

    render(<HookHarness messages={failedCreationMessages} />)

    await waitFor(() => expect(claude.listSubagents).toHaveBeenCalledOnce())
    expect(
      screen.queryByRole('button', { name: 'Create unavailable agent' }),
    ).not.toBeInTheDocument()
    expect(getSubagentMessages).not.toHaveBeenCalled()
  })

  it('lists and opens every workflow agent from a partially failed durable run', async () => {
    vi.spyOn(claude, 'listSubagents').mockResolvedValue([])
    const getSubagentMessages = vi.spyOn(claude, 'getSubagentMessages').mockResolvedValue([])
    const workflowAgents = [
      ['generator-a', 'agent-a'],
      ['generator-b', 'agent-b'],
      ['compute-add', 'agent-add'],
      ['compute-subtract', 'agent-subtract'],
      ['compute-multiply', 'agent-multiply'],
      ['compute-divide', 'agent-divide'],
    ].map(([label, agentId]) => ({
      agentId,
      label,
      state: label === 'compute-divide' ? 'failed' : 'done',
    }))

    render(
      <HookHarness
        workflowGroups={[
          {
            runId: 'workflow-run-1',
            name: 'math-pipeline-demo',
            toolUseId: 'workflow-tool-1',
            startedAt: 1_786_000_000_000,
            agents: workflowAgents,
          },
        ]}
      />,
    )

    expect(await screen.findByText('workflow:math-pipeline-demo')).toBeInTheDocument()
    for (const agent of workflowAgents) {
      expect(await screen.findByRole('button', { name: agent.label })).toBeInTheDocument()
    }
    expect(screen.queryByText(/selected:/)).not.toBeInTheDocument()

    for (const agent of workflowAgents) {
      await userEvent.click(screen.getByRole('button', { name: agent.label }))
      expect(await screen.findByText(`selected:${agent.label}`)).toBeInTheDocument()
      expect(getSubagentMessages).toHaveBeenCalledWith('session-1', 'project-1', agent.agentId)
    }
    expect(getSubagentMessages).toHaveBeenCalledTimes(6)
  })

  it('loads an index first and fetches each transcript only once when opened', async () => {
    const listSubagents = vi.spyOn(claude, 'listSubagents').mockResolvedValue([
      {
        id: 'agent-1',
        agentType: 'general-purpose',
        description: 'Query system information',
        toolUseId: 'agent-tool-1',
        spawnDepth: 1,
        createdAt: '2026-08-05T01:00:00.000Z',
      },
    ])
    const getSubagentMessages = vi.spyOn(claude, 'getSubagentMessages').mockResolvedValue([
      {
        type: 'assistant',
        uuid: 'subagent-reply',
        timestamp: '2026-08-05T01:01:00.000Z',
        parent_tool_use_id: 'agent-tool-1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'System information query complete' }],
        },
      },
    ])

    render(<HookHarness />)

    expect(
      await screen.findByRole('button', { name: 'Query system information' }),
    ).toBeInTheDocument()
    expect(listSubagents).toHaveBeenCalledWith('session-1', 'project-1')
    expect(getSubagentMessages).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Query system information' }))

    expect(
      await screen.findByText('Query system information for this macOS machine.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('System information query complete')).toBeInTheDocument()
    expect(getSubagentMessages).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'close' }))
    await userEvent.click(screen.getByRole('button', { name: 'Query system information' }))

    expect(screen.getByText('System information query complete')).toBeInTheDocument()
    expect(getSubagentMessages).toHaveBeenCalledOnce()
  })

  it('loads the mock subagent index and transcript through the service boundary', async () => {
    vi.spyOn(claude, 'listSubagents').mockResolvedValue([
      {
        id: 'mock-agent-1',
        agentType: 'general-purpose',
        description: 'Query system information',
        toolUseId: 'agent-tool-1',
        spawnDepth: 1,
        createdAt: '2026-08-05T01:00:00.000Z',
      },
    ])
    const getSubagentMessages = vi.spyOn(claude, 'getSubagentMessages').mockResolvedValue([
      {
        type: 'assistant',
        uuid: 'mock-subagent-reply',
        timestamp: '2026-08-05T01:01:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Anonymized system information query complete' }],
        },
      },
    ])

    render(<HookHarness isMockProject />)
    await userEvent.click(await screen.findByRole('button', { name: 'Query system information' }))

    expect(
      await screen.findByText('Anonymized system information query complete'),
    ).toBeInTheDocument()
    expect(getSubagentMessages).toHaveBeenCalledWith('session-1', 'project-1', 'mock-agent-1')
  })

  it('exposes a failed transcript load and retries it', async () => {
    vi.spyOn(claude, 'listSubagents').mockResolvedValue([
      {
        id: 'agent-1',
        agentType: 'general-purpose',
        description: 'Query system information',
        toolUseId: 'agent-tool-1',
        spawnDepth: 1,
        createdAt: '2026-08-05T01:00:00.000Z',
      },
    ])
    const getSubagentMessages = vi
      .spyOn(claude, 'getSubagentMessages')
      .mockRejectedValueOnce(new Error('Log reading failed'))
      .mockResolvedValueOnce([])

    render(<HookHarness />)
    await userEvent.click(await screen.findByRole('button', { name: 'Query system information' }))

    expect(await screen.findByText('Log reading failed')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'retry' }))

    await waitFor(() => expect(screen.queryByText('Log reading failed')).not.toBeInTheDocument())
    expect(getSubagentMessages).toHaveBeenCalledTimes(2)
  })

  it('refreshes the lightweight index on demand before opening a newly observed agent', async () => {
    const metadata = {
      id: 'agent-1',
      agentType: 'general-purpose',
      description: 'Query system information',
      toolUseId: 'agent-tool-1',
      spawnDepth: 1,
      createdAt: '2026-08-05T01:00:00.000Z',
    }
    let resolveInitialIndex: ((subagents: ClaudeSubagent[]) => void) | undefined
    const listSubagents = vi
      .spyOn(claude, 'listSubagents')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitialIndex = resolve
          }),
      )
      .mockResolvedValueOnce([metadata])
    const getSubagentMessages = vi.spyOn(claude, 'getSubagentMessages').mockResolvedValue([])

    render(<HookHarness />)
    await userEvent.click(await screen.findByRole('button', { name: 'Query system information' }))

    await waitFor(() =>
      expect(getSubagentMessages).toHaveBeenCalledWith('session-1', 'project-1', 'agent-1'),
    )
    expect(listSubagents).toHaveBeenCalledTimes(2)

    resolveInitialIndex?.([])
    await waitFor(() =>
      expect(screen.getByText('selected:Query system information')).toBeInTheDocument(),
    )
  })

  it('does not cache a transcript response from an earlier session generation', async () => {
    const metadata = {
      id: 'agent-1',
      agentType: 'general-purpose',
      description: 'Query system information',
      toolUseId: 'agent-tool-1',
      spawnDepth: 1,
      createdAt: '2026-08-05T01:00:00.000Z',
    }
    vi.spyOn(claude, 'listSubagents').mockImplementation((sessionId) =>
      Promise.resolve(sessionId === 'session-1' ? [metadata] : []),
    )
    let resolveOldTranscript: ((messages: []) => void) | undefined
    const getSubagentMessages = vi
      .spyOn(claude, 'getSubagentMessages')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOldTranscript = resolve
          }),
      )
      .mockResolvedValueOnce([])

    const { rerender } = render(<HookHarness />)
    await userEvent.click(await screen.findByRole('button', { name: 'Query system information' }))
    await waitFor(() => expect(getSubagentMessages).toHaveBeenCalledOnce())

    rerender(<HookHarness sessionId="session-2" />)
    await waitFor(() => expect(screen.queryByText(/selected:/)).not.toBeInTheDocument())
    rerender(<HookHarness sessionId="session-1" />)
    await waitFor(() => expect(claude.listSubagents).toHaveBeenCalledWith('session-1', 'project-1'))

    resolveOldTranscript?.([])
    await userEvent.click(await screen.findByRole('button', { name: 'Query system information' }))

    await waitFor(() => expect(getSubagentMessages).toHaveBeenCalledTimes(2))
  })

  it('loads a workflow agent directly by agent id without waiting for the metadata index', async () => {
    const listSubagents = vi.spyOn(claude, 'listSubagents').mockResolvedValue([])
    const getSubagentMessages = vi.spyOn(claude, 'getSubagentMessages').mockResolvedValue([
      {
        type: 'assistant',
        uuid: 'workflow-agent-reply',
        timestamp: '2026-08-05T01:01:00.000Z',
        parent_tool_use_id: null,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Generated 42' }],
        },
      },
    ])

    render(<HookHarness />)
    await userEvent.click(screen.getByRole('button', { name: 'open workflow agent' }))

    expect(await screen.findByText('selected:generator-a')).toBeInTheDocument()
    expect(screen.getByText('Generate one number')).toBeInTheDocument()
    expect(await screen.findByText('Generated 42')).toBeInTheDocument()
    expect(getSubagentMessages).toHaveBeenCalledWith('session-1', 'project-1', 'workflow-agent-1')
    expect(listSubagents).toHaveBeenCalledOnce()
  })

  it('refreshes only the selected running workflow agent and stops after it closes', async () => {
    vi.useFakeTimers()
    vi.spyOn(claude, 'listSubagents').mockResolvedValue([])
    const getSubagentMessages = vi
      .spyOn(claude, 'getSubagentMessages')
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          type: 'assistant',
          uuid: 'workflow-agent-live-reply',
          timestamp: '2026-08-10T12:59:31.405Z',
          parent_tool_use_id: null,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Generated 68' }],
          },
        },
      ])
    const workflowGroups: WorkflowSubagentGroup[] = [
      {
        runId: 'workflow-run-live',
        name: 'math-pipeline-demo',
        toolUseId: 'workflow-tool-live',
        agents: [
          {
            agentId: 'workflow-agent-live',
            label: 'generator-live',
            prompt: 'Generate one number',
            state: 'running',
          },
        ],
      },
    ]

    const view = render(<HookHarness workflowGroups={workflowGroups} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(getSubagentMessages).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'generator-live' }))
      await Promise.resolve()
    })
    expect(getSubagentMessages).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    view.rerender(
      <HookHarness
        workflowGroups={workflowGroups.map((workflow) => ({
          ...workflow,
          agents: workflow.agents.map((agent) => ({ ...agent })),
        }))}
      />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(screen.getByText('Generated 68')).toBeInTheDocument()
    expect(getSubagentMessages).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(getSubagentMessages).toHaveBeenCalledTimes(2)
  })

  it('reads a selected workflow agent once more when it reaches a terminal state', async () => {
    vi.useFakeTimers()
    vi.spyOn(claude, 'listSubagents').mockResolvedValue([])
    const getSubagentMessages = vi
      .spyOn(claude, 'getSubagentMessages')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          type: 'assistant',
          uuid: 'workflow-agent-final-reply',
          timestamp: '2026-08-10T12:59:33.266Z',
          parent_tool_use_id: null,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Structured output provided' }],
          },
        },
      ])
    const workflowGroup = (state: string): WorkflowSubagentGroup[] => [
      {
        runId: 'workflow-run-live',
        name: 'math-pipeline-demo',
        toolUseId: 'workflow-tool-live',
        agents: [
          {
            agentId: 'workflow-agent-live',
            label: 'generator-live',
            prompt: 'Generate one number',
            state,
          },
        ],
      },
    ]

    const view = render(<HookHarness workflowGroups={workflowGroup('running')} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'generator-live' }))
      await Promise.resolve()
    })
    expect(getSubagentMessages).toHaveBeenCalledOnce()

    await act(async () => {
      view.rerender(<HookHarness workflowGroups={workflowGroup('done')} />)
      await Promise.resolve()
    })

    expect(screen.getByText('Structured output provided')).toBeInTheDocument()
    expect(getSubagentMessages).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(getSubagentMessages).toHaveBeenCalledTimes(2)
  })
})
