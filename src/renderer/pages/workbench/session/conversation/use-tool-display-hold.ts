import { useEffect, useRef, useState } from 'react'

import type { ConversationTimelineItem } from './types'

/** Minimum time a tool call stays displayed on the streaming tail. */
export const TOOL_DISPLAY_HOLD_MS = 500

const EMPTY_HELD_TOOL_IDS: ReadonlySet<string> = new Set()

function scanHeldTools(items: ConversationTimelineItem[], seenAt: Map<string, number>) {
  const now = Date.now()
  const held = new Set<string>()
  let nextExpiry: number | undefined

  for (const item of items) {
    if (item.kind !== 'tool' || !item.use?.toolUseId) continue
    const toolUseId = item.use.toolUseId
    let seenAtMs = seenAt.get(toolUseId)
    if (seenAtMs === undefined) {
      seenAtMs = now
      seenAt.set(toolUseId, seenAtMs)
    }
    const expiry = seenAtMs + TOOL_DISPLAY_HOLD_MS
    if (expiry > now) {
      held.add(toolUseId)
      // Release on the earliest expiry and re-arm for whatever is still held.
      nextExpiry = nextExpiry === undefined ? expiry : Math.min(nextExpiry, expiry)
    }
  }

  return { held, nextExpiry }
}

function sameToolIds(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false
  for (const id of left) if (!right.has(id)) return false
  return true
}

/**
 * Tool calls still inside their display-hold window, keyed by tool use id.
 *
 * Local tools (Edit, Read, TaskUpdate, …) settle in tens of milliseconds, so
 * the run header would flash the tool name for a frame and snap back to
 * Thinking. Each call's first render starts its hold window; while it lasts,
 * the run header and the trailing-row logic keep displaying that call — a
 * newer call simply takes over as the displayed one, so intermediate calls
 * never flash a Thinking placeholder between them. Once the window elapses
 * with no newer call, the Thinking placeholder returns.
 */
export function useToolDisplayHold(
  items: ConversationTimelineItem[],
  isEnabled: boolean,
): ReadonlySet<string> {
  const [heldToolUseIds, setHeldToolUseIds] = useState<ReadonlySet<string>>(EMPTY_HELD_TOOL_IDS)
  const seenAtRef = useRef(new Map<string, number>())

  useEffect(() => {
    if (!isEnabled) {
      seenAtRef.current.clear()
      setHeldToolUseIds((current) => (current.size ? EMPTY_HELD_TOOL_IDS : current))
      return
    }

    // Re-arm inside the callback so a still-held call keeps its display after
    // an earlier one in the same burst expires.
    let timer: number | undefined
    const releaseDue = () => {
      const { held, nextExpiry } = scanHeldTools(items, seenAtRef.current)
      setHeldToolUseIds((current) => (sameToolIds(current, held) ? current : held))
      if (nextExpiry !== undefined) {
        timer = window.setTimeout(releaseDue, Math.max(0, nextExpiry - Date.now()))
      }
    }

    const { held, nextExpiry } = scanHeldTools(items, seenAtRef.current)
    setHeldToolUseIds((current) => (sameToolIds(current, held) ? current : held))
    if (nextExpiry !== undefined) {
      timer = window.setTimeout(releaseDue, Math.max(0, nextExpiry - Date.now()))
    }
    return () => window.clearTimeout(timer)
  }, [isEnabled, items])

  return heldToolUseIds
}
