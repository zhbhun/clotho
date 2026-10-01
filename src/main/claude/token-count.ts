import { encode } from 'gpt-tokenizer'

/**
 * Local /v1/messages/count_tokens implementation. Provider-side count_tokens
 * endpoints are unreliable — the zhipu endpoint silently drops every tool
 * definition when the request carries a tool named ToolSearch, and 502s on
 * large payloads — so the proxy answers from its own tokenizer instead. The
 * o200k encoding is an approximation of the serving tokenizer (±10-20%); the
 * CLI still anchors the context total on the real last-request usage, so only
 * the per-category split is approximate.
 */

type TextSink = { push: (text: unknown) => void }

function collectBlock(sink: TextSink, block: unknown): void {
  if (typeof block === 'string') {
    sink.push(block)
    return
  }
  if (!block || typeof block !== 'object') return
  const record = block as Record<string, unknown>
  switch (record.type) {
    case 'text':
      sink.push(record.text)
      return
    case 'tool_use':
      // The name and arguments together are what the model must read to call.
      sink.push(record.name)
      sink.push(
        typeof record.input === 'string' ? record.input : JSON.stringify(record.input ?? null),
      )
      return
    case 'tool_result':
      collectContent(sink, record.content)
      return
    default:
    // Images and other binary blocks carry no countable text.
  }
}

function collectContent(sink: TextSink, content: unknown): void {
  if (typeof content === 'string') {
    sink.push(content)
    return
  }
  if (Array.isArray(content)) {
    for (const block of content) collectBlock(sink, block)
  }
}

function collectMessage(sink: TextSink, message: unknown): void {
  if (!message || typeof message !== 'object') return
  const record = message as Record<string, unknown>
  collectContent(sink, record.content)
}

function collectTool(sink: TextSink, tool: unknown): void {
  if (!tool || typeof tool !== 'object') return
  const record = tool as Record<string, unknown>
  sink.push(record.name)
  sink.push(record.description)
  if (record.input_schema !== undefined) sink.push(JSON.stringify(record.input_schema))
  else if (record.parameters !== undefined) sink.push(JSON.stringify(record.parameters))
}

function collectToolChoice(sink: TextSink, toolChoice: unknown): void {
  if (typeof toolChoice === 'string') sink.push(toolChoice)
  else if (toolChoice && typeof toolChoice === 'object') sink.push(JSON.stringify(toolChoice))
}

/**
 * Counts the prompt tokens of an Anthropic-format messages request body.
 * Mirrors the segment collection of CLIProxyAPI's CountOpenAIChatTokens:
 * every text the model can read is gathered, joined, and encoded once.
 */
export function countPromptTokens(body: Record<string, unknown>): number {
  const segments: string[] = []
  const sink: TextSink = {
    push: (text) => {
      if (typeof text !== 'string') return
      if (text.length > 0) segments.push(text)
    },
  }

  const system = body.system
  if (typeof system === 'string') sink.push(system)
  else if (Array.isArray(system)) collectContent(sink, system)

  if (Array.isArray(body.messages))
    for (const message of body.messages) collectMessage(sink, message)
  if (Array.isArray(body.tools)) for (const tool of body.tools) collectTool(sink, tool)
  if (Array.isArray(body.functions)) for (const fn of body.functions) collectTool(sink, fn)
  collectToolChoice(sink, body.tool_choice)
  if (body.response_format !== undefined) sink.push(JSON.stringify(body.response_format))
  if (typeof body.input === 'string') sink.push(body.input)
  if (typeof body.prompt === 'string') sink.push(body.prompt)

  if (segments.length === 0) return 1
  try {
    return Math.max(1, encode(segments.join('\n')).length)
  } catch {
    // A tokenizer failure must not fail the request the CLI depends on for
    // its context report; the four-characters-per-token heuristic is the
    // long-standing fallback.
    return Math.max(1, Math.ceil(segments.join('\n').length / 4))
  }
}
