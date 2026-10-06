import { describe, expect, it } from 'vitest'

import type { ConversationTimelineItem } from './types'
import { groupWorkRuns, summarizeWorkRun, workRunHeader } from './work-runs'

type ToolItem = Extract<ConversationTimelineItem, { kind: 'tool' }>

function toolItem(
  id: string,
  name = 'Bash',
  extra: Partial<ToolItem> = {},
): ConversationTimelineItem {
  return {
    id,
    kind: 'tool',
    use: { type: 'tool_use', name, toolUseId: `${id}-use`, input: {} },
    ...extra,
  }
}

function thinkingItem(id: string): ConversationTimelineItem {
  return { id, kind: 'thinking', text: 'Reasoning' }
}

function textItem(id: string): ConversationTimelineItem {
  return { id, kind: 'text', text: 'Answer' }
}

describe('groupWorkRuns', () => {
  it('folds consecutive non-text items into a run keyed by the first tool id', () => {
    const slices = groupWorkRuns([thinkingItem('t1'), toolItem('t2'), toolItem('t3')], 'turn:u1')

    expect(slices).toEqual([
      {
        kind: 'run',
        runId: 'turn:u1:run:t2-use',
        items: [thinkingItem('t1'), toolItem('t2'), toolItem('t3')],
      },
    ])
  })

  it('keeps a lone item standalone', () => {
    const slices = groupWorkRuns([toolItem('t1')], 'turn:u1')

    expect(slices).toEqual([{ kind: 'single', item: toolItem('t1') }])
  })

  it('splits runs around text items', () => {
    const slices = groupWorkRuns(
      [toolItem('t1'), toolItem('t2'), textItem('x1'), toolItem('t3'), toolItem('t4')],
      'turn:u1',
    )

    expect(slices.map((slice) => slice.kind)).toEqual(['run', 'single', 'run'])
    expect(slices[0]).toMatchObject({ runId: 'turn:u1:run:t1-use' })
    expect(slices[2]).toMatchObject({ runId: 'turn:u1:run:t3-use' })
  })

  it('keeps the run id stable when a leading thinking item retires from the stream placeholder', () => {
    const before = groupWorkRuns(
      [thinkingItem('stream-3-thinking-0'), toolItem('t2'), toolItem('t3')],
      'turn:u1',
    )
    const after = groupWorkRuns(
      [thinkingItem('assistant-2026-09-01T00-00-00-5-thinking-0'), toolItem('t2'), toolItem('t3')],
      'turn:u1',
    )

    expect(before[0]?.kind).toBe('run')
    expect(after[0]?.kind).toBe('run')
    if (before[0]?.kind !== 'run' || after[0]?.kind !== 'run') return
    expect(after[0].runId).toBe(before[0].runId)
  })

  it('keeps ungroupable items standalone and breaks the surrounding run', () => {
    const slices = groupWorkRuns(
      [toolItem('t1'), toolItem('t2'), toolItem('t3')],
      'turn:u1',
      (item) => item.id !== 't2',
    )

    expect(slices.map((slice) => slice.kind)).toEqual(['single', 'single', 'single'])
  })
})

describe('summarizeWorkRun', () => {
  it('counts each tool category in first-appearance order', () => {
    const { parts } = summarizeWorkRun([
      toolItem('t1', 'Bash'),
      toolItem('t2', 'PowerShell'),
      toolItem('t3', 'Read'),
      toolItem('t4', 'Edit'),
      toolItem('t5', 'Write'),
      toolItem('t6', 'Grep'),
      toolItem('t7', 'WebFetch'),
      toolItem('t8', 'WebSearch'),
      toolItem('t9', 'Agent'),
      toolItem('t10', 'mcp__notebook__run'),
      toolItem('t11', 'TaskUpdate'),
      toolItem('t12', 'TodoWrite'),
      toolItem('t13', 'AskUserQuestion'),
    ])

    expect(parts).toEqual([
      { countKey: 'commands', count: 2 },
      { countKey: 'filesRead', count: 1 },
      { countKey: 'filesEdited', count: 2 },
      { countKey: 'searches', count: 1 },
      { countKey: 'web', count: 2 },
      { countKey: 'agents', count: 1 },
      { countKey: 'other', count: 1 },
      { countKey: 'tasks', count: 2 },
      { countKey: 'questions', count: 1 },
    ])
  })

  it('counts task tool calls under tasks instead of other', () => {
    const { parts } = summarizeWorkRun([
      toolItem('t1', 'TaskUpdate'),
      toolItem('t2', 'TaskUpdate'),
      toolItem('t3', 'TaskList'),
    ])

    expect(parts).toEqual([{ countKey: 'tasks', count: 3 }])
  })

  it('counts a merged task card by its task count', () => {
    const { parts } = summarizeWorkRun([
      {
        id: 'card',
        kind: 'task',
        tasks: [
          { id: '1', subject: 'a', status: 'completed' },
          { id: '2', subject: 'b', status: 'pending' },
          { id: '3', subject: 'c', status: 'cancelled' },
        ],
      },
    ])

    expect(parts).toEqual([{ countKey: 'tasks', count: 3 }])
  })

  it('orders parts by first appearance instead of category rank', () => {
    const { parts } = summarizeWorkRun([
      thinkingItem('t1'),
      toolItem('t2', 'Read'),
      thinkingItem('t3'),
      toolItem('t4', 'Read'),
      toolItem('t5', 'Bash'),
    ])

    expect(parts).toEqual([
      { countKey: 'thought', count: 2 },
      { countKey: 'filesRead', count: 2 },
      { countKey: 'commands', count: 1 },
    ])
  })

  it('counts coalesced reads by file count', () => {
    const { parts } = summarizeWorkRun([
      toolItem('t1', 'Read', {
        coalescedReads: [{ file_path: 'a.ts' }, { file_path: 'b.ts' }, { file_path: 'c.ts' }],
      }),
    ])

    expect(parts).toEqual([{ countKey: 'filesRead', count: 3 }])
  })

  it('collects thinking items as the thought count', () => {
    const { parts } = summarizeWorkRun([thinkingItem('t1'), thinkingItem('t2')])

    expect(parts).toEqual([{ countKey: 'thought', count: 2 }])
  })
})

describe('workRunHeader', () => {
  const finishedTool = toolItem('t1', 'Bash', {
    result: { type: 'tool_result', content: 'ok' },
  })

  it('shows the running tool while the active run executes', () => {
    const running = toolItem('t2')

    expect(workRunHeader([finishedTool, running], { isActive: true, isStreaming: true })).toEqual({
      kind: 'running',
      tool: running,
    })
  })

  it('shows a thinking placeholder between tools in the active run', () => {
    expect(workRunHeader([finishedTool], { isActive: true, isStreaming: true })).toEqual({
      kind: 'thinking',
    })
  })

  it('shows the summary once the run is no longer active', () => {
    expect(workRunHeader([finishedTool], { isActive: false, isStreaming: false })).toEqual({
      kind: 'summary',
    })
  })

  it('prefers the summary over thinking when the turn reached a terminal status', () => {
    expect(
      workRunHeader([finishedTool], {
        isActive: true,
        isStreaming: true,
        turnTerminalStatus: 'interrupted',
      }),
    ).toEqual({ kind: 'summary' })
  })
})
