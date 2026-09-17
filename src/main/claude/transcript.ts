import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { ClaudeDropTrailingTurnParams, ClaudeDropTrailingTurnResult } from '@/shared/rpc'

import { getLogger } from '../logging/runtime'
import { projectDirNameFromPath } from './sessions'
import { claudeDir, projectPathForId } from './workspace'

const logger = getLogger('query')

const INTERRUPTION_MARKERS = new Set([
  '[Request interrupted by user]',
  '[Request interrupted by user for tool use]',
])

type TranscriptEntry = {
  type?: unknown
  uuid?: unknown
  isMeta?: unknown
  message?: {
    model?: unknown
    content?: unknown
  }
}

function assertPathSegment(value: string, label: string) {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
}

function entryText(entry: TranscriptEntry): string {
  const content = entry.message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((part) =>
      part &&
      typeof part === 'object' &&
      (part as { type?: unknown; text?: unknown }).type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string'
        ? [(part as { text: string }).text]
        : [],
    )
    .join('\n')
    .trim()
}

function isUserPromptEntry(entry: TranscriptEntry): boolean {
  return (
    entry.type === 'user' && entry.isMeta !== true && !INTERRUPTION_MARKERS.has(entryText(entry))
  )
}

/** Conversation-carrying entry: a real user prompt or a non-synthetic assistant reply. */
function isConversationalEntry(entry: TranscriptEntry): boolean {
  if (isUserPromptEntry(entry)) return true
  return entry.type === 'assistant' && entry.message?.model !== '<synthetic>'
}

function parseEntry(line: string): TranscriptEntry | null {
  try {
    const value = JSON.parse(line) as TranscriptEntry
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

/** Same directory convention as loadRawSessionEntries: the transcript folder is keyed by the munged project path. */
async function transcriptProjectDir(projectId: string): Promise<string> {
  return path.join(
    claudeDir(),
    'projects',
    projectDirNameFromPath(await projectPathForId(projectId)),
  )
}

/**
 * Physically remove a recalled trailing turn from a session transcript: every
 * line from the cancelled user message onward is dropped, so the next send
 * resumes from the last complete assistant reply. When nothing conversational
 * remains (the turn was the first), the whole session file is deleted instead
 * and the caller must start a fresh session.
 */
export async function dropTrailingTurn({
  projectId,
  sessionId,
  userMessageUuid,
}: ClaudeDropTrailingTurnParams): Promise<ClaudeDropTrailingTurnResult> {
  assertPathSegment(projectId, 'project id')
  if (sessionId) assertPathSegment(sessionId, 'session id')

  const projectDir = await transcriptProjectDir(projectId)
  const candidates = sessionId
    ? [path.join(projectDir, `${sessionId}.jsonl`)]
    : (await fs.readdir(projectDir).catch(() => []))
        .filter((name) => name.endsWith('.jsonl'))
        .map((name) => path.join(projectDir, name))

  for (const transcriptPath of candidates) {
    const content = await fs.readFile(transcriptPath, 'utf8').catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
    if (content === null) {
      if (sessionId) return { dropped: false, removedSession: true }
      continue
    }

    const lines = content.split('\n')
    if (lines.at(-1) === '') lines.pop()
    const entries = lines.map(parseEntry)

    const targetIndex = lines.findIndex((_, index) => entries[index]?.uuid === userMessageUuid)
    if (targetIndex < 0) {
      // A very early cancellation can leave only title/init bookkeeping.
      // Remove that file too, so the reserved ID can start a fresh query.
      const isEmptySession = lines.every((line, index) => {
        const entry = entries[index]
        return !line.trim() || (entry !== null && !isConversationalEntry(entry))
      })
      if (sessionId && isEmptySession) {
        await fs.rm(transcriptPath, { force: true })
        return { dropped: true, removedSession: true }
      }
      continue
    }
    if (entries[targetIndex]?.type !== 'user') {
      logger.info('transcript.drop_refused', 'The matched transcript entry is not a user message', {
        context: { userMessageUuid },
      })
      return { dropped: false, removedSession: false }
    }

    // A cancellation marker closes the pending turn. Any assistant bookkeeping
    // written after it belongs to that turn and is removed with the recalled
    // prompt; only a later real user prompt means another client continued.
    const hasLaterUserPrompt = entries
      .slice(targetIndex + 1)
      .some((entry) => entry !== null && isUserPromptEntry(entry))
    if (hasLaterUserPrompt) {
      logger.info('transcript.drop_refused', 'The transcript has newer conversation', {
        context: { userMessageUuid },
      })
      return { dropped: false, removedSession: false }
    }

    const keptEntries = entries.slice(0, targetIndex)
    if (!keptEntries.some((entry) => entry !== null && isConversationalEntry(entry))) {
      await fs.rm(transcriptPath, { force: true })
      logger.info('transcript.session_removed', 'An empty-after-drop session file was removed', {
        context: { userMessageUuid },
      })
      return { dropped: true, removedSession: true }
    }

    await fs.writeFile(transcriptPath, `${lines.slice(0, targetIndex).join('\n')}\n`, 'utf8')
    logger.info('transcript.turn_dropped', 'A recalled trailing turn was removed', {
      context: { userMessageUuid },
    })
    return { dropped: true, removedSession: false }
  }

  return { dropped: false, removedSession: false }
}
