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
  it('folds consecutive non-text items into a run keyed by the first item', () => {
    const slices = groupWorkRuns([thinkingItem('t1'), toolItem('t2'), toolItem('t3')], 'turn:u1')

    expect(slices).toEqual([
      {
        kind: 'run',
        runId: 'turn:u1:run:t1',
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
    expect(slices[0]).toMatchObject({ runId: 'turn:u1:run:t1' })
    expect(slices[2]).toMatchObject({ runId: 'turn:u1:run:t3' })
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
  it('counts each tool category', () => {
    const { counts } = summarizeWorkRun([
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
      { id: 'todo-1', kind: 'todo', todos: [] },
    ])

    expect(counts).toEqual({
      agents: 1,
      commands: 2,
      filesEdited: 2,
      filesRead: 1,
      other: 1,
      searches: 1,
      tasks: 1,
      web: 2,
    })
  })

  it('counts coalesced reads by file count', () => {
    const { counts } = summarizeWorkRun([
      toolItem('t1', 'Read', {
        coalescedReads: [{ file_path: 'a.ts' }, { file_path: 'b.ts' }, { file_path: 'c.ts' }],
      }),
    ])

    expect(counts.filesRead).toBe(3)
  })

  it('collects thinking items as the thought count', () => {
    const { counts, thoughtCount } = summarizeWorkRun([thinkingItem('t1'), thinkingItem('t2')])

    expect(thoughtCount).toBe(2)
    expect(Object.values(counts).every((value) => value === 0)).toBe(true)
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
