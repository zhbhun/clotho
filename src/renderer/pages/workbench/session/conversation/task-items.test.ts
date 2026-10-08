import { describe, expect, it } from 'vitest'

import { claudeJsonToMessage } from '../services/message'
import { latestTaskItems, normalizeTaskItems } from './task-items'
import { computeTurns } from './turns'
import type { ConversationTimelineItem } from './types'

type ToolItem = Extract<ConversationTimelineItem, { kind: 'tool' }>

function taskTool(
  id: string,
  name: string,
  input: Record<string, unknown>,
  toolUseResult?: unknown,
): ToolItem {
  return {
    id: `tool-${id}`,
    kind: 'tool',
    use: { type: 'tool_use', name, toolUseId: id, input },
    result: { type: 'tool_result', content: 'ok', toolUseResult },
  }
}

function taskCard(items: ConversationTimelineItem[]) {
  return items.find((item) => item.kind === 'task')
}

describe('normalizeTaskItems', () => {
  it('folds consecutive creates into one card and keeps update rows standalone', () => {
    const items = normalizeTaskItems([
      taskTool('c1', 'TaskCreate', { subject: 'One' }, { task: { id: '1', subject: 'One' } }),
      taskTool('c2', 'TaskCreate', { subject: 'Two' }, { task: { id: '2', subject: 'Two' } }),
      taskTool('u1', 'TaskUpdate', { taskId: '2' }, { statusChange: { to: 'in_progress' } }),
    ])

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ kind: 'task' })
    expect(items[1]).toMatchObject({ kind: 'tool', use: { name: 'TaskUpdate' } })
    // The card snapshots tasks as created; later updates only live in their own rows.
    expect(taskCard(items)).toMatchObject({
      tasks: [
        { id: '1', subject: 'One', status: 'pending' },
        { id: '2', subject: 'Two', status: 'pending' },
      ],
    })
  })

  it('merges a later create into the card while a task is still open, even across other items', () => {
    const items = normalizeTaskItems([
      taskTool('c1', 'TaskCreate', { subject: 'One' }, { task: { id: '1', subject: 'One' } }),
      { id: 'think', kind: 'thinking', text: 'planning' },
      taskTool('c2', 'TaskCreate', { subject: 'Two' }, { task: { id: '2', subject: 'Two' } }),
    ])

    expect(items.filter((item) => item.kind === 'task')).toHaveLength(1)
    expect(taskCard(items)).toMatchObject({ tasks: [{ id: '1' }, { id: '2' }] })
  })

  it('opens a fresh card once every task completed or was cancelled', () => {
    const items = normalizeTaskItems([
      taskTool('c1', 'TaskCreate', { subject: 'One' }, { task: { id: '1', subject: 'One' } }),
      taskTool('u1', 'TaskUpdate', { taskId: '1' }, { statusChange: { to: 'completed' } }),
      taskTool('c2', 'TaskCreate', { subject: 'Two' }, { task: { id: '2', subject: 'Two' } }),
      taskTool('u2', 'TaskUpdate', { taskId: '2' }, { statusChange: { to: 'cancelled' } }),
      taskTool('c3', 'TaskCreate', { subject: 'Three' }, { task: { id: '3', subject: 'Three' } }),
    ])

    const cards = items.filter((item) => item.kind === 'task')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toMatchObject({ tasks: [{ id: '1', status: 'pending' }] })
    expect(cards[1]).toMatchObject({ tasks: [{ id: '2', status: 'pending' }] })
    expect(cards[2]).toMatchObject({ tasks: [{ id: '3', status: 'pending' }] })
  })

  it('marks a task cancelled from a TaskStop call and keeps the stop row', () => {
    const items = normalizeTaskItems([
      taskTool('c1', 'TaskCreate', { subject: 'One' }, { task: { id: '1', subject: 'One' } }),
      taskTool('s1', 'TaskStop', { taskId: '1' }),
    ])

    expect(items).toHaveLength(2)
    expect(items[1]).toMatchObject({ kind: 'tool', use: { name: 'TaskStop' } })
    expect(taskCard(items)).toMatchObject({ tasks: [{ id: '1', status: 'pending' }] })
  })

  it('attaches the task list snapshot to tracked update rows', () => {
    const items = normalizeTaskItems([
      taskTool('c1', 'TaskCreate', { subject: 'One' }, { task: { id: '1', subject: 'One' } }),
      taskTool('c2', 'TaskCreate', { subject: 'Two' }, { task: { id: '2', subject: 'Two' } }),
      taskTool('u1', 'TaskUpdate', { taskId: '1' }, { statusChange: { to: 'completed' } }),
      taskTool('u2', 'TaskUpdate', { taskId: '2' }, { statusChange: { to: 'in_progress' } }),
    ])

    // items: [task card, update #1 row, update #2 row] — the two creates fold into one card.
    expect(items[1]).toMatchObject({
      kind: 'tool',
      taskItems: [
        { id: '1', status: 'completed' },
        { id: '2', status: 'pending' },
      ],
    })
    expect(items[2]).toMatchObject({
      kind: 'tool',
      taskItems: [
        { id: '1', status: 'completed' },
        { id: '2', status: 'in_progress' },
      ],
    })
  })

  it('keeps creates without a resolvable id as plain tool rows', () => {
    const items = normalizeTaskItems([taskTool('c1', 'TaskCreate', { subject: 'No id yet' })])

    expect(items).toEqual([items[0]])
    expect(items[0].kind).toBe('tool')
  })
})

describe('latestTaskItems', () => {
  it('replays cards and tracked update snapshots into the newest task state', () => {
    const items = normalizeTaskItems([
      taskTool('c1', 'TaskCreate', { subject: 'One' }, { task: { id: '1', subject: 'One' } }),
      taskTool('c2', 'TaskCreate', { subject: 'Two' }, { task: { id: '2', subject: 'Two' } }),
      taskTool('u1', 'TaskUpdate', { taskId: '1' }, { statusChange: { to: 'completed' } }),
      taskTool('u2', 'TaskUpdate', { taskId: '2' }, { statusChange: { to: 'in_progress' } }),
    ])

    expect(latestTaskItems(items)).toEqual([
      { id: '1', subject: 'One', status: 'completed' },
      { id: '2', subject: 'Two', status: 'in_progress' },
    ])
  })

  it('appends tasks created after a tracked snapshot', () => {
    const items = normalizeTaskItems([
      taskTool('c1', 'TaskCreate', { subject: 'One' }, { task: { id: '1', subject: 'One' } }),
      taskTool('u1', 'TaskUpdate', { taskId: '1' }, { statusChange: { to: 'completed' } }),
      taskTool('c2', 'TaskCreate', { subject: 'Two' }, { task: { id: '2', subject: 'Two' } }),
    ])

    expect(latestTaskItems(items)).toEqual([
      { id: '1', subject: 'One', status: 'completed' },
      { id: '2', subject: 'Two', status: 'pending' },
    ])
  })

  it('reflects cancellations from stop rows', () => {
    const items = normalizeTaskItems([
      taskTool('c1', 'TaskCreate', { subject: 'One' }, { task: { id: '1', subject: 'One' } }),
      taskTool('s1', 'TaskStop', { taskId: '1' }),
    ])

    expect(latestTaskItems(items)).toEqual([{ id: '1', subject: 'One', status: 'cancelled' }])
  })

  it('returns empty without task activity', () => {
    expect(latestTaskItems([{ id: 't', kind: 'thinking', text: 'hi' }])).toEqual([])
  })

  it('advances statuses for updates that land in later turns than the creates', () => {
    // Turn boundaries make normalizeTaskItems replay from an empty index, so the
    // fold must read the update events themselves, not per-turn snapshots.
    const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({
      type: 'tool_use' as const,
      id,
      name,
      input,
    })
    const entry = (
      uuid: string,
      parentUuid: string | undefined,
      type: 'user' | 'assistant',
      content: (ReturnType<typeof toolUse> | { type: 'text'; text: string })[],
    ) =>
      claudeJsonToMessage({
        type,
        uuid,
        parentUuid,
        timestamp: '2026-10-08T10:00:00.000Z',
        message: { role: type, content },
      })
    const toolResult = (id: string, toolUseResult: unknown) => ({
      type: 'user' as const,
      uuid: `result-${id}`,
      timestamp: '2026-10-08T10:00:01.000Z',
      toolUseResult,
      message: {
        role: 'user' as const,
        content: [{ type: 'tool_result' as const, tool_use_id: id, content: 'ok' }],
      },
    })

    const messages = [
      entry('u1', undefined, 'user', [{ type: 'text', text: 'plan the work' }]),
      entry('a1', 'u1', 'assistant', [toolUse('c1', 'TaskCreate', { subject: 'One' })]),
      claudeJsonToMessage(toolResult('c1', { task: { id: '1', subject: 'One' } })),
      entry('a1b', 'a1', 'assistant', [toolUse('c2', 'TaskCreate', { subject: 'Two' })]),
      claudeJsonToMessage(toolResult('c2', { task: { id: '2', subject: 'Two' } })),
      entry('a2', 'a1', 'assistant', [
        toolUse('t1', 'TaskUpdate', { taskId: '1', status: 'in_progress' }),
      ]),
      claudeJsonToMessage(
        toolResult('t1', { taskId: '1', statusChange: { from: 'pending', to: 'in_progress' } }),
      ),
      entry('a3', 'a2', 'assistant', [
        toolUse('t2', 'TaskUpdate', { taskId: '1', status: 'completed' }),
      ]),
      claudeJsonToMessage(
        toolResult('t2', { taskId: '1', statusChange: { from: 'in_progress', to: 'completed' } }),
      ),
      // A user reply closes turn one; the remaining updates land in turn two.
      entry('u2', 'a3', 'user', [{ type: 'text', text: 'go on' }]),
      entry('a4', 'u2', 'assistant', [
        toolUse('t3', 'TaskUpdate', { taskId: '2', status: 'in_progress' }),
      ]),
      claudeJsonToMessage(
        toolResult('t3', { taskId: '2', statusChange: { from: 'pending', to: 'in_progress' } }),
      ),
      entry('a5', 'a4', 'assistant', [
        toolUse('t4', 'TaskUpdate', { taskId: '2', status: 'completed' }),
      ]),
      claudeJsonToMessage(
        toolResult('t4', { taskId: '2', statusChange: { from: 'in_progress', to: 'completed' } }),
      ),
    ].filter((message): message is NonNullable<typeof message> => Boolean(message))

    const items = computeTurns(messages).flatMap((turn) => turn.timelineItems)
    expect(latestTaskItems(items)).toEqual([
      { id: '1', subject: 'One', status: 'completed' },
      { id: '2', subject: 'Two', status: 'completed' },
    ])
  })
})
