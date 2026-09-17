import path from 'node:path'

import type { ClaudeJsonLine } from '@/shared/rpc'

import { projectPathForId } from './projects'
import {
  type FollowScheduler,
  type FollowSink,
  type FollowState,
  SessionFollower,
  createFileFollowReader,
} from './session-follower'
import { projectDirNameFromPath } from './sessions'
import { enrichTaskNotification } from './task-notification'
import { assertPathSegment, claudeDir } from './workspace'

export type SessionFollowEvents = {
  onUpdate: (sessionId: string, lines: ClaudeJsonLine[]) => void
  onState: (sessionId: string, state: FollowState) => void
  onReset: (sessionId: string) => void
}

const PROCESSING_INTERVAL_MS = 1000
const IDLE_INTERVAL_MS = 3000

function sessionJsonlPath(projectDirName: string, sessionId: string) {
  assertPathSegment(projectDirName, 'project id')
  assertPathSegment(sessionId, 'session id')
  return path.join(claudeDir(), 'projects', projectDirName, `${sessionId}.jsonl`)
}

/**
 * Manage multiple SessionFollowers: create and stop them by sessionId, then forward
 * parsed callbacks as events tagged with sessionId. Polling frequency follows state.
 */
export function createSessionFollowManager(events: SessionFollowEvents) {
  const scheduler: FollowScheduler = {
    delay: (fn, ms) => setTimeout(fn, ms),
    cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
  const followers = new Map<string, SessionFollower>()
  const offsets = new Map<string, number>()

  async function start(projectId: string, sessionId: string) {
    if (followers.has(sessionId)) return
    const initialOffset = offsets.get(sessionId)
    const projectDirName = projectDirNameFromPath(await projectPathForId(projectId))
    const reader = createFileFollowReader(sessionJsonlPath(projectDirName, sessionId))
    const sink: FollowSink = {
      intervalMs: (state) => (state === 'processing' ? PROCESSING_INTERVAL_MS : IDLE_INTERVAL_MS),
      onLines: async (lines) => {
        events.onUpdate(sessionId, await Promise.all(lines.map(enrichTaskNotification)))
      },
      onState: (state) => events.onState(sessionId, state),
      onReset: () => {
        offsets.delete(sessionId)
        events.onReset(sessionId)
      },
    }
    const follower = new SessionFollower(reader, scheduler, sink)
    followers.set(sessionId, follower)
    try {
      await follower.start(initialOffset)
    } catch {
      // If the file is missing or unreadable, clean up the registration and do not persist the offset.
      if (followers.get(sessionId) === follower) followers.delete(sessionId)
    }
  }

  function stop(sessionId: string) {
    const follower = followers.get(sessionId)
    if (!follower) return
    offsets.set(sessionId, follower.getCurrentOffset())
    follower.stop()
    followers.delete(sessionId)
  }

  /** Clotho already updated the view for this rewrite; don't replay it as an external reset. */
  function reset(sessionId: string) {
    stop(sessionId)
    offsets.delete(sessionId)
  }

  function stopAll() {
    for (const follower of followers.values()) follower.stop()
    followers.clear()
    offsets.clear()
  }

  return { start, stop, reset, stopAll }
}
