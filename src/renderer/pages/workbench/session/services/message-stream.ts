import { type ClaudeContentBlock, type ClaudeMessage, claudeJsonToMessage } from './message'

/**
 * Streaming message accumulator (aligned with the target gbe / Vtt / OG projects).
 *
 * Accumulate Claude Code `--output-format stream-json` line output into messages:
 * - Mutate the current streaming content block directly for `stream_event` content_block_delta, creating the typing effect.
 * - Replace the streaming placeholder when a complete `assistant` line arrives, avoiding duplicates.
 * - Commit `user` lines, including tool_result, directly.
 * - Return false for other lines (system / result / non-JSON) so the caller can use parseClaudeLine as a fallback.
 *
 * Single source of truth: committed + streaming; getAll() supplies React state.
 */
interface StreamBlock extends ClaudeContentBlock {
  partialJson?: string
}

interface StreamDelta {
  type?: string
  text?: string
  thinking?: string
  partial_json?: string
}

interface StreamEvent {
  type?: string
  index?: number
  content_block?: { type?: string; text?: string; thinking?: string; name?: string; id?: string }
  delta?: StreamDelta
}

interface StreamEventEnvelope {
  type: 'stream_event'
  event: StreamEvent
  parent_tool_use_id?: string | null
  uuid?: string
}

export class StreamAssembler {
  private committed: ClaudeMessage[] = []
  private streaming = new Map<string, ClaudeMessage>()
  /** Transcript entries can arrive once from the live query and again from the follower replay. */
  private seenEntryUuids = new Set<string>()
  private lineIndex = 0
  private revision = 0

  reset(messages: ClaudeMessage[]) {
    this.committed = messages
    this.streaming.clear()
    this.seenEntryUuids = new Set(
      messages.flatMap((message) => (message.uuid ? [message.uuid] : [])),
    )
    this.revision += 1
  }

  commit(message: ClaudeMessage) {
    this.committed = [...this.committed, message]
    this.streaming.delete(this.messageKey(message))
    if (message.uuid) this.seenEntryUuids.add(message.uuid)
    this.revision += 1
  }

  replaceCommitted(messageId: string, message: ClaudeMessage) {
    const index = this.committed.findIndex((item) => item.id === messageId)
    if (index < 0) return false
    this.committed = this.committed.map((item, itemIndex) => (itemIndex === index ? message : item))
    if (message.uuid) this.seenEntryUuids.add(message.uuid)
    this.revision += 1
    return true
  }

  getRevision() {
    return this.revision
  }

  getAll(): ClaudeMessage[] {
    return [...this.committed, ...this.streaming.values()]
  }

  /** Process one stdout line. True means it was handled as a structured event; false requests caller fallback. */
  processLine(line: string, receivedAt = new Date().toISOString()): boolean {
    this.lineIndex++
    let json: unknown
    try {
      json = JSON.parse(line)
    } catch {
      return false
    }

    const type = (json as { type?: string })?.type
    if (type === 'stream_event') {
      const envelope = json as StreamEventEnvelope
      this.handleStreamEvent({ ...envelope, event: envelope.event ?? {} }, receivedAt)
      this.revision += 1
      return true
    }
    if (type === 'assistant') {
      const uuid = (json as { uuid?: unknown }).uuid
      if (typeof uuid === 'string' && this.seenEntryUuids.has(uuid)) return true
      const message = claudeJsonToMessage(
        {
          ...(json as Parameters<typeof claudeJsonToMessage>[0]),
          timestamp: (json as Parameters<typeof claudeJsonToMessage>[0]).timestamp ?? receivedAt,
        },
        this.lineIndex,
      )
      // A complete assistant line replaces only the streaming placeholder with the same UUID/parent tool.
      this.streaming.delete(this.messageKey(message ?? undefined))
      if (message) {
        this.committed = [...this.committed, message]
        if (message.uuid) this.seenEntryUuids.add(message.uuid)
        this.revision += 1
      }
      return true
    }
    if (type === 'user') {
      const uuid = (json as { uuid?: unknown }).uuid
      if (typeof uuid === 'string' && this.seenEntryUuids.has(uuid)) return true
      const message = claudeJsonToMessage(
        json as Parameters<typeof claudeJsonToMessage>[0],
        this.lineIndex,
      )
      if (message) {
        this.committed = [...this.committed, message]
        if (message.uuid) this.seenEntryUuids.add(message.uuid)
        this.revision += 1
      }
      return true
    }
    return false
  }

  private envelopeKey(envelope: StreamEventEnvelope) {
    return envelope.uuid ?? `parent:${envelope.parent_tool_use_id ?? 'root'}`
  }

  private messageKey(message?: ClaudeMessage) {
    return message?.uuid ?? `parent:${message?.parentToolUseId ?? 'root'}`
  }

  private handleStreamEvent(envelope: StreamEventEnvelope, receivedAt: string) {
    const event = envelope.event
    const key = this.envelopeKey(envelope)
    switch (event.type) {
      case 'message_start':
        this.streaming.set(key, {
          id: `stream-${this.lineIndex}`,
          uuid: envelope.uuid,
          role: 'assistant',
          content: '',
          blocks: [],
          timestamp: receivedAt,
          parentToolUseId: envelope.parent_tool_use_id ?? undefined,
        })
        break
      case 'content_block_start':
        this.mutateBlock(key, event, (blocks) => {
          if (event.index == null) return
          const cb = event.content_block ?? {}
          const block: StreamBlock = { type: cb.type ?? 'text' }
          if (cb.type === 'text' && cb.text) block.text = cb.text
          if (cb.type === 'thinking' && cb.thinking) block.text = cb.thinking
          if (cb.type === 'tool_use') {
            block.name = cb.name
            block.toolUseId = cb.id
            block.partialJson = ''
          }
          blocks[event.index] = block
        })
        break
      case 'content_block_delta':
        this.mutateBlock(key, event, (blocks) => {
          if (event.index == null) return
          const delta = event.delta
          if (!delta) return
          const block =
            blocks[event.index] ??
            ({ type: delta.type === 'thinking_delta' ? 'thinking' : 'text' } satisfies StreamBlock)
          blocks[event.index] = block
          if (delta.type === 'text_delta' && delta.text != null) {
            block.text = (block.text ?? '') + delta.text
          } else if (delta.type === 'thinking_delta' && delta.thinking != null) {
            block.text = (block.text ?? '') + delta.thinking
          } else if (delta.type === 'input_json_delta' && delta.partial_json != null) {
            block.partialJson = (block.partialJson ?? '') + delta.partial_json
          }
        })
        break
      case 'content_block_stop':
        this.mutateBlock(key, event, (blocks) => {
          if (event.index == null) return
          const block = blocks[event.index]
          if (block?.type === 'tool_use' && block.partialJson) {
            try {
              block.input = JSON.parse(block.partialJson)
            } catch {
              // Preserve the raw fragment without blocking.
            }
            delete block.partialJson
          }
        })
        break
      case 'message_stop':
        // Keep the placeholder until a complete assistant line replaces it; otherwise getAll() displays it naturally.
        break
    }
  }

  private mutateBlock(key: string, _event: StreamEvent, fn: (blocks: StreamBlock[]) => void) {
    const streaming = this.streaming.get(key)
    if (!streaming) return
    const blocks = (streaming.blocks ?? []) as StreamBlock[]
    fn(blocks)
    streaming.blocks = blocks
    this.rebuildContent(key)
  }

  private rebuildContent(key: string) {
    const streaming = this.streaming.get(key)
    if (!streaming) return
    streaming.content = (streaming.blocks ?? [])
      .map((block) =>
        block.type === 'text' || block.type === 'thinking' ? (block.text ?? '') : '',
      )
      .filter(Boolean)
      .join('\n\n')
  }
}
