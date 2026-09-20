// @vitest-environment node
import {
  forkSession,
  getSessionMessages,
  getSubagentMessages,
  listSubagents,
} from '@anthropic-ai/claude-agent-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as sessionApi from './session'
import { buildMainChain, finalizeChain, loadSessionMessages, parseSessionEntries } from './session'

const sdkMocks = vi.hoisted(() => ({
  forkSession: vi.fn(),
  getSessionMessages: vi.fn(),
  getSubagentMessages: vi.fn(),
  listSubagents: vi.fn(),
}))
const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}))
const workspaceMocks = vi.hoisted(() => ({
  claudeDir: vi.fn(),
  projectPathForId: vi.fn(),
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => sdkMocks)
vi.mock('node:fs', () => ({ promises: fsMocks }))
vi.mock('./workspace', () => workspaceMocks)

describe('Claude session reading', () => {
  beforeEach(() => {
    vi.mocked(forkSession).mockReset()
    vi.mocked(getSessionMessages).mockReset()
    vi.mocked(getSubagentMessages).mockReset()
    vi.mocked(listSubagents).mockReset()
    fsMocks.readFile.mockReset()
    fsMocks.stat.mockReset()
    workspaceMocks.claudeDir.mockReset()
    workspaceMocks.claudeDir.mockReturnValue('/Users/me/.claude')
    workspaceMocks.projectPathForId.mockReset()
    workspaceMocks.projectPathForId.mockResolvedValue('/Users/me/app')
  })

  it('loads session messages through getSessionMessages with the project path', async () => {
    vi.mocked(getSessionMessages).mockResolvedValue([
      {
        type: 'user',
        uuid: 'msg-1',
        session_id: 'session-1',
        timestamp: '2026-07-02T08:44:23.892Z',
        origin: { kind: 'task-notification' },
        message: { role: 'user', content: 'hello' },
        parent_tool_use_id: null,
        toolUseResult: { taskId: 'bs5d2gvlp' },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        session_id: 'session-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
        parent_tool_use_id: null,
      },
    ] as unknown as Awaited<ReturnType<typeof getSessionMessages>>)

    await expect(
      loadSessionMessages({
        sessionId: 'session-1',
        projectPath: '/Users/me/app',
      }),
    ).resolves.toEqual([
      {
        type: 'user',
        uuid: 'msg-1',
        session_id: 'session-1',
        timestamp: '2026-07-02T08:44:23.892Z',
        origin: { kind: 'task-notification' },
        message: { role: 'user', content: 'hello' },
        parent_tool_use_id: null,
        toolUseResult: { taskId: 'bs5d2gvlp' },
      },
      {
        type: 'assistant',
        uuid: 'msg-2',
        session_id: 'session-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
        parent_tool_use_id: null,
      },
    ])
    expect(getSessionMessages).toHaveBeenCalledWith('session-1', { dir: '/Users/me/app' })
  })

  it('restores message ancestry through transcript entries omitted by the SDK', async () => {
    vi.mocked(getSessionMessages).mockResolvedValue([
      {
        type: 'user',
        uuid: 'interrupt-uuid',
        session_id: 'session-1',
        message: { role: 'user', content: '[Request interrupted by user]' },
        parent_tool_use_id: null,
      },
      {
        type: 'assistant',
        uuid: 'cleanup-uuid',
        session_id: 'session-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'SDK cleanup' }] },
        parent_tool_use_id: null,
      },
    ] as unknown as Awaited<ReturnType<typeof getSessionMessages>>)
    fsMocks.readFile.mockResolvedValue(
      [
        JSON.stringify({ type: 'user', uuid: 'interrupt-uuid', parentUuid: null }),
        JSON.stringify({
          type: 'attachment',
          uuid: 'hidden-uuid',
          parentUuid: 'interrupt-uuid',
        }),
        JSON.stringify({
          type: 'assistant',
          uuid: 'cleanup-uuid',
          parentUuid: 'hidden-uuid',
        }),
      ].join('\n'),
    )

    await expect(
      loadSessionMessages({ sessionId: 'session-1', projectPath: '/Users/me/app' }),
    ).resolves.toMatchObject([
      { uuid: 'interrupt-uuid' },
      { uuid: 'cleanup-uuid', parentUuid: 'interrupt-uuid' },
    ])
  })

  it('restores persisted local command output after its user command', async () => {
    vi.mocked(getSessionMessages).mockResolvedValue([
      {
        type: 'user',
        uuid: 'command-user-uuid',
        session_id: 'session-1',
        timestamp: '2026-08-29T06:00:00.000Z',
        message: {
          role: 'user',
          content:
            '<command-message>usage</command-message><command-name>/usage</command-name><command-args></command-args>',
        },
        parent_tool_use_id: null,
      },
    ] as unknown as Awaited<ReturnType<typeof getSessionMessages>>)
    fsMocks.readFile.mockImplementation((filePath: string) => {
      if (filePath === '/Users/me/.claude/projects/-Users-me-app/session-1.jsonl') {
        return Promise.resolve(
          [
            JSON.stringify({
              type: 'user',
              uuid: 'command-user-uuid',
              message: { role: 'user', content: '<command-name>/usage</command-name>' },
            }),
            JSON.stringify({
              type: 'system',
              subtype: 'local_command',
              content: '<local-command-stdout>Current usage: 10%</local-command-stdout>',
              uuid: 'local-output-uuid',
              parentUuid: 'command-user-uuid',
              timestamp: '2026-08-29T06:00:00.250Z',
            }),
          ].join('\n'),
        )
      }
      return Promise.reject(new Error(`Unexpected file read: ${filePath}`))
    })

    await expect(
      loadSessionMessages({ sessionId: 'session-1', projectPath: '/Users/me/app' }),
    ).resolves.toMatchObject([
      { type: 'user', uuid: 'command-user-uuid' },
      {
        type: 'system',
        subtype: 'local_command',
        uuid: 'local-output-uuid',
        parentUuid: 'command-user-uuid',
      },
    ])
  })

  it('restores terminal background output when loading session history', async () => {
    fsMocks.readFile.mockResolvedValue('restored output\n')
    vi.mocked(getSessionMessages).mockResolvedValue([
      {
        type: 'system',
        subtype: 'task_notification',
        task_id: 'task-1',
        tool_use_id: 'bash-1',
        output_file: '/tmp/task-1.output',
        status: 'completed',
        summary: 'Background command completed (exit code 0)',
      },
    ] as unknown as Awaited<ReturnType<typeof getSessionMessages>>)

    await expect(
      loadSessionMessages({ sessionId: 'session-1', projectPath: '/Users/me/app' }),
    ).resolves.toMatchObject([
      {
        type: 'system',
        subtype: 'task_notification',
        result: 'restored output\n',
      },
    ])
    expect(fsMocks.readFile).toHaveBeenCalledWith('/tmp/task-1.output', 'utf8')
  })

  it('lists lightweight subagent metadata without loading subagent transcripts', async () => {
    vi.mocked(listSubagents).mockResolvedValue(['agent-b', 'agent-a'])
    workspaceMocks.projectPathForId.mockResolvedValue('/Users/me/app')
    fsMocks.readFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('agent-agent-a.meta.json')) {
        return Promise.resolve(
          JSON.stringify({
            agentType: 'Explore',
            description: 'Inspect session rendering',
            toolUseId: 'tool-a',
            spawnDepth: 1,
          }),
        )
      }
      return Promise.resolve(
        JSON.stringify({
          agentType: 'general-purpose',
          description: 'Check nested tasks',
          toolUseId: 'tool-b',
          spawnDepth: 2,
        }),
      )
    })
    fsMocks.stat.mockImplementation((filePath: string) =>
      Promise.resolve({
        birthtime: new Date(
          filePath.endsWith('agent-agent-a.meta.json')
            ? '2026-08-05T01:00:00.000Z'
            : '2026-08-05T02:00:00.000Z',
        ),
      }),
    )
    const listSessionSubagents = (
      sessionApi as typeof sessionApi & {
        listSessionSubagents?: (params: { sessionId: string; projectId: string }) => Promise<
          Array<{
            id: string
            agentType: string
            description: string
            toolUseId: string
            spawnDepth: number
            createdAt: string
          }>
        >
      }
    ).listSessionSubagents

    await expect(
      listSessionSubagents?.({ sessionId: 'session-1', projectId: 'project-1' }),
    ).resolves.toEqual([
      {
        id: 'agent-b',
        agentType: 'general-purpose',
        description: 'Check nested tasks',
        toolUseId: 'tool-b',
        spawnDepth: 2,
        createdAt: '2026-08-05T02:00:00.000Z',
      },
      {
        id: 'agent-a',
        agentType: 'Explore',
        description: 'Inspect session rendering',
        toolUseId: 'tool-a',
        spawnDepth: 1,
        createdAt: '2026-08-05T01:00:00.000Z',
      },
    ])
    expect(listSubagents).toHaveBeenCalledWith('session-1', { dir: '/Users/me/app' })
    expect(getSubagentMessages).not.toHaveBeenCalled()
  })

  it('keeps valid subagents when one metadata file is malformed', async () => {
    vi.mocked(listSubagents).mockResolvedValue(['valid-agent', 'broken-agent'])
    workspaceMocks.projectPathForId.mockResolvedValue('/Users/me/app')
    fsMocks.readFile.mockImplementation((filePath: string) =>
      Promise.resolve(
        filePath.endsWith('agent-valid-agent.meta.json')
          ? JSON.stringify({
              agentType: 'Explore',
              description: 'Inspect messages',
              toolUseId: 'tool-valid',
              spawnDepth: 1,
            })
          : '{malformed',
      ),
    )
    fsMocks.stat.mockResolvedValue({
      birthtime: new Date('2026-08-05T01:00:00.000Z'),
    })

    await expect(
      sessionApi.listSessionSubagents({ sessionId: 'session-1', projectId: 'project-1' }),
    ).resolves.toEqual([
      {
        id: 'valid-agent',
        agentType: 'Explore',
        description: 'Inspect messages',
        toolUseId: 'tool-valid',
        spawnDepth: 1,
        createdAt: '2026-08-05T01:00:00.000Z',
      },
    ])
  })

  it('loads one subagent transcript through the SDK on demand', async () => {
    vi.mocked(getSubagentMessages).mockResolvedValue([
      {
        type: 'assistant',
        uuid: 'sub-message-1',
        session_id: 'session-1',
        timestamp: '2026-08-05T02:00:01.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Subagent reply' }],
        },
        parent_tool_use_id: 'tool-b',
      },
    ] as unknown as Awaited<ReturnType<typeof getSubagentMessages>>)
    workspaceMocks.projectPathForId.mockResolvedValue('/Users/me/app')
    const loadSubagentMessages = (
      sessionApi as typeof sessionApi & {
        loadSubagentMessages?: (params: {
          sessionId: string
          projectId: string
          agentId: string
        }) => Promise<unknown[]>
      }
    ).loadSubagentMessages

    await expect(
      loadSubagentMessages?.({
        sessionId: 'session-1',
        projectId: 'project-1',
        agentId: 'agent-b',
      }),
    ).resolves.toEqual([
      {
        type: 'assistant',
        uuid: 'sub-message-1',
        session_id: 'session-1',
        timestamp: '2026-08-05T02:00:01.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Subagent reply' }],
        },
        parent_tool_use_id: 'tool-b',
      },
    ])
    expect(getSubagentMessages).toHaveBeenCalledWith('session-1', 'agent-b', {
      dir: '/Users/me/app',
    })
  })

  it('loads and normalizes durable workflow runs for the session', async () => {
    fsMocks.readFile.mockResolvedValue(
      JSON.stringify({
        runId: 'wf-run-1',
        taskId: 'task-1',
        workflowName: 'math-pipeline',
        summary: 'Generate two numbers and calculate them',
        status: 'completed',
        startTime: 1_786_000_000_000,
        durationMs: 17_500,
        agentCount: 2,
        totalTokens: 840,
        totalToolCalls: 3,
        script: 'export default async function workflow() {}',
        logs: ['generated values'],
        result: { answer: 42 },
        phases: [{ title: 'Generate', detail: 'Two agents in parallel' }],
        workflowProgress: [
          { type: 'workflow_phase', index: 1, title: 'Generate' },
          {
            type: 'workflow_agent',
            index: 0,
            label: 'generator-a',
            phaseIndex: 1,
            phaseTitle: 'Generate',
            agentId: 'agent-a',
            model: 'sonnet',
            state: 'done',
            durationMs: 920,
            tokens: 420,
            toolCalls: 1,
            promptPreview: 'Generate one number',
            resultPreview: '{"value": 42}',
          },
        ],
      }),
    )
    const loadWorkflowRuns = (
      sessionApi as typeof sessionApi & {
        loadWorkflowRuns?: (params: {
          sessionId: string
          projectId: string
          runIds: string[]
        }) => Promise<unknown[]>
      }
    ).loadWorkflowRuns

    await expect(
      loadWorkflowRuns?.({
        sessionId: 'session-1',
        projectId: 'project-1',
        runIds: ['wf-run-1'],
      }),
    ).resolves.toEqual([
      {
        runId: 'wf-run-1',
        taskId: 'task-1',
        workflowName: 'math-pipeline',
        summary: 'Generate two numbers and calculate them',
        status: 'completed',
        startTime: 1_786_000_000_000,
        durationMs: 17_500,
        agentCount: 2,
        totalTokens: 840,
        totalToolCalls: 3,
        script: 'export default async function workflow() {}',
        logs: ['generated values'],
        result: { answer: 42 },
        phases: [{ index: 1, title: 'Generate', detail: 'Two agents in parallel' }],
        agents: [
          {
            index: 0,
            label: 'generator-a',
            phaseIndex: 1,
            phaseTitle: 'Generate',
            agentId: 'agent-a',
            model: 'sonnet',
            state: 'done',
            durationMs: 920,
            tokens: 420,
            toolCalls: 1,
            promptPreview: 'Generate one number',
            resultPreview: '{"value": 42}',
          },
        ],
      },
    ])
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      '/Users/me/.claude/projects/-Users-me-app/session-1/workflows/wf-run-1.json',
      'utf8',
    )
  })

  it('keeps readable workflow runs when another run is missing or malformed', async () => {
    fsMocks.readFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('wf-valid.json')) {
        return Promise.resolve(
          JSON.stringify({
            runId: 'wf-valid',
            status: 'running',
            phases: [],
            workflowProgress: [],
          }),
        )
      }
      if (filePath.endsWith('wf-malformed.json')) return Promise.resolve('{malformed')
      return Promise.reject(new Error('ENOENT'))
    })

    await expect(
      (
        sessionApi as typeof sessionApi & {
          loadWorkflowRuns?: (params: {
            sessionId: string
            projectId: string
            runIds: string[]
          }) => Promise<unknown[]>
        }
      ).loadWorkflowRuns?.({
        sessionId: 'session-1',
        projectId: 'project-1',
        runIds: ['wf-valid', 'wf-missing', 'wf-malformed'],
      }),
    ).resolves.toEqual([
      {
        runId: 'wf-valid',
        status: 'running',
        phases: [],
        agents: [],
      },
    ])
  })

  it('builds a running workflow snapshot from its journal and agent transcripts', async () => {
    fsMocks.readFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('/workflows/wf-live.json')) {
        return Promise.reject(new Error('ENOENT'))
      }
      if (filePath.endsWith('/subagents/workflows/wf-live/journal.jsonl')) {
        return Promise.resolve(
          [
            JSON.stringify({ type: 'started', agentId: 'agent-a' }),
            JSON.stringify({ type: 'started', agentId: 'agent-b' }),
            JSON.stringify({ type: 'result', agentId: 'agent-a', result: { value: 73 } }),
            '{partial',
          ].join('\n'),
        )
      }
      if (filePath.endsWith('/subagents/workflows/wf-live/agent-agent-a.jsonl')) {
        return Promise.resolve(
          [
            JSON.stringify({
              type: 'user',
              timestamp: '2026-08-10T08:26:43.014Z',
              message: { role: 'user', content: 'Generate a random integer' },
            }),
            JSON.stringify({
              type: 'assistant',
              timestamp: '2026-08-10T08:27:00.000Z',
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'tool_use',
                    name: 'StructuredOutput',
                    input: { value: 73 },
                  },
                ],
              },
            }),
          ].join('\n'),
        )
      }
      if (filePath.endsWith('/subagents/workflows/wf-live/agent-agent-b.jsonl')) {
        return Promise.resolve(
          JSON.stringify({
            type: 'user',
            timestamp: '2026-08-10T08:26:43.015Z',
            message: { role: 'user', content: 'Generate an uncommon random integer' },
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected path: ${filePath}`))
    })

    await expect(
      sessionApi.loadWorkflowRuns({
        sessionId: 'session-copy',
        projectId: 'project-1',
        runIds: ['wf-live'],
      }),
    ).resolves.toEqual([
      {
        runId: 'wf-live',
        status: 'running',
        isPartial: true,
        startTime: Date.parse('2026-08-10T08:26:43.014Z'),
        agentCount: 2,
        phases: [],
        agents: [
          {
            index: 0,
            label: 'Subagent 1',
            phaseIndex: 0,
            agentId: 'agent-a',
            state: 'done',
            startedAt: Date.parse('2026-08-10T08:26:43.014Z'),
            lastProgressAt: Date.parse('2026-08-10T08:27:00.000Z'),
            lastToolName: 'StructuredOutput',
            promptPreview: 'Generate a random integer',
            resultPreview: '{"value":73}',
          },
          {
            index: 1,
            label: 'Subagent 2',
            phaseIndex: 0,
            agentId: 'agent-b',
            state: 'running',
            startedAt: Date.parse('2026-08-10T08:26:43.015Z'),
            lastProgressAt: Date.parse('2026-08-10T08:26:43.015Z'),
            promptPreview: 'Generate an uncommon random integer',
          },
        ],
      },
    ])
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      '/Users/me/.claude/projects/-Users-me-app/session-copy/subagents/workflows/wf-live/journal.jsonl',
      'utf8',
    )
  })

  it('normalizes a killed workflow record to stopped', async () => {
    fsMocks.readFile.mockResolvedValue(
      JSON.stringify({
        runId: 'wf-killed',
        status: 'killed',
        phases: [],
        workflowProgress: [],
      }),
    )

    await expect(
      sessionApi.loadWorkflowRuns({
        sessionId: 'session-1',
        projectId: 'project-1',
        runIds: ['wf-killed'],
      }),
    ).resolves.toEqual([
      {
        runId: 'wf-killed',
        status: 'stopped',
        phases: [],
        agents: [],
      },
    ])
  })

  it.each([
    ['project id', { sessionId: 'session-1', projectId: '../project', runIds: ['wf-1'] }],
    ['session id', { sessionId: '../session', projectId: 'project-1', runIds: ['wf-1'] }],
    ['run id', { sessionId: 'session-1', projectId: 'project-1', runIds: ['../wf-1'] }],
  ])('rejects an unsafe %s before reading workflow files', async (_label, params) => {
    const loadWorkflowRuns = (
      sessionApi as typeof sessionApi & {
        loadWorkflowRuns?: (params: {
          sessionId: string
          projectId: string
          runIds: string[]
        }) => Promise<unknown[]>
      }
    ).loadWorkflowRuns

    await expect(loadWorkflowRuns?.(params)).rejects.toThrow('Invalid')
    expect(fsMocks.readFile).not.toHaveBeenCalled()
  })

  it.each([
    ['project id', { sessionId: 'session-1', projectId: '../project' }],
    ['session id', { sessionId: '../session', projectId: 'project-1' }],
  ])('rejects an unsafe %s before listing subagents', async (_label, params) => {
    await expect(sessionApi.listSessionSubagents(params)).rejects.toThrow('Invalid')
    expect(workspaceMocks.projectPathForId).not.toHaveBeenCalled()
    expect(listSubagents).not.toHaveBeenCalled()
    expect(fsMocks.readFile).not.toHaveBeenCalled()
  })

  it.each([
    ['project id', { sessionId: 'session-1', projectId: '../project', agentId: 'agent-1' }],
    ['session id', { sessionId: '../session', projectId: 'project-1', agentId: 'agent-1' }],
    ['subagent id', { sessionId: 'session-1', projectId: 'project-1', agentId: '../agent' }],
  ])('rejects an unsafe %s before loading a subagent transcript', async (_label, params) => {
    await expect(sessionApi.loadSubagentMessages(params)).rejects.toThrow('Invalid')
    expect(workspaceMocks.projectPathForId).not.toHaveBeenCalled()
    expect(getSubagentMessages).not.toHaveBeenCalled()
  })

  it('skips unsafe subagent ids before reading metadata files', async () => {
    vi.mocked(listSubagents).mockResolvedValue(['../outside'])
    workspaceMocks.projectPathForId.mockResolvedValue('/Users/me/app')

    await expect(
      sessionApi.listSessionSubagents({ sessionId: 'session-1', projectId: 'project-1' }),
    ).resolves.toEqual([])
    expect(fsMocks.readFile).not.toHaveBeenCalled()
    expect(fsMocks.stat).not.toHaveBeenCalled()
  })

  it('starts fresh history when the first visible user message has no assistant ancestor', () => {
    const resolveMessageEditAnchor = (
      sessionApi as typeof sessionApi & {
        resolveMessageEditAnchor?: (
          entries: Array<{ type: string; uuid: string; parentUuid?: string | null }>,
          messageId: string,
        ) => { strategy: 'fresh' } | { strategy: 'resume'; resumeSessionAt: string }
      }
    ).resolveMessageEditAnchor

    expect(
      resolveMessageEditAnchor?.(
        [
          {
            type: 'attachment',
            uuid: 'session-start-attachment',
            parentUuid: null,
          },
          {
            type: 'user',
            uuid: 'first-user-message',
            parentUuid: 'session-start-attachment',
          },
        ],
        'first-user-message',
      ),
    ).toEqual({ strategy: 'fresh' })
  })

  it('finds the preceding assistant through hidden transcript entries', () => {
    expect(
      sessionApi.resolveMessageEditAnchor(
        [
          {
            type: 'assistant',
            uuid: 'previous-assistant-message',
            parentUuid: 'earlier-user-message',
          },
          {
            type: 'attachment',
            uuid: 'hidden-attachment',
            parentUuid: 'previous-assistant-message',
          },
          {
            type: 'user',
            uuid: 'ordinary-user-message',
            parentUuid: 'hidden-attachment',
          },
        ],
        'ordinary-user-message',
      ),
    ).toEqual({
      strategy: 'resume',
      resumeSessionAt: 'previous-assistant-message',
    })
  })

  it('starts fresh history when the first user message has no parent entry', () => {
    expect(
      sessionApi.resolveMessageEditAnchor(
        [{ type: 'user', uuid: 'first-user-message' }],
        'first-user-message',
      ),
    ).toEqual({ strategy: 'fresh' })
  })

  it('rejects editing when the target user message cannot be found', () => {
    expect(() => sessionApi.resolveMessageEditAnchor([], 'missing-user-message')).toThrow(
      'Cannot find user message',
    )
  })

  it('resolves an edit anchor from the raw transcript including hidden entries', async () => {
    fsMocks.readFile.mockResolvedValue(
      [
        JSON.stringify({
          type: 'attachment',
          uuid: 'session-start-attachment',
          parentUuid: null,
        }),
        JSON.stringify({
          type: 'user',
          uuid: 'first-user-message',
          parentUuid: 'session-start-attachment',
          message: { role: 'user', content: 'hello' },
        }),
      ].join('\n'),
    )
    const resolveSessionEditAnchor = (
      sessionApi as typeof sessionApi & {
        resolveSessionEditAnchor?: (params: {
          sessionId: string
          projectId: string
          messageId: string
        }) => Promise<{ strategy: 'fresh' } | { strategy: 'resume'; resumeSessionAt: string }>
      }
    ).resolveSessionEditAnchor

    await expect(
      resolveSessionEditAnchor?.({
        sessionId: 'source-session',
        projectId: 'project-1',
        messageId: 'first-user-message',
      }),
    ).resolves.toEqual({ strategy: 'fresh' })
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      '/Users/me/.claude/projects/-Users-me-app/source-session.jsonl',
      'utf8',
    )
  })

  it('forks the source session at the selected assistant message', async () => {
    vi.mocked(forkSession).mockResolvedValue({ sessionId: 'forked-session' })
    workspaceMocks.projectPathForId.mockResolvedValue('/Users/me/app')
    const forkSessionAtMessage = (
      sessionApi as typeof sessionApi & {
        forkSessionAtMessage?: (params: {
          sessionId: string
          projectId: string
          messageId: string
        }) => Promise<{ sessionId: string }>
      }
    ).forkSessionAtMessage

    await expect(
      forkSessionAtMessage?.({
        sessionId: 'source-session',
        projectId: 'project-1',
        messageId: 'assistant-message-uuid',
      }),
    ).resolves.toEqual({ sessionId: 'forked-session' })
    expect(workspaceMocks.projectPathForId).toHaveBeenCalledWith('project-1')
    expect(forkSession).toHaveBeenCalledWith('source-session', {
      dir: '/Users/me/app',
      upToMessageId: 'assistant-message-uuid',
    })
  })

  it('does not call the SDK when the project id cannot be resolved', async () => {
    workspaceMocks.projectPathForId.mockRejectedValue(new Error('Unknown project'))
    const forkSessionAtMessage = (
      sessionApi as typeof sessionApi & {
        forkSessionAtMessage?: (params: {
          sessionId: string
          projectId: string
          messageId: string
        }) => Promise<{ sessionId: string }>
      }
    ).forkSessionAtMessage

    await expect(
      forkSessionAtMessage?.({
        sessionId: 'source-session',
        projectId: 'missing-project',
        messageId: 'assistant-message-uuid',
      }),
    ).rejects.toThrow('Unknown project')
    expect(forkSession).not.toHaveBeenCalled()
  })
})

type ChainEntry = Parameters<typeof buildMainChain>[0][number]

function chainEntry(
  uuid: string,
  parentUuid: string | null,
  type: string = 'assistant',
  extra: Record<string, unknown> = {},
): ChainEntry {
  return { type, uuid, parentUuid, ...extra } as ChainEntry
}

describe('session chain building', () => {
  it('parses JSONL entries and drops blank, malformed, or uuid-less lines', () => {
    const buffer = [
      JSON.stringify({ type: 'user', uuid: 'a', parentUuid: null }),
      'not json',
      '',
      '   ',
      JSON.stringify({ type: 'user', parentUuid: null }),
      JSON.stringify({ type: 'assistant', uuid: 'b', parentUuid: 'a' }),
    ].join('\n')

    expect(parseSessionEntries(buffer).map((entry) => entry.uuid)).toEqual(['a', 'b'])
  })

  it('returns every index when no entry references a parent', () => {
    const entries = [
      chainEntry('a', null, 'user'),
      chainEntry('b', null, 'assistant'),
      chainEntry('c', null, 'user'),
    ]

    expect(buildMainChain(entries)).toEqual([0, 1, 2])
    expect(buildMainChain([])).toEqual([])
  })

  it('walks from the newest conversational leaf up to the root', () => {
    const entries = [
      chainEntry('a', null, 'user'),
      chainEntry('b', 'a', 'assistant'),
      chainEntry('c', 'b', 'user'),
      chainEntry('d', 'c', 'assistant'),
    ]

    expect(buildMainChain(entries)).toEqual([0, 1, 2, 3])
  })

  it('follows the latest branch when the transcript forks', () => {
    const entries = [
      chainEntry('a', null, 'user'),
      chainEntry('b', 'a', 'assistant'),
      chainEntry('c', 'b', 'user'),
      chainEntry('d', 'a', 'assistant'),
      chainEntry('e', 'd', 'user'),
    ]

    expect(buildMainChain(entries)).toEqual([0, 3, 4])
  })

  it('falls back to the newest leaf when no leaf is conversational', () => {
    const entries = [
      chainEntry('a', null, 'user'),
      chainEntry('b', 'a', 'summary'),
      chainEntry('c', 'a', 'summary'),
    ]

    expect(buildMainChain(entries)).toEqual([0, 2])
  })

  it('stops at a missing parent instead of failing', () => {
    const entries = [chainEntry('a', 'ghost', 'user')]

    expect(buildMainChain(entries)).toEqual([0])
  })

  it('terminates when parent references form a cycle', () => {
    const entries = [
      chainEntry('x', 'a', 'user'),
      chainEntry('a', 'b', 'assistant'),
      chainEntry('b', 'a', 'assistant'),
    ]

    // A cycle has no root, so only termination and full coverage matter.
    expect(buildMainChain(entries).sort((a, b) => a - b)).toEqual([0, 1, 2])
  })

  it('finalizes the chain without meta, sidechain, system, or team entries', () => {
    const entries = [
      chainEntry('a', null, 'user'),
      chainEntry('meta', null, 'user', { isMeta: true }),
      chainEntry('side', null, 'assistant', { isSidechain: true }),
      chainEntry('sys', null, 'system'),
      chainEntry('team', null, 'assistant', { teamName: 'crew' }),
      chainEntry('b', 'a', 'assistant'),
    ]

    const chain = buildMainChain(entries)
    expect(finalizeChain(entries, chain).map((entry) => entry.uuid)).toEqual(['a', 'b'])
  })
})

describe('API retry transcript replay', () => {
  it('merges persisted api_error retry entries at their transcript position', async () => {
    vi.mocked(getSessionMessages).mockResolvedValue([
      {
        type: 'user',
        uuid: 'user-1',
        session_id: 'session-1',
        message: { role: 'user', content: 'hello' },
        parent_tool_use_id: null,
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        session_id: 'session-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'API Error: 429' }] },
        parent_tool_use_id: null,
      },
    ] as unknown as Awaited<ReturnType<typeof getSessionMessages>>)
    fsMocks.readFile.mockResolvedValue(
      [
        JSON.stringify({ type: 'user', uuid: 'user-1', parentUuid: null }),
        JSON.stringify({
          type: 'system',
          subtype: 'api_error',
          source: 'request_retry',
          uuid: 'retry-1',
          parentUuid: 'user-1',
          retryAttempt: 1,
          retryInMs: 1000,
          maxRetries: 10,
          error: { status: 429, formatted: '429 quota' },
        }),
        JSON.stringify({
          type: 'system',
          subtype: 'api_error',
          source: 'request_retry',
          uuid: 'retry-2',
          parentUuid: 'retry-1',
          retryAttempt: 2,
          retryInMs: 2000,
          maxRetries: 10,
          error: { status: 429, formatted: '429 quota' },
        }),
        JSON.stringify({
          type: 'system',
          subtype: 'api_error',
          source: 'request_retry',
          uuid: 'retry-sidechain',
          parentUuid: 'user-1',
          isSidechain: true,
          retryAttempt: 1,
          retryInMs: 1000,
        }),
        JSON.stringify({ type: 'assistant', uuid: 'assistant-1', parentUuid: 'retry-2' }),
      ].join('\n'),
    )

    const messages = await loadSessionMessages({
      sessionId: 'session-1',
      projectPath: '/Users/me/app',
    })

    // Sidechain retries stay out; the main-chain retry pair lands between the
    // user prompt and the assistant error frame.
    expect(messages.map((message) => message.uuid)).toEqual([
      'user-1',
      'retry-1',
      'retry-2',
      'assistant-1',
    ])
    expect(messages[1]).toMatchObject({ subtype: 'api_error', retryAttempt: 1 })
  })
})
