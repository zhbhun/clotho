import { describe, expect, it } from 'vitest'

import { normalizeTaskItems } from './task-items'
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
