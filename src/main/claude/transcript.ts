import { promises as fs } from 'node:fs'
import path from 'node:path'

import type {
  ClaudeDropTrailingTurnParams,
  ClaudeDropTrailingTurnResult,
  ClaudePurgeDeadPairsParams,
  ClaudePurgeDeadPairsResult,
} from '@/shared/rpc'

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
  isSidechain?: unknown
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
  allowLaterConversation = false,
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
    // prompt; only a later real user prompt means another client continued —
    // unless the caller is a historical edit, which discards later turns on
    // purpose (the resend restarts from the edited message).
    const hasLaterUserPrompt = entries
      .slice(targetIndex + 1)
      .some((entry) => entry !== null && isUserPromptEntry(entry))
    if (hasLaterUserPrompt && !allowLaterConversation) {
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

/**
 * Remove every dead turn — a user prompt that never got an assistant reply
 * (its run ends at the next user prompt and contains the synthesized
 * "[Request interrupted by user]" marker). Deleted mid-history turns resume
 * cleanly without parentUuid re-linking (verified against the CLI), so the
 * whole run including its bookkeeping entries is dropped. When nothing
 * conversational remains, the session file is removed like dropTrailingTurn.
 */
export async function purgeDeadPairs({
  projectId,
  sessionId,
}: ClaudePurgeDeadPairsParams): Promise<ClaudePurgeDeadPairsResult> {
  assertPathSegment(projectId, 'project id')
  assertPathSegment(sessionId, 'session id')

  const transcriptPath = path.join(await transcriptProjectDir(projectId), `${sessionId}.jsonl`)
  const content = await fs.readFile(transcriptPath, 'utf8').catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  })
  if (content === null) return { removed: 0 }

  const lines = content.split('\n')
  if (lines.at(-1) === '') lines.pop()
  const entries = lines.map(parseEntry)

  const removedIndexes = new Set<number>()
  let removed = 0
  const isRootUserPrompt = (entry: TranscriptEntry | null) =>
    entry !== null && entry.isSidechain !== true && isUserPromptEntry(entry)
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    if (!isRootUserPrompt(entry)) continue
    // A turn with no assistant entry between two root user prompts produced
    // no reply (a no-response interrupt); its whole run is dead. A real reply
    // — or a streamed tool_use — keeps the turn.
    let end = index + 1
    let hasReply = false
    while (end < entries.length) {
      const next = entries[end]
      if (isRootUserPrompt(next)) break
      if (next !== null && next.type === 'assistant' && next.message?.model !== '<synthetic>') {
        hasReply = true
      }
      end++
    }
    if (!hasReply) {
      removed++
      for (let i = index; i < end; i++) removedIndexes.add(i)
    }
    index = end - 1
  }

  if (!removed) return { removed: 0 }

  const keptConversational = entries.some(
    (entry, index) => !removedIndexes.has(index) && entry !== null && isConversationalEntry(entry),
  )
  if (!keptConversational) {
    await fs.rm(transcriptPath, { force: true })
    logger.info('transcript.dead_pairs_purged', 'A session with only dead turns was removed', {
      context: { sessionId, removed },
    })
    return { removed, removedSession: true }
  }

  const kept = lines.filter((_, index) => !removedIndexes.has(index))
  await fs.writeFile(transcriptPath, `${kept.join('\n')}\n`, 'utf8')
  logger.info('transcript.dead_pairs_purged', 'Dead turns were purged from the transcript', {
    context: { sessionId, removed },
  })
  return { removed, removedSession: false }
}
