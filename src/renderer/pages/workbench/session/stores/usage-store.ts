import { createStore } from 'zustand/vanilla'

import type { ClaudeContextUsageSnapshot, ClaudeJsonLine } from '@/shared/rpc'

/** Per-request prompt token accounting from an SDK result message's `usage`. */
export type TurnTokenUsage = {
  input_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export type UsageState = {
  /** Latest real context-window snapshot, sampled while a query was alive. */
  snapshot: ClaudeContextUsageSnapshot | null
  /** An on-demand idle sample is in flight (shown as a spinner in the composer). */
  isSampling: boolean
  turnCount: number
  sumInputTokens: number
  sumCacheReadTokens: number
  sumCacheWriteTokens: number
}

export function createUsageStore() {
  return createStore<UsageState>(initialUsageState)
}

export function initialUsageState(): UsageState {
  return {
    snapshot: null,
    isSampling: false,
    turnCount: 0,
    sumInputTokens: 0,
    sumCacheReadTokens: 0,
    sumCacheWriteTokens: 0,
  }
}

export function recordResultUsage(
  state: UsageState,
  usage: TurnTokenUsage | undefined,
): UsageState {
  const input = usage?.input_tokens ?? 0
  const cacheRead = usage?.cache_read_input_tokens ?? 0
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0

  return {
    ...state,
    turnCount: state.turnCount + 1,
    sumInputTokens: state.sumInputTokens + input,
    sumCacheReadTokens: state.sumCacheReadTokens + cacheRead,
    sumCacheWriteTokens: state.sumCacheWriteTokens + cacheWrite,
  }
}

/**
 * Average share of prompt tokens served from cache across recorded turns.
 * Cache-write tokens count as misses (they were billed as fresh input), so
 * the denominator is input + cache read + cache write. Returns null before
 * any turn reported a non-zero denominator (e.g. providers that never
 * report cache fields) so the UI can show "—" instead of a fake 0%.
 */
export function averageCacheHitRate(state: UsageState): number | null {
  const total = state.sumInputTokens + state.sumCacheReadTokens + state.sumCacheWriteTokens
  if (total <= 0) return null
  return state.sumCacheReadTokens / total
}

/**
 * A user-typed prompt entry (not a tool result, meta marker, or sidechain) —
 * the transcript boundary that starts a new turn. Tool results are recorded as
 * user entries too, so pure tool-result entries must not split a turn.
 */
function isUserPromptEntry(entry: ClaudeJsonLine) {
  if (entry.type !== 'user' || entry.isMeta === true || entry.isSidechain === true) return false
  const content = entry.message?.content
  if (typeof content === 'string') return true
  if (Array.isArray(content)) {
    return !content.every((part) => part.type === 'tool_result')
  }
  return false
}

/**
 * Rebuild the turn counters from persisted transcript entries so a reopened
 * session starts from its full history, matching the live path's per-turn
 * semantics: one counted turn per user prompt, summing that turn's main-chain
 * assistant rounds. Assistant entries repeat per streamed content block
 * sharing one message id, so usage counts once per id; sidechain (subagent)
 * entries are excluded.
 */
export function backfillUsageFromHistory(
  entries: ReadonlyArray<ClaudeJsonLine>,
): Pick<UsageState, 'turnCount' | 'sumInputTokens' | 'sumCacheReadTokens' | 'sumCacheWriteTokens'> {
  let turnCount = 0
  let sumInputTokens = 0
  let sumCacheReadTokens = 0
  let sumCacheWriteTokens = 0
  const seenMessageIds = new Set<string>()
  let hasCountedCurrentTurn = false

  for (const entry of entries) {
    if (isUserPromptEntry(entry)) {
      hasCountedCurrentTurn = false
      continue
    }
    if (entry.type !== 'assistant' || entry.isSidechain === true) continue
    const message = entry.message as { id?: string; usage?: TurnTokenUsage } | undefined
    const usage = message?.usage
    if (!usage) continue
    const id = message?.id
    if (id) {
      if (seenMessageIds.has(id)) continue
      seenMessageIds.add(id)
    }
    if (!hasCountedCurrentTurn) {
      turnCount += 1
      hasCountedCurrentTurn = true
    }
    sumInputTokens += usage.input_tokens ?? 0
    sumCacheReadTokens += usage.cache_read_input_tokens ?? 0
    sumCacheWriteTokens += usage.cache_creation_input_tokens ?? 0
  }

  return { turnCount, sumInputTokens, sumCacheReadTokens, sumCacheWriteTokens }
}
