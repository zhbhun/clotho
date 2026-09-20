import { describe, expect, it } from 'vitest'

import { claudeJsonToMessage } from '../services/message'
import { computeLastSentTurnId, computeTurns } from './turns'
import type { ConversationTurn } from './types'

describe('conversation state', () => {
  it('restores a persisted synthetic assistant error as a turn failure, not a reply', () => {
    const messages = [
      claudeJsonToMessage({
        type: 'user',
        timestamp: '2026-08-28T07:51:04.516Z',
        uuid: 'user-uuid',
        message: { role: 'user', content: [{ type: 'text', text: 'Try the missing model' }] },
      }),
      claudeJsonToMessage({
        type: 'assistant',
        error: 'model_not_found',
        timestamp: '2026-08-28T07:51:04.725Z',
        uuid: 'assistant-uuid',
        parentUuid: 'user-uuid',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'API Error: model does not exist' }],
        },
      }),
    ].filter((message): message is NonNullable<typeof message> => Boolean(message))

    const [turn] = computeTurns(messages)

    expect(turn).toMatchObject({
      endTimestamp: '2026-08-28T07:51:04.725Z',
      failure: { message: 'API Error: model does not exist' },
    })
    expect(turn?.timelineItems).toEqual([])
    expect(turn?.textBlocks).toEqual([])
  })

  it('finds the latest turn sent during this application launch', () => {
    const turn = (id: string): ConversationTurn => ({
      userMessage: { id, role: 'user', content: '' },
      assistantMessages: [],
      workBlocks: [],
      textBlocks: [],
      timelineItems: [],
    })
    expect(
      computeLastSentTurnId([turn('a'), turn('b'), turn('c')], new Set(['a', 'c', 'gone'])),
    ).toBe('c')
  })

  it('folds a rejected tool-use interruption into the original turn', () => {
    const messages = [
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2026-08-10T03:26:05.600Z',
        message: { role: 'user', content: 'Count slowly' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'read-1',
              name: 'Read',
              input: { file_path: '/outside/project/prompt.ts' },
            },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'tool-result-1',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'read-1',
              content: 'The user does not want to proceed with this tool use.',
              is_error: true,
            },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'interrupt-1',
        timestamp: '2026-08-10T03:26:05.655Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }],
        },
      },
    ]
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is NonNullable<typeof message> => Boolean(message))

    const turns = computeTurns(messages)

    expect(turns).toHaveLength(1)
    expect(turns).toMatchObject([
      {
        userMessage: { content: 'Count slowly' },
        isInterrupted: true,
        endTimestamp: '2026-08-10T03:26:05.655Z',
      },
    ])
  })

  it('clears the stopped marker when content continues after the interruption', () => {
    const messages = [
      {
        type: 'user',
        uuid: 'user-1',
        message: { role: 'user', content: 'Write a poem' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: 'user-1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Roses are red' }],
        },
      },
      {
        type: 'user',
        uuid: 'interrupt-1',
        parentUuid: 'assistant-1',
        message: { role: 'user', content: '[Request interrupted by user]' },
      },
      // The auto-continuation nudge persists as an isMeta frame: hidden from
      // the timeline, but still a causal boundary for its continuation.
      {
        type: 'user',
        uuid: 'nudge-1',
        parentUuid: 'interrupt-1',
        isMeta: true,
        message: {
          role: 'user',
          content:
            '[MESSAGE FROM NON-USER SOURCE - NOT USER INPUT]\n请从刚才中断的地方继续写完，不要重复已写过的内容。',
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-2',
        parentUuid: 'nudge-1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: ', violets are blue' }],
        },
      },
    ]
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is NonNullable<typeof message> => Boolean(message))

    const turns = computeTurns(messages)

    expect(turns).toHaveLength(1)
    expect(turns[0]!.isInterrupted).toBe(false)
    expect(turns[0]!.textBlocks.map((block) => block.text)).toEqual([
      'Roses are red',
      ', violets are blue',
    ])
  })

  it('ignores late SDK output caused by a cancelled turn', () => {
    const messages = [
      {
        type: 'user',
        uuid: 'user-1',
        message: { role: 'user', content: 'Count slowly' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-before-stop',
        parentUuid: 'user-1',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Planning before stop' },
            { type: 'text', text: 'Partial before stop' },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'interrupt-1',
        parentUuid: 'assistant-before-stop',
        message: { role: 'user', content: '[Request interrupted by user]' },
      },
      // Live updates may place the next optimistic user message before the cancelled
      // request's final SDK bookkeeping frame arrives.
      {
        type: 'user',
        uuid: 'user-2',
        parentUuid: 'late-cancelled-assistant',
        message: { role: 'user', content: 'Continue' },
      },
      {
        type: 'assistant',
        uuid: 'late-cancelled-assistant',
        parentUuid: 'interrupt-1',
        message: { role: 'assistant', content: 'SDK cleanup output' },
      },
      {
        type: 'user',
        uuid: 'late-cancelled-tool-result',
        parentUuid: 'late-cancelled-assistant',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'cleanup-tool', content: 'Cleanup result' },
            { type: 'text', text: 'SDK cleanup note' },
          ],
        },
      },
      {
        type: 'assistant',
        uuid: 'assistant-2',
        parentUuid: 'user-2',
        message: { role: 'assistant', content: 'Current reply' },
      },
    ]
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is NonNullable<typeof message> => Boolean(message))

    const turns = computeTurns(messages)

    expect(turns).toHaveLength(2)
    expect(turns[0]).toMatchObject({
      userMessage: { content: 'Count slowly' },
      isInterrupted: true,
      workBlocks: [{ type: 'thinking', text: 'Planning before stop' }],
      textBlocks: [{ type: 'text', text: 'Partial before stop' }],
    })
    expect(turns[1]).toMatchObject({
      userMessage: { content: 'Continue' },
      textBlocks: [{ type: 'text', text: 'Current reply' }],
    })
    expect(turns.flatMap((turn) => turn.textBlocks.map((block) => block.text))).not.toContain(
      'SDK cleanup output',
    )
    expect(turns.flatMap((turn) => turn.timelineItems)).not.toContainEqual(
      expect.objectContaining({ kind: 'text', text: 'SDK cleanup note' }),
    )
  })

  it('builds task lifecycle state from structured tool results', () => {
    const messages = [
      { type: 'user', message: { role: 'user', content: 'go' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'create',
              name: 'TaskCreate',
              input: { description: 'Inspect files', activeForm: 'Inspecting files' },
            },
          ],
        },
      },
      {
        type: 'user',
        toolUseResult: { task: { id: '1', subject: 'Inspect files' } },
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'create', content: 'Task created' }],
        },
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'update', name: 'TaskUpdate', input: { taskId: '1' } }],
        },
      },
      {
        type: 'user',
        toolUseResult: {
          taskId: '1',
          updatedFields: ['status'],
          statusChange: { from: 'pending', to: 'completed' },
        },
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'update', content: 'Task updated' }],
        },
      },
    ]
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is NonNullable<typeof message> => Boolean(message))

    expect(computeTurns(messages)[0]?.timelineItems).toMatchObject([
      {
        kind: 'task',
        tasks: [
          {
            id: '1',
            subject: 'Inspect files',
            description: 'Inspect files',
            activeForm: 'Inspecting files',
            status: 'completed',
          },
        ],
      },
    ])
  })

  it('coalesces adjacent reads but keeps edits visible in the timeline', () => {
    const turns = computeTurns([
      { id: 'user', role: 'user', content: 'Update files' },
      {
        id: 'assistant',
        role: 'assistant',
        content: '',
        blocks: [
          { type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } },
          { type: 'tool_result', content: 'A' },
          { type: 'tool_use', name: 'Read', input: { file_path: 'b.ts' } },
          { type: 'tool_result', content: 'B' },
          { type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } },
          { type: 'tool_result', content: 'Edited' },
        ],
      },
    ])

    expect(turns[0]?.timelineItems).toMatchObject([
      { kind: 'tool', coalescedReads: [{ file_path: 'a.ts' }, { file_path: 'b.ts' }] },
      { kind: 'tool', use: { name: 'Edit' }, result: { content: 'Edited' } },
    ])
  })

  it('attaches subagent activity to the Task that started it', () => {
    const turns = computeTurns([
      { id: 'user', role: 'user', content: 'Inspect' },
      {
        id: 'task',
        role: 'assistant',
        content: '',
        blocks: [{ type: 'tool_use', name: 'Task', toolUseId: 'task-1', input: {} }],
      },
      {
        id: 'subagent',
        role: 'assistant',
        parentToolUseId: 'task-1',
        content: 'Found it',
        blocks: [{ type: 'text', text: 'Found it' }],
      },
    ])

    expect(turns[0]?.timelineItems).toMatchObject([
      { kind: 'tool', use: { name: 'Task' }, children: [{ kind: 'text', text: 'Found it' }] },
    ])
  })

  it('replaces an async Agent launch response with its completed agent result', () => {
    const messages = [
      { type: 'user', message: { role: 'user', content: 'Run an agent' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'agent-1', name: 'Agent', input: { description: 'Inspect' } },
          ],
        },
      },
      {
        type: 'user',
        tool_use_result: { status: 'async_launched', agentId: 'internal-id' },
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'agent-1', content: 'Async agent launched' },
          ],
        },
      },
      {
        type: 'assistant',
        parent_tool_use_id: 'agent-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Safe final response' }] },
      },
      {
        type: 'system',
        subtype: 'task_notification',
        tool_use_id: 'agent-1',
        status: 'completed',
        summary: 'Agent finished',
      },
    ]
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is NonNullable<typeof message> => Boolean(message))

    expect(computeTurns(messages)[0]?.timelineItems).toMatchObject([
      {
        kind: 'tool',
        use: { name: 'Agent' },
        result: { content: 'Safe final response', toolUseResult: { status: 'completed' } },
      },
    ])
  })

  it('updates the original background Bash item from a terminal task notification', () => {
    const messages = [
      { type: 'user', message: { role: 'user', content: 'Build it' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'bash-1',
              name: 'Bash',
              input: { command: 'bun run build', run_in_background: true },
            },
          ],
        },
      },
      {
        type: 'user',
        toolUseResult: { backgroundTaskId: 'task-1' },
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'bash-1',
              content: 'Command running in background with ID: task-1.',
            },
          ],
        },
      },
      {
        type: 'system',
        subtype: 'task_notification',
        task_id: 'task-1',
        tool_use_id: 'bash-1',
        status: 'completed',
        summary: 'Background command completed (exit code 0)',
        result: 'build completed\n',
      },
    ]
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is NonNullable<typeof message> => Boolean(message))

    expect(computeTurns(messages)[0]?.timelineItems).toMatchObject([
      {
        kind: 'tool',
        use: { name: 'Bash' },
        backgroundTask: {
          taskId: 'task-1',
          status: 'completed',
          output: 'build completed\n',
          exitCode: 0,
        },
      },
    ])
  })

  it('updates a background command in an earlier turn from a later TaskOutput result', () => {
    const messages = [
      { type: 'user', message: { role: 'user', content: 'Start it' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'powershell-1',
              name: 'PowerShell',
              input: { script: 'Invoke-Build', run_in_background: true },
            },
          ],
        },
      },
      {
        type: 'user',
        toolUseResult: { backgroundTaskId: 'task-2' },
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'powershell-1',
              content: 'Command running in background with ID: task-2.',
            },
          ],
        },
      },
      { type: 'assistant', message: { role: 'assistant', content: 'Started.' } },
      { type: 'user', message: { role: 'user', content: 'Check it' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'output-1',
              name: 'TaskOutput',
              input: { task_id: 'task-2' },
            },
          ],
        },
      },
      {
        type: 'user',
        toolUseResult: {
          retrieval_status: 'success',
          task: {
            task_id: 'task-2',
            status: 'completed',
            output: 'PowerShell complete',
            exitCode: 0,
          },
        },
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'output-1', content: 'PowerShell complete' },
          ],
        },
      },
    ]
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is NonNullable<typeof message> => Boolean(message))

    expect(computeTurns(messages)[0]?.timelineItems).toMatchObject([
      {
        kind: 'tool',
        use: { name: 'PowerShell' },
        backgroundTask: {
          taskId: 'task-2',
          status: 'completed',
          output: 'PowerShell complete',
          exitCode: 0,
        },
      },
      { kind: 'text', text: 'Started.' },
    ])
  })

  it.each([
    ['Bash', 0],
    ['PowerShell', 0],
    ['Monitor', undefined],
  ] as const)(
    'normalizes a missing successful exit code for %s without changing non-command tasks',
    (toolName, expectedExitCode) => {
      const messages = [
        { type: 'user', message: { role: 'user', content: 'Start it' } },
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'background-1',
                name: toolName,
                input:
                  toolName === 'PowerShell'
                    ? { script: 'Invoke-Build', run_in_background: true }
                    : { command: 'mkdir build', run_in_background: true },
              },
            ],
          },
        },
        {
          type: 'user',
          toolUseResult: { backgroundTaskId: 'task-1' },
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'background-1',
                content: 'Command running in background with ID: task-1.',
              },
            ],
          },
        },
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'output-1',
                name: 'TaskOutput',
                input: { task_id: 'task-1' },
              },
            ],
          },
        },
        {
          type: 'user',
          toolUseResult: {
            task: { task_id: 'task-1', status: 'completed' },
          },
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'output-1', content: '' }],
          },
        },
      ]
        .map((entry, index) => claudeJsonToMessage(entry, index))
        .filter((message): message is NonNullable<typeof message> => Boolean(message))

      expect(computeTurns(messages)[0]?.timelineItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'tool',
            use: expect.objectContaining({ name: toolName }),
            backgroundTask: {
              taskId: 'task-1',
              status: 'completed',
              exitCode: expectedExitCode,
            },
          }),
        ]),
      )
    },
  )

  it('marks the original Monitor item stopped when TaskStop succeeds', () => {
    const messages = [
      { type: 'user', message: { role: 'user', content: 'Watch it' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'monitor-1',
              name: 'Monitor',
              input: { command: 'tail -f app.log', description: 'Watch logs' },
            },
          ],
        },
      },
      {
        type: 'user',
        toolUseResult: { taskId: 'task-3', persistent: true },
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'monitor-1', content: 'Monitor started' }],
        },
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'stop-1',
              name: 'TaskStop',
              input: { task_id: 'task-3' },
            },
          ],
        },
      },
      {
        type: 'user',
        toolUseResult: { task_id: 'task-3', message: 'Stopped task' },
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'stop-1', content: 'Stopped task' }],
        },
      },
    ]
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is NonNullable<typeof message> => Boolean(message))

    expect(computeTurns(messages)[0]?.timelineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'tool',
          use: expect.objectContaining({ name: 'Monitor' }),
          backgroundTask: { taskId: 'task-3', status: 'stopped' },
        }),
      ]),
    )
  })
})

describe('API retry folding', () => {
  function retryMessage(attempt: number, timestamp: string) {
    return claudeJsonToMessage({
      type: 'system',
      subtype: 'api_retry',
      uuid: `retry-${attempt}`,
      attempt,
      max_retries: 10,
      retry_delay_ms: attempt * 1000,
      error_status: 429,
      error: 'rate_limit',
      timestamp,
    })
  }

  it('folds consecutive retry notices into one timeline item with the latest attempt', () => {
    const messages = [
      claudeJsonToMessage({
        type: 'user',
        uuid: 'user-1',
        timestamp: '2026-09-20T09:03:27.443Z',
        message: { role: 'user', content: 'hello' },
      }),
      retryMessage(1, '2026-09-20T09:03:27.904Z'),
      retryMessage(2, '2026-09-20T09:03:28.770Z'),
      retryMessage(3, '2026-09-20T09:03:30.132Z'),
    ].filter((message): message is NonNullable<typeof message> => Boolean(message))

    const [turn] = computeTurns(messages)

    expect(turn?.timelineItems).toEqual([
      {
        id: expect.stringContaining('api-retry'),
        kind: 'api-retry',
        attempt: 3,
        maxRetries: 10,
        retryDelayMs: 3000,
        status: 429,
        errorKind: 'rate_limit',
        detail: undefined,
        timestamp: '2026-09-20T09:03:30.132Z',
      },
    ])
  })

  it('starts a new card when retry notices are separated by other content', () => {
    const messages = [
      claudeJsonToMessage({
        type: 'user',
        uuid: 'user-1',
        message: { role: 'user', content: 'hello' },
      }),
      retryMessage(1, '2026-09-20T09:03:27.904Z'),
      claudeJsonToMessage({
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: 'user-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'partial' }] },
      }),
      retryMessage(1, '2026-09-20T09:04:00.000Z'),
    ].filter((message): message is NonNullable<typeof message> => Boolean(message))

    const [turn] = computeTurns(messages)

    expect(turn?.timelineItems.map((item) => item.kind)).toEqual(['api-retry', 'text', 'api-retry'])
  })

  it('drops retry notices that arrive before any user message', () => {
    expect(computeTurns([retryMessage(1, '2026-09-20T09:03:27.904Z')!])).toEqual([])
  })
})
