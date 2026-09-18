import { describe, expect, it } from 'vitest'

import { createAppI18n } from '../../../../i18n/runtime'
import type { ClaudeMessage } from '../services/message'
import {
  buildConversationRows,
  buildSubagentConversationRows,
  formatConversationDuration,
} from './conversation-rows'
import type { ConversationTimelineItem, ConversationTurn } from './types'

function userMessage(id: string, content = id): ClaudeMessage {
  return { id, role: 'user', content }
}

function turn(id: string, timelineItems: ConversationTimelineItem[]): ConversationTurn {
  return {
    userMessage: userMessage(id),
    assistantMessages: [],
    endTimestamp: undefined,
    startTimestamp: undefined,
    textBlocks: [],
    timelineItems,
    workBlocks: [],
  }
}

describe('buildConversationRows', () => {
  it('formats elapsed time in the active language', async () => {
    const instance = await createAppI18n('en', [])
    expect(formatConversationDuration(65, instance.t)).toBe('1m 5s')

    await instance.changeLanguage('zh-CN')
    expect(formatConversationDuration(65, instance.t)).toBe('1 分 5 秒')
  })

  it('resolves work-run summary labels with natural plurals', async () => {
    const instance = await createAppI18n('en', [])
    expect(instance.t('workbench.workRun.ranCommands', { count: 1 })).toBe('ran 1 command')
    expect(instance.t('workbench.workRun.ranCommands', { count: 2 })).toBe('ran 2 commands')
    expect(instance.t('workbench.workRun.readFiles', { count: 1 })).toBe('read 1 file')

    await instance.changeLanguage('zh-CN')
    expect(instance.t('workbench.workRun.ranCommands', { count: 3 })).toBe('运行了 3 个命令')

    // Russian needs one/few/many forms; unmatched counts fall back to the base label.
    await instance.changeLanguage('ru')
    expect(instance.t('workbench.workRun.ranCommands', { count: 2 })).toBe('выполнил команд: 2')
  })

  it('flattens main-conversation turns into stable item-level rows', () => {
    const rows = buildConversationRows({
      expandedTurns: { 'user-1': true },
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: null,
      streamingElapsed: 0,
      turns: [
        turn('user-1', [
          { id: 'thinking-1', kind: 'thinking', text: 'Reasoning' },
          { id: 'text-1', kind: 'text', text: 'Answer' },
          { id: 'tool-1', kind: 'tool' },
        ]),
        turn('user-2', [{ id: 'text-2', kind: 'text', text: 'Second answer' }]),
      ],
    })

    expect(rows.map(({ key, kind, turnId }) => ({ key, kind, turnId }))).toEqual([
      { key: 'turn:user-1:user', kind: 'user', turnId: 'user-1' },
      { key: 'turn:user-1:status', kind: 'status', turnId: 'user-1' },
      {
        key: 'turn:user-1:timeline:thinking-1',
        kind: 'timeline',
        turnId: 'user-1',
      },
      { key: 'turn:user-1:timeline:text-1', kind: 'timeline', turnId: 'user-1' },
      { key: 'turn:user-1:timeline:tool-1', kind: 'timeline', turnId: 'user-1' },
      { key: 'turn:user-2:user', kind: 'user', turnId: 'user-2' },
      { key: 'turn:user-2:status', kind: 'status', turnId: 'user-2' },
      { key: 'turn:user-2:text:text-2', kind: 'text', turnId: 'user-2' },
    ])
  })

  it('uses a non-expandable elapsed status for a completed text-only reply', () => {
    const completedTurn = turn('user-1', [{ id: 'text-1', kind: 'text', text: 'Done' }])
    completedTurn.userMessage.timestamp = '2026-08-27T10:00:00.000Z'
    completedTurn.endTimestamp = '2026-08-27T10:00:12.000Z'

    const rows = buildConversationRows({
      expandedTurns: {},
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: null,
      streamingElapsed: 0,
      turns: [completedTurn],
    })

    expect(rows[1]).toMatchObject({
      canToggle: false,
      duration: '12s',
      kind: 'status',
      status: 'completed',
    })
  })

  it('omits duration when transcript timestamps cannot be parsed', () => {
    const completedTurn = turn('user-1', [{ id: 'text-1', kind: 'text', text: 'Done' }])
    completedTurn.userMessage.timestamp = 'not-a-valid-date'
    completedTurn.endTimestamp = '2026-08-27T10:00:12.000Z'

    const rows = buildConversationRows({
      expandedTurns: {},
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: null,
      streamingElapsed: 0,
      turns: [completedTurn],
    })

    expect(rows[1]).toMatchObject({
      duration: undefined,
      kind: 'status',
      status: 'completed',
    })
  })

  it('uses an in-progress status after the first Agent event', () => {
    const rows = buildConversationRows({
      expandedTurns: {},
      interruptedTurnIds: new Set(),
      isStreaming: true,
      lastSentTurnId: 'user-1',
      streamingElapsed: 12,
      turns: [turn('user-1', [{ id: 'text-1', kind: 'text', text: 'Partial' }])],
    })

    expect(rows[1]).toMatchObject({
      canToggle: false,
      duration: undefined,
      kind: 'status',
      status: 'processing',
    })
  })

  it('does not show a transient Thinking row when a stop is already visible', () => {
    const rows = buildConversationRows({
      expandedTurns: {},
      interruptedTurnIds: new Set(['user-1']),
      isStreaming: true,
      lastSentTurnId: 'user-1',
      streamingElapsed: 0,
      turns: [turn('user-1', [])],
    })

    expect(rows.map((row) => row.kind)).toEqual(['user', 'status'])
    expect(rows[1]).toMatchObject({ status: 'interrupted' })
  })

  it('keeps a failure summary and detail on the persisted turn', () => {
    const rows = buildConversationRows({
      expandedTurns: {},
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: 'user-1',
      streamingElapsed: 0,
      turnFailures: { 'user-1': { elapsed: 12, message: 'model offline' } },
      turns: [turn('user-1', [])],
    })

    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({
      canToggle: false,
      duration: '12s',
      error: 'model offline',
      kind: 'status',
      status: 'failed',
    })
  })

  it('restores a persisted Claude failure using the transcript timestamps', () => {
    const failedTurn = turn('user-1', [])
    failedTurn.userMessage.timestamp = '2026-08-28T10:00:00.000Z'
    failedTurn.endTimestamp = '2026-08-28T10:00:12.000Z'
    failedTurn.failure = { message: 'API Error: model does not exist' }

    const rows = buildConversationRows({
      expandedTurns: {},
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: null,
      streamingElapsed: 0,
      turns: [failedTurn],
    })

    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({
      canToggle: false,
      duration: '12s',
      error: 'API Error: model does not exist',
      kind: 'status',
      status: 'failed',
    })
  })

  it('preserves prior tool work below an expandable failure status', () => {
    const rows = buildConversationRows({
      expandedTurns: { 'user-1': true },
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: 'user-1',
      streamingElapsed: 0,
      turnFailures: { 'user-1': { elapsed: 12, message: 'model offline' } },
      turns: [turn('user-1', [{ id: 'tool-1', kind: 'tool' }])],
    })

    expect(rows[1]).toMatchObject({ canToggle: true, kind: 'status', status: 'failed' })
    expect(rows[2]).toMatchObject({
      isStreaming: false,
      kind: 'timeline',
      turnTerminalStatus: 'failed',
    })
  })

  it('attaches an interrupted terminal status to retained tool rows', () => {
    const rows = buildConversationRows({
      expandedTurns: { 'user-1': true },
      interruptedTurnIds: new Set(['user-1']),
      isStreaming: false,
      lastSentTurnId: 'user-1',
      streamingElapsed: 0,
      turns: [turn('user-1', [{ id: 'tool-1', kind: 'tool' }])],
    })

    expect(rows[2]).toMatchObject({
      kind: 'timeline',
      turnTerminalStatus: 'interrupted',
    })
  })

  it('uses the captured elapsed time for a user stop', () => {
    const rows = buildConversationRows({
      expandedTurns: {},
      interruptedTurnDurations: { 'user-1': 12 },
      interruptedTurnIds: new Set(['user-1']),
      isStreaming: false,
      lastSentTurnId: 'user-1',
      streamingElapsed: 0,
      turns: [turn('user-1', [])],
    })

    expect(rows[1]).toMatchObject({
      duration: '12s',
      kind: 'status',
      status: 'interrupted',
    })
  })

  it('omits an AskUserQuestion row until its pending request is answered', () => {
    const askItem: ConversationTimelineItem = {
      id: 'ask-item',
      kind: 'tool',
      use: {
        type: 'tool_use',
        name: 'AskUserQuestion',
        toolUseId: 'ask-1',
        input: { questions: [{ question: 'Choose one?' }] },
      },
    }
    const options = {
      expandedTurns: { 'user-1': true },
      interruptedTurnIds: new Set<string>(),
      isStreaming: false,
      lastSentTurnId: null,
      streamingElapsed: 0,
      turns: [turn('user-1', [askItem])],
    }

    const pendingRows = buildConversationRows({
      ...options,
      pendingRequests: {
        'ask-1': {
          kind: 'ask',
          toolUseId: 'ask-1',
          toolName: 'AskUserQuestion',
          input: askItem.use?.input,
        },
      },
    })
    const answeredRows = buildConversationRows(options)

    expect(pendingRows.map((row) => row.key)).toEqual(['turn:user-1:user'])
    expect(answeredRows.map((row) => row.key)).toEqual([
      'turn:user-1:user',
      'turn:user-1:status',
      'turn:user-1:timeline:ask-item',
    ])
  })

  it('omits work before the final text while a structured turn is collapsed', () => {
    const rows = buildConversationRows({
      expandedTurns: {},
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: null,
      streamingElapsed: 0,
      turns: [
        turn('user-1', [
          { id: 'thinking-1', kind: 'thinking', text: 'Reasoning' },
          { id: 'text-1', kind: 'text', text: 'Answer' },
          { id: 'tool-1', kind: 'tool' },
        ]),
      ],
    })

    expect(rows.map((row) => row.key)).toEqual([
      'turn:user-1:user',
      'turn:user-1:status',
      'turn:user-1:timeline:text-1',
      'turn:user-1:timeline:tool-1',
    ])
  })

  it('does not append Thinking while the latest tool itself is still running', () => {
    const rows = buildConversationRows({
      expandedTurns: { 'user-1': true },
      interruptedTurnIds: new Set(),
      isStreaming: true,
      lastSentTurnId: null,
      streamingElapsed: 2,
      turns: [
        turn('user-1', [
          {
            id: 'tool-1',
            kind: 'tool',
            use: {
              type: 'tool_use',
              name: 'Bash',
              toolUseId: 'tool-use-1',
              input: { command: 'bun test' },
            },
          },
        ]),
      ],
    })

    expect(rows.map((row) => row.kind)).toEqual(['user', 'status', 'timeline'])
  })

  it('keeps compact spacing before Thinking that follows a completed tool', () => {
    const rows = buildConversationRows({
      expandedTurns: { 'user-1': true },
      interruptedTurnIds: new Set(),
      isStreaming: true,
      lastSentTurnId: null,
      streamingElapsed: 2,
      turns: [
        turn('user-1', [
          {
            id: 'tool-1',
            kind: 'tool',
            use: {
              type: 'tool_use',
              name: 'Bash',
              toolUseId: 'tool-use-1',
              input: { command: 'bun test' },
            },
            result: { type: 'tool_result', content: 'Passed' },
          },
        ]),
      ],
    })
    const toolRow = rows.find(
      (row): row is Extract<(typeof rows)[number], { kind: 'timeline' }> => row.kind === 'timeline',
    )

    expect(rows.map((row) => row.kind)).toEqual(['user', 'status', 'timeline', 'thinking'])
    expect(toolRow).toMatchObject({ compactAfter: true, isLast: false })
  })

  it('marks a collapsed status as terminal when no child row is visible', () => {
    const rows = buildConversationRows({
      expandedTurns: {},
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: null,
      streamingElapsed: 0,
      turns: [turn('user-1', [{ id: 'thinking-1', kind: 'thinking', text: 'Reasoning' }])],
    })

    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ isLast: true, kind: 'status' })
  })

  it('folds consecutive work items into one expandable run row', () => {
    const rows = buildConversationRows({
      expandedTurns: { 'user-1': true },
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: null,
      streamingElapsed: 0,
      turns: [
        turn('user-1', [
          { id: 'thinking-1', kind: 'thinking', text: 'Reasoning' },
          { id: 'tool-1', kind: 'tool' },
          { id: 'tool-2', kind: 'tool' },
          { id: 'text-1', kind: 'text', text: 'Answer' },
        ]),
      ],
    })

    expect(rows.map((row) => row.kind)).toEqual(['user', 'status', 'work-run', 'timeline'])
    expect(rows[2]).toMatchObject({
      isActive: false,
      isExpanded: false,
      isLast: false,
      items: [
        expect.objectContaining({ id: 'thinking-1' }),
        expect.objectContaining({ id: 'tool-1' }),
        expect.objectContaining({ id: 'tool-2' }),
      ],
      key: 'turn:user-1:run:thinking-1',
      kind: 'work-run',
      runId: 'turn:user-1:run:thinking-1',
    })
  })

  it('expands a run row through expandedRuns', () => {
    const runId = 'turn:user-1:run:thinking-1'
    const rows = buildConversationRows({
      expandedRuns: { [runId]: true },
      expandedTurns: { 'user-1': true },
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: null,
      streamingElapsed: 0,
      turns: [
        turn('user-1', [
          { id: 'thinking-1', kind: 'thinking', text: 'Reasoning' },
          { id: 'tool-1', kind: 'tool' },
          { id: 'text-1', kind: 'text', text: 'Answer' },
        ]),
      ],
    })

    expect(rows[2]).toMatchObject({ isExpanded: true, kind: 'work-run' })
  })

  it('marks the trailing run active while its turn streams', () => {
    const rows = buildConversationRows({
      expandedTurns: { 'user-1': true },
      interruptedTurnIds: new Set(),
      isStreaming: true,
      lastSentTurnId: 'user-1',
      streamingElapsed: 4,
      turns: [
        turn('user-1', [
          { id: 'tool-1', kind: 'tool' },
          { id: 'tool-2', kind: 'tool' },
        ]),
      ],
    })

    expect(rows.map((row) => row.kind)).toEqual(['user', 'status', 'work-run'])
    expect(rows[2]).toMatchObject({ isActive: true, isExpanded: false, isLast: true })
  })

  it('keeps a tool with a pending request out of the surrounding run', () => {
    const rows = buildConversationRows({
      expandedTurns: { 'user-1': true },
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: null,
      pendingRequests: {
        'tool-2-use': {
          kind: 'permission',
          toolUseId: 'tool-2-use',
          toolName: 'Bash',
          input: {},
        },
      },
      streamingElapsed: 0,
      turns: [
        turn('user-1', [
          { id: 'thinking-1', kind: 'thinking', text: 'Reasoning' },
          { id: 'tool-1', kind: 'tool' },
          {
            id: 'tool-2',
            kind: 'tool',
            use: { type: 'tool_use', name: 'Bash', toolUseId: 'tool-2-use', input: {} },
          },
        ]),
      ],
    })

    expect(rows.map((row) => row.kind)).toEqual(['user', 'status', 'work-run', 'timeline'])
    expect(rows[2]).toMatchObject({
      items: [
        expect.objectContaining({ id: 'thinking-1' }),
        expect.objectContaining({ id: 'tool-1' }),
      ],
    })
    expect(rows[3]).toMatchObject({ item: expect.objectContaining({ id: 'tool-2' }) })
  })

  it('shows the trailing run after the final text for a collapsed turn', () => {
    const rows = buildConversationRows({
      expandedTurns: {},
      interruptedTurnIds: new Set(),
      isStreaming: false,
      lastSentTurnId: null,
      streamingElapsed: 0,
      turns: [
        turn('user-1', [
          { id: 'text-1', kind: 'text', text: 'Progress note' },
          { id: 'tool-1', kind: 'tool' },
          { id: 'tool-2', kind: 'tool' },
        ]),
      ],
    })

    expect(rows.map((row) => row.kind)).toEqual(['user', 'status', 'timeline', 'work-run'])
    expect(rows[2]).toMatchObject({ item: expect.objectContaining({ id: 'text-1' }) })
    expect(rows[3]).toMatchObject({ isActive: false, isExpanded: false, isLast: true })
  })
})

describe('buildSubagentConversationRows', () => {
  it('uses the shared row model for the initial prompt and every timeline item', () => {
    const rows = buildSubagentConversationRows({
      initialUserMessage: userMessage('agent-user'),
      items: [
        { id: 'agent-thinking', kind: 'thinking', text: 'Working' },
        { id: 'agent-text', kind: 'text', text: 'Done' },
      ],
    })

    expect(rows.map(({ key, kind }) => ({ key, kind }))).toEqual([
      { key: 'subagent:user:agent-user', kind: 'user' },
      { key: 'subagent:timeline:agent-thinking', kind: 'timeline' },
      { key: 'subagent:timeline:agent-text', kind: 'timeline' },
    ])
  })

  it('folds consecutive work items into a run while streaming marks it active', () => {
    const rows = buildSubagentConversationRows({
      isStreaming: true,
      items: [
        { id: 'agent-thinking', kind: 'thinking', text: 'Working' },
        { id: 'agent-tool-1', kind: 'tool' },
        { id: 'agent-tool-2', kind: 'tool' },
      ],
    })

    expect(rows.map((row) => row.kind)).toEqual(['work-run'])
    expect(rows[0]).toMatchObject({
      isActive: true,
      isExpanded: false,
      key: 'subagent:run:agent-thinking',
    })
  })
})
