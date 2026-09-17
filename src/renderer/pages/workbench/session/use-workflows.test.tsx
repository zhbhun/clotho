import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type ClaudeWorkflowRun, claude } from '../../../services/claude/claude'
import type { ClaudeMessage } from './services/message'
import { useWorkflows, workflowRefsFromMessages } from './use-workflows'

function workflowMessages(runId = 'wf-run-1'): ClaudeMessage[] {
  return [
    {
      id: 'workflow-use',
      role: 'assistant',
      content: '',
      blocks: [
        {
          type: 'tool_use',
          name: 'Workflow',
          toolUseId: 'workflow-tool-1',
          input: { script: 'export default async function workflow() {}' },
        },
      ],
    },
    {
      id: 'workflow-result',
      role: 'tool',
      content: '',
      blocks: [
        {
          type: 'tool_result',
          toolUseId: 'workflow-tool-1',
          toolUseResult: {
            status: 'async_launched',
            taskId: 'task-1',
            taskType: 'local_workflow',
            workflowName: 'math-pipeline',
            runId,
            summary: 'Generate two numbers and calculate them',
          },
        },
      ],
    },
  ]
}

function workflowRun(status: ClaudeWorkflowRun['status']): ClaudeWorkflowRun {
  return {
    runId: 'wf-run-1',
    taskId: 'task-1',
    workflowName: 'math-pipeline',
    summary: 'Generate two numbers and calculate them',
    status,
    phases: [{ index: 0, title: 'Generate', detail: 'Two agents in parallel' }],
    agents: [],
  }
}

function HookHarness({
  isActive = true,
  isMockProject = false,
  messages = workflowMessages(),
  sessionId = 'session-1',
}: {
  isActive?: boolean
  isMockProject?: boolean
  messages?: ClaudeMessage[]
  sessionId?: string
}) {
  const state = useWorkflows({
    isActive,
    isMockProject,
    messages,
    projectId: 'project-1',
    sessionId,
  })
  return (
    <div>
      <span>refs:{state.refs.map((ref) => ref.runId).join(',')}</span>
      <span>status:{state.runs['wf-run-1']?.status ?? 'missing'}</span>
    </div>
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useWorkflows', () => {
  it('discovers launch metadata from the text-only Workflow result returned by the SDK', () => {
    const messages = workflowMessages()
    const result = messages[1].blocks?.[0]
    if (result) {
      result.toolUseResult = undefined
      result.content = [
        'Workflow launched in background. Task ID: w48zokb6x',
        'Summary: Workflow demo: subagents generate random numbers and calculator agents perform all four operations',
        'Script file: /tmp/math-pipeline-demo-wf_aec0e7f4-feb.js',
        'Run ID: wf_aec0e7f4-feb',
      ].join('\n')
    }

    expect(workflowRefsFromMessages(messages)).toEqual([
      {
        runId: 'wf_aec0e7f4-feb',
        toolUseId: 'workflow-tool-1',
        taskId: 'w48zokb6x',
        workflowName: 'math-pipeline-demo',
        summary:
          'Workflow demo: subagents generate random numbers and calculator agents perform all four operations',
        script: 'export default async function workflow() {}',
      },
    ])
  })

  it('discovers a workflow launch and reads its durable run immediately', async () => {
    const getWorkflowRuns = vi
      .spyOn(claude, 'getWorkflowRuns')
      .mockResolvedValue([workflowRun('completed')])

    await act(async () => {
      render(<HookHarness />)
    })

    expect(screen.getByText('refs:wf-run-1')).toBeInTheDocument()
    expect(screen.getByText('status:completed')).toBeInTheDocument()
    expect(getWorkflowRuns).toHaveBeenCalledWith('session-1', 'project-1', ['wf-run-1'])
  })

  it('treats a successful launch as running before its journal is created', async () => {
    vi.spyOn(claude, 'getWorkflowRuns').mockResolvedValue([])

    await act(async () => {
      render(<HookHarness />)
    })

    expect(screen.getByText('status:running')).toBeInTheDocument()
  })

  it('reads durable workflow runs for the mock project through the service boundary', async () => {
    const getWorkflowRuns = vi
      .spyOn(claude, 'getWorkflowRuns')
      .mockResolvedValue([workflowRun('completed')])

    await act(async () => {
      render(<HookHarness isMockProject />)
    })

    expect(screen.getByText('status:completed')).toBeInTheDocument()
    expect(getWorkflowRuns).toHaveBeenCalledWith('session-1', 'project-1', ['wf-run-1'])
  })

  it('polls a running workflow every second and stops after a terminal response', async () => {
    vi.useFakeTimers()
    const getWorkflowRuns = vi
      .spyOn(claude, 'getWorkflowRuns')
      .mockResolvedValueOnce([workflowRun('running')])
      .mockResolvedValueOnce([workflowRun('completed')])

    await act(async () => {
      render(<HookHarness />)
    })
    expect(getWorkflowRuns).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(getWorkflowRuns).toHaveBeenCalledTimes(2)
    expect(screen.getByText('status:completed')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(getWorkflowRuns).toHaveBeenCalledTimes(2)
  })

  it('uses the matching task notification as a terminal workflow signal', async () => {
    vi.useFakeTimers()
    const getWorkflowRuns = vi
      .spyOn(claude, 'getWorkflowRuns')
      .mockResolvedValueOnce([{ ...workflowRun('running'), isPartial: true }])
      .mockResolvedValueOnce([{ ...workflowRun('running'), isPartial: true }])
      .mockResolvedValueOnce([workflowRun('completed')])
    const messages = workflowMessages()

    let view: ReturnType<typeof render>
    await act(async () => {
      view = render(<HookHarness messages={messages} />)
    })
    expect(screen.getByText('status:running')).toBeInTheDocument()

    await act(async () => {
      view.rerender(
        <HookHarness
          messages={[
            ...messages,
            {
              id: 'workflow-completed',
              role: 'assistant',
              content: 'Workflow completed',
              taskNotification: {
                toolUseId: 'workflow-tool-1',
                status: 'completed',
              },
            },
          ]}
        />,
      )
    })

    expect(screen.getByText('status:completed')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(getWorkflowRuns).toHaveBeenCalledTimes(3)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(getWorkflowRuns).toHaveBeenCalledTimes(3)
  })

  it('stops polling as soon as the session moves to the background', async () => {
    vi.useFakeTimers()
    const getWorkflowRuns = vi
      .spyOn(claude, 'getWorkflowRuns')
      .mockResolvedValue([workflowRun('running')])

    let view: ReturnType<typeof render>
    await act(async () => {
      view = render(<HookHarness />)
    })
    expect(getWorkflowRuns).toHaveBeenCalledOnce()

    await act(async () => {
      view.rerender(<HookHarness isActive={false} />)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(getWorkflowRuns).toHaveBeenCalledOnce()
  })

  it('ignores a workflow response from a session that is no longer current', async () => {
    let resolveOldRequest: ((runs: ClaudeWorkflowRun[]) => void) | undefined
    const getWorkflowRuns = vi
      .spyOn(claude, 'getWorkflowRuns')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOldRequest = resolve
          }),
      )
      .mockResolvedValueOnce([])

    const view = render(<HookHarness />)
    await act(async () => {
      view.rerender(<HookHarness sessionId="session-2" />)
    })
    await act(async () => {
      resolveOldRequest?.([workflowRun('completed')])
    })

    expect(getWorkflowRuns).toHaveBeenCalledWith('session-2', 'project-1', ['wf-run-1'])
    expect(screen.getByText('status:running')).toBeInTheDocument()
  })
})
