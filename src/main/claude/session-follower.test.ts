// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  SessionFollower,
  consumeChunk,
  inferFollowState,
  splitCompleteLines,
} from './session-follower'
import type {
  FollowAccumulator,
  FollowReader,
  FollowScheduler,
  FollowSink,
  FollowState,
} from './session-follower'
import type { SessionEntry } from './session-meta'

const line = (fields: object): SessionEntry => fields as SessionEntry
const acc = (): FollowAccumulator => ({
  offset: 0,
  lineBuf: '',
  lastEntry: undefined,
  state: 'idle',
})
const userLine =
  '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"hi"}]}}\n'
const endTurnLine =
  '{"type":"assistant","message":{"role":"assistant","stop_reason":"end_turn","content":[]}}\n'

describe('splitCompleteLines', () => {
  it('accumulates the remainder across calls until a newline arrives', () => {
    let result = splitCompleteLines('', '{"a":1}\n{"b":')
    expect(result.lines).toEqual(['{"a":1}'])
    expect(result.remainder).toBe('{"b":')
    result = splitCompleteLines(result.remainder, '2}\n{"c":3}\n')
    expect(result.lines).toEqual(['{"b":2}', '{"c":3}'])
    expect(result.remainder).toBe('')
  })
})

describe('inferFollowState', () => {
  it('treats a normally finished assistant turn as idle', () => {
    expect(
      inferFollowState(
        line({
          type: 'assistant',
          message: { role: 'assistant', content: [], stop_reason: 'end_turn' },
        }),
      ),
    ).toBe('idle')
  })

  it('treats a fresh user prompt as processing', () => {
    expect(
      inferFollowState(
        line({
          type: 'user',
          message: { role: 'user', content: [{ type: 'text', text: 'Write a function for me' }] },
        }),
      ),
    ).toBe('processing')
  })

  it.each(['[Request interrupted by user]', '[Request interrupted by user for tool use]'])(
    'recognises the %s marker as interrupted',
    (marker) => {
      expect(
        inferFollowState(
          line({
            type: 'user',
            message: {
              role: 'user',
              content: [{ type: 'text', text: marker }],
            },
          }),
        ),
      ).toBe('interrupted')
    },
  )
})

describe('consumeChunk', () => {
  it('buffers a partial line across calls', () => {
    const a = acc()
    let res = consumeChunk(a, userLine.slice(0, 20))
    expect(res.entries).toHaveLength(0)
    res = consumeChunk(a, userLine.slice(20))
    expect(res.entries).toHaveLength(1)
    expect(a.state).toBe('processing')
  })

  it('skips lines that are not valid JSON', () => {
    const a = acc()
    const res = consumeChunk(a, `not-json\n${userLine}`)
    expect(res.entries).toHaveLength(1)
  })
})

function fakes() {
  let buf = ''
  const reader: FollowReader = {
    size: async () => buf.length,
    read: async (offset, length) => {
      const bytes = Buffer.from(buf.slice(offset, offset + length), 'utf8')
      return { bytes, bytesRead: bytes.length }
    },
  }
  const delays: number[] = []
  const handles: Array<() => void> = []
  const scheduler: FollowScheduler = {
    delay: (fn, ms) => {
      handles.push(fn)
      delays.push(ms)
      return handles.length - 1
    },
    cancel: () => {},
  }
  const lines: SessionEntry[][] = []
  const states: FollowState[] = []
  let resets = 0
  const sink: FollowSink = {
    intervalMs: (s) => (s === 'processing' ? 1000 : 3000),
    onLines: (l) => {
      lines.push(l)
    },
    onState: (s) => {
      states.push(s)
    },
    onReset: () => {
      resets += 1
    },
  }
  return {
    reader,
    scheduler,
    sink,
    append: (s: string) => {
      buf += s
    },
    setBuf: (s: string) => {
      buf = s
    },
    delays,
    lines,
    states,
    resets: () => resets,
  }
}

describe('SessionFollower', () => {
  it('starts at the current file size and emits lines grown after start', async () => {
    const f = fakes()
    f.append('initial\n')
    const follower = new SessionFollower(f.reader, f.scheduler, f.sink)
    await follower.start()
    expect(f.delays[0]).toBe(0)
    f.append(userLine)
    await follower.tick()
    expect(f.lines).toHaveLength(1)
    expect(f.lines[0]?.[0]?.type).toBe('user')
    expect(f.states).toEqual(['processing'])
  })

  it('resets and signals onReset when the file shrinks', async () => {
    const f = fakes()
    f.append('x'.repeat(100))
    const follower = new SessionFollower(f.reader, f.scheduler, f.sink)
    await follower.start()
    f.setBuf('short')
    await follower.tick()
    expect(f.resets()).toBe(1)
  })

  it('starts from a stored offset and only reads bytes after it', async () => {
    const f = fakes()
    const follower = new SessionFollower(f.reader, f.scheduler, f.sink)
    await follower.start()
    f.append(userLine)
    await follower.tick()
    const offset = follower.getCurrentOffset()
    follower.stop()

    const resumed = new SessionFollower(f.reader, f.scheduler, f.sink)
    await resumed.start(offset)
    f.append(endTurnLine)
    await resumed.tick()
    expect(f.lines.map((l) => l[0]?.type)).toEqual(['user', 'assistant'])
  })

  it('keeps polling after a read throws', async () => {
    const reader: FollowReader = {
      size: async () => 10,
      read: async () => {
        throw new Error('read failed')
      },
    }
    const delays: number[] = []
    const scheduler: FollowScheduler = {
      delay: (_fn, ms) => {
        delays.push(ms)
        return 0
      },
      cancel: () => {},
    }
    const sink: FollowSink = {
      intervalMs: () => 1000,
      onLines() {},
      onState() {},
      onReset() {},
    }
    const follower = new SessionFollower(reader, scheduler, sink)
    await follower.start(0)
    await follower.tick()
    expect(delays.at(-1)).toBe(1000)
    expect(follower.getCurrentOffset()).toBe(0)
  })

  it('advances offset by bytes actually read on a short read', async () => {
    const reader: FollowReader = {
      size: async () => 100,
      read: async () => ({ bytes: Buffer.from('abc'), bytesRead: 3 }),
    }
    const scheduler: FollowScheduler = {
      delay: () => 0,
      cancel: () => {},
    }
    const sink: FollowSink = {
      intervalMs: () => 1000,
      onLines() {},
      onState() {},
      onReset() {},
    }
    const follower = new SessionFollower(reader, scheduler, sink)
    await follower.start(0)
    await follower.tick()
    expect(follower.getCurrentOffset()).toBe(3)
  })
})
