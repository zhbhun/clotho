import { createStore } from 'zustand/vanilla'

import type { ClaudeMessage } from '../services/message'
import type { SessionTool, TurnFailure } from '../session-types'

export type ConversationState = {
  messageIds: string[]
  messages: Record<string, ClaudeMessage>
  toolIds: string[]
  tools: Record<string, SessionTool>
  sentTurnIds: Set<string>
  interruptedTurnIds: Set<string>
  interruptedTurnDurations: Record<string, number>
  turnFailures: Record<string, TurnFailure>
  expandedTurns: Record<string, boolean>
  replaceMessages: (messages: ClaudeMessage[]) => void
  markSent: (turnId: string) => void
  replaceSentTurn: (optimisticTurnId: string, turnId: string) => void
  removeSent: (turnId: string) => void
  markStopped: (turnId: string, elapsed: number) => void
  /** A resumed turn streams again: drop the stored stopped marker. */
  clearStopped: (turnId: string) => void
  markFailed: (turnId: string, failure: TurnFailure) => void
  toggleTurn: (turnId: string) => void
  reset: () => void
}

export function indexedMessages(messages: ClaudeMessage[]) {
  const messageIds: string[] = []
  const messageMap: Record<string, ClaudeMessage> = {}
  const toolIds: string[] = []
  const tools: Record<string, SessionTool> = {}

  for (const message of messages) {
    messageIds.push(message.id)
    messageMap[message.id] = message
    for (const [index, block] of (message.blocks ?? []).entries()) {
      if (!block.toolUseId && !block.type.startsWith('tool_')) continue
      const id = block.toolUseId ?? `${message.id}:${index}`
      if (!tools[id]) toolIds.push(id)
      tools[id] = { ...tools[id], ...block, id, messageId: message.id }
    }
  }

  return { messageIds, messages: messageMap, toolIds, tools }
}

export function selectConversationMessages(
  state: Pick<ConversationState, 'messageIds' | 'messages'>,
) {
  return state.messageIds.flatMap((id) => (state.messages[id] ? [state.messages[id]] : []))
}

function emptyConversationState() {
  return {
    messageIds: [] as string[],
    messages: {} as Record<string, ClaudeMessage>,
    toolIds: [] as string[],
    tools: {} as Record<string, SessionTool>,
    sentTurnIds: new Set<string>(),
    interruptedTurnIds: new Set<string>(),
    interruptedTurnDurations: {} as Record<string, number>,
    turnFailures: {} as Record<string, TurnFailure>,
    expandedTurns: {} as Record<string, boolean>,
  }
}

export function createConversationStore() {
  return createStore<ConversationState>((set) => ({
    ...emptyConversationState(),
    replaceMessages: (messages) => set(indexedMessages(messages)),
    markSent: (turnId) =>
      set((state) => {
        if (state.sentTurnIds.has(turnId)) return state
        return { sentTurnIds: new Set(state.sentTurnIds).add(turnId) }
      }),
    replaceSentTurn: (optimisticTurnId, turnId) =>
      set((state) => {
        const sentTurnIds = new Set(state.sentTurnIds)
        sentTurnIds.delete(optimisticTurnId)
        sentTurnIds.add(turnId)
        return { sentTurnIds }
      }),
    removeSent: (turnId) =>
      set((state) => {
        if (!state.sentTurnIds.has(turnId)) return state
        const sentTurnIds = new Set(state.sentTurnIds)
        sentTurnIds.delete(turnId)
        return { sentTurnIds }
      }),
    markStopped: (turnId, elapsed) =>
      set((state) => ({
        interruptedTurnIds: new Set(state.interruptedTurnIds).add(turnId),
        interruptedTurnDurations: {
          ...state.interruptedTurnDurations,
          [turnId]: elapsed,
        },
      })),
    clearStopped: (turnId) =>
      set((state) => {
        if (!state.interruptedTurnIds.has(turnId)) return state
        const interruptedTurnIds = new Set(state.interruptedTurnIds)
        interruptedTurnIds.delete(turnId)
        const interruptedTurnDurations = { ...state.interruptedTurnDurations }
        delete interruptedTurnDurations[turnId]
        return { interruptedTurnIds, interruptedTurnDurations }
      }),
    markFailed: (turnId, failure) =>
      set((state) => ({
        turnFailures: { ...state.turnFailures, [turnId]: failure },
      })),
    toggleTurn: (turnId) =>
      set((state) => ({
        expandedTurns: { ...state.expandedTurns, [turnId]: !state.expandedTurns[turnId] },
      })),
    reset: () => set(emptyConversationState()),
  }))
}
