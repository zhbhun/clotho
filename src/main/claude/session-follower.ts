import { open, stat } from 'node:fs/promises'

import type { ClaudeFollowState } from '@/shared/rpc'

import { textFromContent } from './session-meta'
import type { SessionEntry } from './session-meta'

export type FollowState = ClaudeFollowState

export type FollowAccumulator = {
  offset: number
  lineBuf: string
  lastEntry: SessionEntry | undefined
  state: FollowState
}

export type FollowReader = {
  size: () => Promise<number>
  read: (offset: number, length: number) => Promise<{ bytes: Uint8Array; bytesRead: number }>
}

export type FollowScheduler = {
  delay: (fn: () => void, ms: number) => unknown
  cancel: (handle: unknown) => void
}

export type FollowSink = {
  intervalMs: (state: FollowState) => number
  onLines: (lines: SessionEntry[]) => void | Promise<void>
  onState: (state: FollowState) => void
  onReset?: () => void
}

/**
 * Append a newly read chunk to the existing buffer and split out complete lines.
 * Return a final unterminated segment as remainder for the next read; discard empty lines.
 */
export function splitCompleteLines(
  buffer: string,
  chunk: string,
): { lines: string[]; remainder: string } {
  const parts = (buffer + chunk).split('\n')
  const remainder = parts.pop() ?? ''
  const lines = parts.filter((line) => line.trim() !== '')
  return { lines, remainder }
}

function stopReason(entry: SessionEntry): string | undefined {
  const message = entry.message
  if (!message || typeof message !== 'object') return undefined
  const value = (message as Record<string, unknown>).stop_reason
  return typeof value === 'string' ? value : undefined
}

const INTERRUPT_FLAGS = new Set(['interrupted', 'interruptedByShutdown', 'isInterrupted'])
const INTERRUPTION_MARKERS = new Set([
  '[Request interrupted by user]',
  '[Request interrupted by user for tool use]',
])

function isInterruptEntry(entry: SessionEntry): boolean {
  for (const [key, value] of Object.entries(entry)) {
    if (value === true && INTERRUPT_FLAGS.has(key)) return true
  }
  return INTERRUPTION_MARKERS.has(textFromContent(entry.message?.content) ?? '')
}

/**
 * Infer the remote session's follow state from its latest conversation message.
 * - Normal user / tool_result / unfinished tool_use → processing (the model should respond)
 * - Assistant with a normal stop reason (such as end_turn) → idle
 * - A known CLI interruption placeholder or a top-level interrupted* marker → interrupted
 */
export function inferFollowState(entry: SessionEntry | undefined): FollowState {
  if (!entry) return 'idle'
  if (entry.type === 'user') {
    return isInterruptEntry(entry) ? 'interrupted' : 'processing'
  }
  if (entry.type === 'assistant') {
    // Only explicit terminal stop reasons are idle; tool_use or missing reasons remain processing.
    const reason = stopReason(entry)
    return reason === 'tool_use' || !reason ? 'processing' : 'idle'
  }
  return 'idle'
}

/**
 * Feed one newly read chunk to the accumulator: split, parse, and advance lastEntry and state.
 * Skip malformed lines; only user/assistant lines participate in state inference. Return new lines and state changes.
 */
export function consumeChunk(
  acc: FollowAccumulator,
  chunk: string,
): { entries: SessionEntry[]; stateChanged: boolean } {
  const { lines, remainder } = splitCompleteLines(acc.lineBuf, chunk)
  acc.lineBuf = remainder
  const entries: SessionEntry[] = []
  for (const raw of lines) {
    let entry: SessionEntry
    try {
      entry = JSON.parse(raw) as SessionEntry
    } catch {
      continue
    }
    entries.push(entry)
    if (entry.type === 'user' || entry.type === 'assistant') {
      acc.lastEntry = entry
    }
  }
  const next = inferFollowState(acc.lastEntry)
  const stateChanged = next !== acc.state
  acc.state = next
  return { entries, stateChanged }
}

/**
 * Tail a JSONL session file by byte offset: read new bytes from the previous offset each round,
 * split and parse them, then emit the results. State controls the next polling interval;
 * reset and notify onReset when the file is rewritten and its size decreases.
 */
export class SessionFollower {
  private readonly reader: FollowReader
  private readonly scheduler: FollowScheduler
  private readonly sink: FollowSink
  private acc: FollowAccumulator = { offset: 0, lineBuf: '', lastEntry: undefined, state: 'idle' }
  private decoder = new TextDecoder()
  private stopped = false
  private timer: unknown = null

  constructor(reader: FollowReader, scheduler: FollowScheduler, sink: FollowSink) {
    this.reader = reader
    this.scheduler = scheduler
    this.sink = sink
  }

  async start(initialOffset?: number): Promise<void> {
    this.acc.offset = initialOffset ?? (await this.reader.size())
    this.schedule(0)
  }

  getCurrentOffset(): number {
    return this.acc.offset
  }

  private schedule(ms: number): void {
    if (this.stopped) return
    this.timer = this.scheduler.delay(() => {
      void this.tick()
    }, ms)
  }

  async tick(): Promise<void> {
    if (this.stopped) return
    try {
      let size: number
      try {
        size = await this.reader.size()
      } catch {
        return
      }
      // Recheck stopped after await: stop() may run during the await and otherwise data would be re-emitted.
      if (this.stopped) return
      if (size < this.acc.offset) {
        this.acc = { offset: size, lineBuf: '', lastEntry: undefined, state: 'idle' }
        this.decoder = new TextDecoder()
        this.sink.onReset?.()
      } else if (size > this.acc.offset) {
        let read: { bytes: Uint8Array; bytesRead: number }
        try {
          read = await this.reader.read(this.acc.offset, size - this.acc.offset)
        } catch {
          return
        }
        if (this.stopped) return
        this.acc.offset += read.bytesRead
        // Stream decoding preserves incomplete multibyte characters across read boundaries.
        const text = this.decoder.decode(read.bytes, { stream: true })
        const { entries, stateChanged } = consumeChunk(this.acc, text)
        if (entries.length) await this.sink.onLines(entries)
        if (stateChanged) this.sink.onState(this.acc.state)
      }
    } finally {
      // Schedule from finally so a throwing sink callback cannot silently kill the follower.
      this.schedule(this.sink.intervalMs(this.acc.state))
    }
  }

  stop(): void {
    this.stopped = true
    if (this.timer !== null) this.scheduler.cancel(this.timer)
    this.timer = null
  }
}

/** FollowReader for a real JSONL file: stat for size and handle.read for byte ranges. */
export function createFileFollowReader(filePath: string): FollowReader {
  return {
    size: async () => {
      const stats = await stat(filePath)
      return stats.size
    },
    read: async (offset, length) => {
      const handle = await open(filePath, 'r')
      try {
        const buffer = Buffer.alloc(length)
        const { bytesRead } = await handle.read(buffer, 0, length, offset)
        return { bytes: buffer.subarray(0, bytesRead), bytesRead }
      } finally {
        await handle.close()
      }
    },
  }
}
