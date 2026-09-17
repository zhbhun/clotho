import { describe, expect, it } from 'vitest'

import { isTimelineToolRunning } from './tool-state'
import type { ConversationTimelineItem } from './types'

function toolItem({
  backgroundTask,
  name = 'Bash',
  status,
  toolUseResult,
}: {
  backgroundTask?: Extract<ConversationTimelineItem, { kind: 'tool' }>['backgroundTask']
  name?: string
  status?: string
  toolUseResult?: Record<string, unknown>
}): Extract<ConversationTimelineItem, { kind: 'tool' }> {
  return {
    backgroundTask,
    id: 'tool-1',
    kind: 'tool',
    use: {
      type: 'tool_use',
      name,
      toolUseId: 'tool-use-1',
      input: {},
    },
    result: status
      ? {
          type: 'tool_result',
          content: '',
          toolUseResult: { status, ...toolUseResult },
        }
      : undefined,
  }
}

describe('isTimelineToolRunning', () => {
  it.each(['async_launched', 'running', 'in_progress'])(
    'stops a foreground %s tool when its turn is interrupted',
    (status) => {
      expect(
        isTimelineToolRunning(toolItem({ status }), {
          isStreaming: false,
          turnTerminalStatus: 'interrupted',
        }),
      ).toBe(false)
    },
  )

  it('stops a foreground tool when its turn fails', () => {
    expect(
      isTimelineToolRunning(toolItem({ status: 'running' }), {
        isStreaming: false,
        turnTerminalStatus: 'failed',
      }),
    ).toBe(false)
  })

  it.each([
    ['Agent', { status: 'async_launched', agentId: 'agent-1' }],
    ['Agent', { status: 'remote_launched', taskId: 'remote-1' }],
    ['Workflow', { status: 'async_launched', taskId: 'task-1', runId: 'run-1' }],
  ])('keeps a confirmed background %s running after its turn stops', (name, result) => {
    expect(
      isTimelineToolRunning(toolItem({ name, status: result.status, toolUseResult: result }), {
        isStreaming: false,
        turnTerminalStatus: 'interrupted',
      }),
    ).toBe(true)
  })

  it.each([
    ['Agent', 'async_launched'],
    ['Workflow', 'async_launched'],
  ])('does not treat an unconfirmed background %s launch as running', (name, status) => {
    expect(
      isTimelineToolRunning(toolItem({ name, status }), {
        isStreaming: false,
        turnTerminalStatus: 'failed',
      }),
    ).toBe(false)
  })

  it('preserves the existing active status when the turn completed normally', () => {
    expect(
      isTimelineToolRunning(toolItem({ status: 'running' }), {
        isStreaming: false,
      }),
    ).toBe(true)
  })

  it('keeps a confirmed background command running independently of its parent turn', () => {
    expect(
      isTimelineToolRunning(toolItem({ backgroundTask: { taskId: 'task-1', status: 'running' } }), {
        isStreaming: false,
        turnTerminalStatus: 'interrupted',
      }),
    ).toBe(true)
  })

  it('stops loading when the background command reaches a terminal state', () => {
    expect(
      isTimelineToolRunning(
        toolItem({ backgroundTask: { taskId: 'task-1', status: 'completed' } }),
        { isStreaming: true },
      ),
    ).toBe(false)
  })
})
