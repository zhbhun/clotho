import { describe, expect, it } from 'vitest'

import type { ClaudeMessage } from '../services/message'
import { type TimelineSink, appendTimelineItems } from './timeline-items'

function assistantToolUse(id: string): ClaudeMessage {
  return {
    id: `assistant-${id}`,
    role: 'assistant',
    content: '',
    blocks: [{ type: 'tool_use', name: 'Bash', input: {}, toolUseId: id }],
  }
}

describe('appendTimelineItems', () => {
  it('pairs parallel tool results by tool_use id, not by arrival order', () => {
    const sink: TimelineSink = { timelineItems: [] }
    appendTimelineItems(sink, assistantToolUse('a'))
    appendTimelineItems(sink, assistantToolUse('b'))
    // A parallel batch lands in one frame in call order; ids must decide.
    appendTimelineItems(sink, {
      id: 'results',
      role: 'tool',
      content: '',
      blocks: [
        { type: 'tool_result', toolUseId: 'a', content: 'out-a' },
        { type: 'tool_result', toolUseId: 'b', content: 'out-b' },
      ],
    })

    const rows = sink.timelineItems.map((item) =>
      item.kind === 'tool' ? { id: item.use?.toolUseId, out: item.result?.content } : item.kind,
    )
    expect(rows).toEqual([
      { id: 'a', out: 'out-a' },
      { id: 'b', out: 'out-b' },
    ])
  })

  it('keeps the nearest result-less row as the fallback when ids do not match', () => {
    const sink: TimelineSink = { timelineItems: [] }
    appendTimelineItems(sink, assistantToolUse('a'))
    appendTimelineItems(sink, {
      id: 'result-orphan',
      role: 'tool',
      content: '',
      blocks: [{ type: 'tool_result', content: 'orphan' }],
    })

    expect(sink.timelineItems).toHaveLength(1)
    const row = sink.timelineItems[0]
    expect(row.kind === 'tool' && row.result?.content).toBe('orphan')
  })
})
