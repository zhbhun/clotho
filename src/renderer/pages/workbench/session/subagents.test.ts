import { describe, expect, it } from 'vitest'

import type { ClaudeSubagent } from '../../../services/claude/claude'
import type { ClaudeMessage } from './services/message'
import * as subagentApi from './subagents'

const index: ClaudeSubagent[] = [
  {
    id: 'agent-root',
    agentType: 'Explore',
    description: 'Inspect rendering',
    toolUseId: 'tool-root',
    spawnDepth: 1,
    createdAt: '2026-08-05T01:00:00.000Z',
  },
  {
    id: 'agent-nested',
    agentType: 'general-purpose',
    description: 'Inspect nested tasks',
    toolUseId: 'tool-nested',
    spawnDepth: 2,
    createdAt: '2026-08-05T03:00:00.000Z',
  },
  {
    id: 'agent-other',
    agentType: 'Plan',
    description: 'Review the plan',
    toolUseId: 'tool-other',
    spawnDepth: 1,
    createdAt: '2026-08-05T02:00:00.000Z',
  },
]

const messages: ClaudeMessage[] = [
  {
    id: 'root-use',
    role: 'assistant',
    content: '',
    timestamp: '2026-08-05T01:00:00.000Z',
    blocks: [
      {
        type: 'tool_use',
        name: 'Agent',
        toolUseId: 'tool-root',
        input: {
          subagent_type: 'Explore',
          description: 'Inspect rendering',
          prompt: 'Inspect the renderer implementation and report what you find.',
        },
      },
    ],
  },
  {
    id: 'root-result',
    role: 'tool',
    content: '',
    blocks: [
      {
        type: 'tool_result',
        toolUseId: 'tool-root',
        content: 'Done',
        toolUseResult: { status: 'completed', agentId: 'agent-root' },
      },
    ],
  },
  {
    id: 'nested-use',
    role: 'assistant',
    content: '',
    parentToolUseId: 'tool-root',
    timestamp: '2026-08-05T03:00:00.000Z',
    blocks: [
      {
        type: 'tool_use',
        name: 'Agent',
        toolUseId: 'tool-nested',
        input: {
          subagent_type: 'general-purpose',
          description: 'Inspect nested tasks',
        },
      },
    ],
  },
]

describe('session subagent data', () => {
  it('combines lightweight metadata with observed Agent tool states', () => {
    const buildSessionSubagents = (
      subagentApi as typeof subagentApi & {
        buildSessionSubagents?: (
          index: ClaudeSubagent[],
          messages: ClaudeMessage[],
        ) => subagentApi.SessionSubagent[]
      }
    ).buildSessionSubagents

    expect(buildSessionSubagents).toBeTypeOf('function')
    expect(buildSessionSubagents?.(index, messages)).toEqual([
      {
        ...index[0],
        status: 'completed',
        prompt: 'Inspect the renderer implementation and report what you find.',
      },
      { ...index[1], status: 'running', parentToolUseId: 'tool-root' },
      { ...index[2], status: 'unknown' },
    ])
  })

  it('excludes a failed Agent creation without an agent id but keeps execution failures', () => {
    const failedMessages: ClaudeMessage[] = [
      {
        id: 'failed-agent-uses',
        role: 'assistant',
        content: '',
        blocks: [
          {
            type: 'tool_use',
            name: 'Agent',
            toolUseId: 'tool-create-failure',
            input: { subagent_type: 'unknown-agent', description: 'Create unavailable agent' },
          },
          {
            type: 'tool_use',
            name: 'Agent',
            toolUseId: 'tool-execution-failure',
            input: { subagent_type: 'Explore', description: 'Run failing agent' },
          },
        ],
      },
      {
        id: 'failed-agent-results',
        role: 'tool',
        content: '',
        blocks: [
          {
            type: 'tool_result',
            toolUseId: 'tool-create-failure',
            content: 'Agent type is not registered',
            isError: true,
            toolUseResult: { status: 'failed' },
          },
          {
            type: 'tool_result',
            toolUseId: 'tool-execution-failure',
            content: 'Agent execution failed',
            isError: true,
            toolUseResult: { status: 'failed', agentId: 'agent-failed-execution' },
          },
        ],
      },
    ]

    expect(subagentApi.buildSessionSubagents([], failedMessages)).toEqual([
      expect.objectContaining({
        id: 'agent-failed-execution',
        status: 'failed',
        toolUseId: 'tool-execution-failure',
      }),
    ])
  })

  it('prepends the initiating Agent prompt when the loaded transcript omits it', () => {
    const prependSubagentPrompt = (
      subagentApi as typeof subagentApi & {
        prependSubagentPrompt?: (
          subagent: subagentApi.SessionSubagent & { prompt?: string },
          messages: ClaudeMessage[],
        ) => ClaudeMessage[]
      }
    ).prependSubagentPrompt
    const subagent = {
      ...index[0],
      status: 'completed' as const,
      prompt: 'Inspect the renderer implementation and report what you find.',
    }
    const assistantMessages: ClaudeMessage[] = [
      {
        id: 'subagent-reply',
        role: 'assistant',
        content: 'The renderer uses React.',
        blocks: [{ type: 'text', text: 'The renderer uses React.' }],
      },
    ]

    expect(prependSubagentPrompt).toBeTypeOf('function')
    expect(prependSubagentPrompt?.(subagent, assistantMessages)).toEqual([
      {
        id: 'subagent-prompt-tool-root',
        uuid: 'subagent-prompt-tool-root',
        role: 'user',
        content: 'Inspect the renderer implementation and report what you find.',
        blocks: [
          { type: 'text', text: 'Inspect the renderer implementation and report what you find.' },
        ],
        timestamp: '2026-08-05T01:00:00.000Z',
        parentToolUseId: 'tool-root',
      },
      assistantMessages[0],
    ])
  })

  it('does not duplicate the prompt when the transcript already contains a user message', () => {
    const prependSubagentPrompt = (
      subagentApi as typeof subagentApi & {
        prependSubagentPrompt?: (
          subagent: subagentApi.SessionSubagent & { prompt?: string },
          messages: ClaudeMessage[],
        ) => ClaudeMessage[]
      }
    ).prependSubagentPrompt
    const subagent = {
      ...index[0],
      status: 'completed' as const,
      prompt: 'Inspect the renderer implementation and report what you find.',
    }
    const transcript: ClaudeMessage[] = [
      {
        id: 'subagent-user',
        role: 'user',
        content: 'Inspect the renderer implementation and report what you find.',
        blocks: [
          { type: 'text', text: 'Inspect the renderer implementation and report what you find.' },
        ],
      },
      {
        id: 'subagent-reply',
        role: 'assistant',
        content: 'The renderer uses React.',
        blocks: [{ type: 'text', text: 'The renderer uses React.' }],
      },
    ]

    expect(prependSubagentPrompt).toBeTypeOf('function')
    const merged = prependSubagentPrompt?.(subagent, transcript)
    expect(merged).toEqual(transcript)
    expect(merged?.filter((message) => message.role === 'user')).toHaveLength(1)
  })

  it('sorts agents by creation time ascending and preserves source order for ties', () => {
    const sortSessionItems = (
      subagentApi as typeof subagentApi & {
        sortSessionItems?: <T extends { createdAt: string }>(items: T[]) => T[]
      }
    ).sortSessionItems
    const agents: subagentApi.SessionSubagent[] = [
      { ...index[0], status: 'completed' },
      { ...index[1], status: 'running', parentToolUseId: 'tool-root' },
      { ...index[2], status: 'unknown' },
      {
        ...index[0],
        id: 'agent-running-older',
        toolUseId: 'tool-running-older',
        status: 'running',
        createdAt: '2026-08-05T00:00:00.000Z',
      },
      {
        ...index[0],
        id: 'agent-same-time',
        toolUseId: 'tool-same-time',
        status: 'completed',
      },
    ]

    expect(sortSessionItems).toBeTypeOf('function')
    expect(sortSessionItems?.(agents)).toEqual([
      agents[3],
      agents[0],
      agents[4],
      agents[2],
      agents[1],
    ])
  })

  it('returns only direct running children for the current agent', () => {
    const directRunningSubagents = (
      subagentApi as typeof subagentApi & {
        directRunningSubagents?: (
          currentMessages: ClaudeMessage[],
          agents: subagentApi.SessionSubagent[],
        ) => subagentApi.SessionSubagent[]
      }
    ).directRunningSubagents
    const agents: subagentApi.SessionSubagent[] = [
      { ...index[0], status: 'completed' },
      { ...index[1], status: 'running', parentToolUseId: 'tool-root' },
    ]

    expect(directRunningSubagents).toBeTypeOf('function')
    expect(
      directRunningSubagents?.(
        messages.filter((message) => message.parentToolUseId === 'tool-root'),
        agents,
      ),
    ).toEqual([agents[1]])
  })

  it('deduplicates loaded history and live messages by message identity', () => {
    const mergeSubagentMessages = (
      subagentApi as typeof subagentApi & {
        mergeSubagentMessages?: (history: ClaudeMessage[], live: ClaudeMessage[]) => ClaudeMessage[]
      }
    ).mergeSubagentMessages
    const history: ClaudeMessage[] = [
      {
        id: 'history-1',
        uuid: 'message-1',
        role: 'assistant',
        content: 'Old partial reply',
        timestamp: '2026-08-05T01:00:00.000Z',
      },
    ]
    const live: ClaudeMessage[] = [
      {
        id: 'live-1',
        uuid: 'message-1',
        role: 'assistant',
        content: 'Complete reply',
        timestamp: '2026-08-05T01:00:00.000Z',
      },
      {
        id: 'live-2',
        uuid: 'message-2',
        role: 'assistant',
        content: 'Next reply',
        timestamp: '2026-08-05T02:00:00.000Z',
      },
    ]

    expect(mergeSubagentMessages).toBeTypeOf('function')
    expect(mergeSubagentMessages?.(history, live)).toEqual(live)
  })

  it.each([
    ['completed', 'completed'],
    ['failed', 'failed'],
    ['stopped', 'stopped'],
  ] as const)('transitions an async Agent to %s from its task notification', (status, expected) => {
    const lifecycleMessages: ClaudeMessage[] = [
      {
        id: 'call',
        role: 'assistant',
        content: '',
        blocks: [
          {
            type: 'tool_use',
            name: 'Agent',
            toolUseId: 'tool-root',
            input: { subagent_type: 'Explore', description: 'Inspect rendering' },
          },
        ],
      },
      {
        id: 'launch',
        role: 'tool',
        content: '',
        blocks: [
          {
            type: 'tool_result',
            toolUseId: 'tool-root',
            content: 'Async agent launched successfully',
            toolUseResult: { status: 'async_launched', agentId: 'agent-root' },
          },
        ],
      },
      {
        id: 'notification',
        role: 'assistant',
        content: 'Agent finished',
        taskNotification: { toolUseId: 'tool-root', status },
      } as ClaudeMessage,
    ]

    expect(subagentApi.buildSessionSubagents(index.slice(0, 1), lifecycleMessages)[0]?.status).toBe(
      expected,
    )
  })

  it('keeps an asynchronously launched Agent running before a completion notification', () => {
    const runningMessages: ClaudeMessage[] = [
      messages[0],
      {
        id: 'launch',
        role: 'tool',
        content: '',
        blocks: [
          {
            type: 'tool_result',
            toolUseId: 'tool-root',
            content: 'Async agent launched successfully',
            toolUseResult: { status: 'async_launched', agentId: 'agent-root' },
          },
        ],
      },
    ]

    expect(subagentApi.buildSessionSubagents(index.slice(0, 1), runningMessages)[0]?.status).toBe(
      'running',
    )
  })

  it('keeps a remotely launched Agent running before a completion notification', () => {
    const runningMessages: ClaudeMessage[] = [
      messages[0],
      {
        id: 'launch',
        role: 'tool',
        content: '',
        blocks: [
          {
            type: 'tool_result',
            toolUseId: 'tool-root',
            content: 'Remote agent launched successfully',
            toolUseResult: { status: 'remote_launched', taskId: 'remote-agent-root' },
          },
        ],
      },
    ]

    expect(subagentApi.buildSessionSubagents(index.slice(0, 1), runningMessages)[0]?.status).toBe(
      'running',
    )
  })
})
