import { describe, expect, it } from 'vitest'

import { StreamAssembler } from '../services/message-stream'
import { computeTurns } from './turns'

const IMAGE = {
  type: 'image',
  source: { type: 'base64', media_type: 'image/png', data: 'aW1hZ2U=' },
}

function jsonLine(value: unknown) {
  return JSON.stringify(value)
}

describe('live wire keeps the turn anchored at the real prompt', () => {
  it('does not split the turn on a tool-result image or an isMeta-less annotation frame', () => {
    const assembler = new StreamAssembler()
    const lines = [
      // The real prompt.
      jsonLine({
        type: 'user',
        uuid: 'u-prompt',
        timestamp: '2026-10-09T08:12:02.362Z',
        message: { role: 'user', content: '没问题继续' },
      }),
      // Assistant frames + a Read that returns an image.
      jsonLine({
        type: 'assistant',
        uuid: 'a-1',
        timestamp: '2026-10-09T09:26:00.718Z',
        message: {
          role: 'assistant',
          model: 'zhipu-glm/glm-5.3-flash',
          content: [
            { type: 'tool_use', id: 't-1', name: 'Read', input: { file_path: '/tmp/x.png' } },
          ],
        },
      }),
      jsonLine({
        type: 'user',
        uuid: 'u-toolresult',
        timestamp: '2026-10-09T09:26:00.869Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't-1', content: [IMAGE] }],
        },
      }),
      // The companion annotation arrives live WITHOUT isMeta.
      jsonLine({
        type: 'user',
        uuid: 'u-annotation',
        timestamp: '2026-10-09T09:26:00.868Z',
        message: {
          role: 'user',
          content:
            '[Image: original 2548x1311, displayed at 2000x1029. Multiply coordinates by 1.27 to map to original image.]',
        },
      }),
      // Final assistant reply.
      jsonLine({
        type: 'assistant',
        uuid: 'a-final',
        timestamp: '2026-10-09T09:30:04.929Z',
        message: {
          role: 'assistant',
          model: 'zhipu-glm/glm-5.3-flash',
          content: [{ type: 'text', text: '全部完成。' }],
        },
      }),
    ]
    for (const line of lines) assembler.processLine(line)

    const turns = computeTurns(assembler.getAll())
    expect(turns).toHaveLength(1)
    const turn = turns[0]!
    expect(turn.userMessage.content).toBe('没问题继续')
    const start = new Date(turn.userMessage.timestamp!).getTime()
    const end = new Date(turn.endTimestamp!).getTime()
    expect(Math.round((end - start) / 1000)).toBe(78 * 60 + 3)
  })
})
