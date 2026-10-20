import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  DraftSession,
  DraftSessionIndex,
  LocalSession,
  SessionIndex,
  SessionIndexEntry,
  SessionListFlags,
} from '@/shared/session'

import { projectIdFromPath } from './claude/sessions'
import { getLogger } from './logging/runtime'

const logger = getLogger('persistence')

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const INDEX_FILE = 'index.json'
const LEGACY_INDEX_FILE = 'drafts.json'
/** Index key prefix for archive markers of claude sessions never opened in clotho. */
const MARKER_PREFIX = 'claude-'
/** How long an unarchive timestamp keeps shielding a session from the auto-archive sweep. */
const UNARCHIVED_AT_TTL_MS = 14 * 24 * 60 * 60 * 1000

function assertId(id: string) {
  // The index names double as on-disk file names, so the reserved file names
  // of the sessions directory must never be used as a session id.
  if (id === 'index' || id === 'drafts' || !ID_RE.test(id)) throw new Error('Invalid session id')
}

/**
 * Stored ids may predate the digest scheme; the path is then the source of
 * truth. Digest ids for either entry type of the path are trusted as-is so a
 * workspace conversation is not rewritten onto the plain entry.
 */
function migratedProjectId(projectId: string | null, projectPath: string | null) {
  if (!projectId || !projectPath) return projectId
  if (projectId === projectIdFromPath(projectPath)) return projectId
  if (projectId === projectIdFromPath(projectPath, true)) return projectId
  return projectIdFromPath(projectPath)
}
function validDraft(v: unknown): v is DraftSession {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const x = v as Record<string, unknown>
  return (
    typeof x.title === 'string' &&
    typeof x.createdAt === 'number' &&
    typeof x.updatedAt === 'number' &&
    (x.projectId === null || typeof x.projectId === 'string') &&
    (x.projectPath === null || typeof x.projectPath === 'string')
  )
}
function validEntry(v: unknown): v is SessionIndexEntry {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const x = v as Record<string, unknown>
  return (
    (x.projectId === null || typeof x.projectId === 'string') &&
    (x.projectPath === undefined || x.projectPath === null || typeof x.projectPath === 'string') &&
    (x.claudeSessionId === undefined ||
      x.claudeSessionId === null ||
      typeof x.claudeSessionId === 'string') &&
    (x.isDraft === undefined || typeof x.isDraft === 'boolean') &&
    (x.title === undefined || typeof x.title === 'string') &&
    (x.createdAt === undefined || typeof x.createdAt === 'number') &&
    (x.updatedAt === undefined || typeof x.updatedAt === 'number') &&
    (x.archived === undefined || typeof x.archived === 'boolean') &&
    (x.archivedAt === undefined || typeof x.archivedAt === 'number') &&
    (x.unarchivedAt === undefined || typeof x.unarchivedAt === 'number') &&
    (x.pinnedAt === undefined || typeof x.pinnedAt === 'number') &&
    (x.unread === undefined || x.unread === 'success' || x.unread === 'error') &&
    (x.unreadAt === undefined || typeof x.unreadAt === 'number')
  )
}
function validSession(v: unknown): v is LocalSession {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const x = v as Record<string, any>
  const i = x.input
  return (
    (x.id === undefined || typeof x.id === 'string') &&
    (x.projectId === null || typeof x.projectId === 'string') &&
    (x.projectPath === null || typeof x.projectPath === 'string') &&
    (x.claudeSessionId === null || typeof x.claudeSessionId === 'string') &&
    i &&
    typeof i.prompt === 'string' &&
    Array.isArray(i.attachments) &&
    (i.model === null || typeof i.model === 'string') &&
    typeof i.permissionMode === 'string' &&
    (i.agent === null || typeof i.agent === 'string') &&
    (i.recalledFromMessage === undefined || typeof i.recalledFromMessage === 'string')
  )
}

export interface SessionStorage {
  sessionListDrafts(): Promise<DraftSessionIndex>
  sessionRead(params: { sessionId: string }): Promise<LocalSession | null>
  sessionWrite(params: {
    sessionId: string
    data: LocalSession
    draft?: DraftSession
  }): Promise<void>
  sessionUpdateDraft(params: { sessionId: string; draft: DraftSession }): Promise<void>
  sessionCompleteDraft(params: { sessionId: string }): Promise<void>
  /** Record (or update) which project entry a conversation and its claude session belong to. */
  sessionBindOwner(params: {
    sessionId: string
    projectId: string | null
    claudeSessionId: string
  }): Promise<void>
  /** claudeSessionId → owning project-entry id (null marks home-mode conversations). */
  sessionOwnership(): Promise<Record<string, string | null>>
  /** Archive or unarchive sessions by claude session id, creating marker entries when unbound. */
  sessionSetArchived(params: {
    sessions: Array<{ projectId: string; sessionId: string }>
    archived: boolean
  }): Promise<void>
  /** Archive marks by claude session id, merged into listed sessions. */
  sessionListFlags(): Promise<Record<string, SessionListFlags>>
  /** Pin or unpin sessions, creating marker entries when never opened in clotho. */
  sessionSetPinned(params: {
    sessions: Array<{ projectId: string | null; sessionId: string; claudeSessionId: string | null }>
    pinned: boolean
  }): Promise<void>
  /** Record or clear the unread mark of sessions that finished a run unseen. */
  sessionSetUnread(params: {
    sessions: Array<{ projectId: string | null; sessionId: string; claudeSessionId: string | null }>
    unread: 'success' | 'error' | null
  }): Promise<void>
  /** Move a project entry's session references (index and stored input files) to a new id. */
  sessionRebindProject(params: { fromProjectId: string; toProjectId: string }): Promise<void>
  sessionDelete(params: { sessionId: string }): Promise<void>
  sessionDeleteProject(params: { projectId: string }): Promise<void>
}

export function createSessionStorage(rootDir: string, homeProjectId?: string): SessionStorage {
  const dir = rootDir,
    indexPath = path.join(dir, INDEX_FILE)
  // Legacy home conversations stored a null projectId; they belong to the
  // built-in work project, so reads resolve the null onto its id.
  const resolveProjectId = (projectId: string | null) =>
    projectId === null && homeProjectId ? homeProjectId : projectId
  let queue = Promise.resolve()
  const run = <T>(fn: () => Promise<T>) => {
    const next = queue.then(fn)
    queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
  const readIndex = async (): Promise<SessionIndex> => {
    let value: unknown
    try {
      value = JSON.parse(await readFile(indexPath, 'utf8'))
    } catch (e: any) {
      if (e?.code !== 'ENOENT') {
        logger.warning('session.drafts_index_unreadable', 'Ignored an unreadable drafts index')
        return {}
      }
      // One-time migration: drafts.json entries were all drafts.
      let legacy: unknown
      try {
        legacy = JSON.parse(await readFile(path.join(dir, LEGACY_INDEX_FILE), 'utf8'))
      } catch {
        return {}
      }
      if (!legacy || Array.isArray(legacy) || typeof legacy !== 'object') return {}
      const migrated: SessionIndex = {}
      for (const [id, draft] of Object.entries(legacy)) {
        if (!validDraft(draft)) continue
        try {
          assertId(id)
        } catch {
          continue
        }
        migrated[id] = {
          ...draft,
          projectId: migratedProjectId(draft.projectId, draft.projectPath),
          isDraft: true,
        }
      }
      return migrated
    }
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      logger.warning('session.drafts_index_unreadable', 'Ignored an unreadable drafts index')
      return {}
    }
    // Skip malformed entries individually: one bad row must not hide every
    // draft, and the next write rewrites the index without them.
    const index: SessionIndex = {}
    let skipped = 0
    for (const [id, entry] of Object.entries(value)) {
      try {
        assertId(id)
      } catch {
        skipped += 1
        continue
      }
      if (!validEntry(entry) || (entry.isDraft && !validDraft(entry))) {
        skipped += 1
        continue
      }
      index[id] = {
        ...entry,
        projectId: migratedProjectId(entry.projectId, entry.projectPath ?? null),
      }
    }
    if (skipped) {
      logger.warning('session.drafts_entries_skipped', 'Skipped malformed draft index entries', {
        context: { skipped },
      })
    }
    return index
  }
  const putEntry = async (sessionId: string, entry: SessionIndexEntry) => {
    const index = await readIndex()
    index[sessionId] = entry
    await atomic(indexPath, JSON.stringify(index))
  }
  const indexByClaudeId = (index: SessionIndex) => {
    const byClaudeId = new Map<string, string[]>()
    for (const [id, entry] of Object.entries(index)) {
      if (!entry.claudeSessionId) continue
      const ids = byClaudeId.get(entry.claudeSessionId)
      if (ids) ids.push(id)
      else byClaudeId.set(entry.claudeSessionId, [id])
    }
    return byClaudeId
  }
  const withPinned = (
    entry: SessionIndexEntry,
    pinned: boolean,
    now: number,
  ): SessionIndexEntry => {
    if (pinned) {
      return entry.pinnedAt !== undefined ? entry : { ...entry, pinnedAt: now }
    }
    if (entry.pinnedAt === undefined) return entry
    const next = { ...entry }
    delete next.pinnedAt
    return next
  }
  const withUnread = (
    entry: SessionIndexEntry,
    unread: 'success' | 'error' | null,
    now: number,
  ): SessionIndexEntry => {
    if (unread) {
      if (entry.unread === unread && entry.unreadAt !== undefined) return entry
      return { ...entry, unread, unreadAt: now }
    }
    if (entry.unread === undefined && entry.unreadAt === undefined) return entry
    const next = { ...entry }
    delete next.unread
    delete next.unreadAt
    return next
  }
  /** A claude-id marker exists only to carry list marks; drop it once bare. */
  const pruneMarker = (entry: SessionIndexEntry, markerId: string) => {
    if (!markerId.startsWith(MARKER_PREFIX)) return entry
    if (
      entry.archived ||
      entry.unarchivedAt !== undefined ||
      entry.pinnedAt !== undefined ||
      entry.unread !== undefined
    ) {
      return entry
    }
    return undefined
  }
  /**
   * List-state fields of an index entry; every path that rebuilds an existing
   * entry (draft completion, ownership binding, draft rewrite) must spread
   * them back in or an archived, pinned, or unread session silently loses
   * its mark.
   */
  const listFlagFieldsOf = (entry: SessionIndexEntry | undefined) =>
    ({
      ...(entry?.archived ? { archived: true } : {}),
      ...(entry?.archivedAt !== undefined ? { archivedAt: entry.archivedAt } : {}),
      ...(entry?.unarchivedAt !== undefined ? { unarchivedAt: entry.unarchivedAt } : {}),
      ...(entry?.pinnedAt !== undefined ? { pinnedAt: entry.pinnedAt } : {}),
      ...(entry?.unread !== undefined ? { unread: entry.unread } : {}),
      ...(entry?.unreadAt !== undefined ? { unreadAt: entry.unreadAt } : {}),
    }) as Pick<
      SessionIndexEntry,
      'archived' | 'archivedAt' | 'unarchivedAt' | 'pinnedAt' | 'unread' | 'unreadAt'
    >
  /** A started conversation keeps its ownership and drops the draft bookkeeping. */
  const startedEntry = (entry: SessionIndexEntry | undefined): SessionIndexEntry => ({
    projectId: entry?.projectId ?? null,
    ...(entry?.claudeSessionId ? { claudeSessionId: entry.claudeSessionId } : {}),
    ...listFlagFieldsOf(entry),
  })
  const atomic = async (file: string, content: string) => {
    await mkdir(dir, { recursive: true })
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    await writeFile(tmp, content)
    await rename(tmp, file)
  }
  return {
    sessionListDrafts: () =>
      run(async () => {
        const index = await readIndex()
        const drafts: DraftSessionIndex = {}
        for (const [id, entry] of Object.entries(index)) {
          if (!entry.isDraft) continue
          drafts[id] = {
            title: entry.title ?? '',
            createdAt: entry.createdAt ?? 0,
            updatedAt: entry.updatedAt ?? 0,
            projectId: resolveProjectId(entry.projectId),
            projectPath: entry.projectPath ?? null,
            ...(entry.pinnedAt !== undefined ? { pinnedAt: entry.pinnedAt } : {}),
          }
        }
        return drafts
      }),
    sessionRead: ({ sessionId }) =>
      run(async () => {
        assertId(sessionId)
        const file = path.join(dir, `${sessionId}.json`)
        let text: string
        try {
          text = await readFile(file, 'utf8')
        } catch (e: any) {
          if (e?.code === 'ENOENT') return null
          throw e
        }
        try {
          const value = JSON.parse(text)
          if (validSession(value)) {
            return {
              ...value,
              projectId: resolveProjectId(migratedProjectId(value.projectId, value.projectPath)),
            }
          }
        } catch {
          // fall through to the quarantine path below
        }
        logger.warning('session.file_malformed', 'Ignored a malformed session file', {
          context: { sessionId },
        })
        return null
      }),
    sessionWrite: ({ sessionId, data, draft }) =>
      run(async () => {
        assertId(sessionId)
        if (!validSession(data)) throw new Error('Malformed session data')
        if (draft && !validDraft(draft)) throw new Error('Malformed draft')
        await atomic(path.join(dir, `${sessionId}.json`), JSON.stringify(data))
        if (draft) {
          const index = await readIndex()
          const previous = index[sessionId]
          index[sessionId] = {
            ...draft,
            isDraft: true,
            ...(previous?.claudeSessionId ? { claudeSessionId: previous.claudeSessionId } : {}),
            ...listFlagFieldsOf(previous),
          }
          await atomic(indexPath, JSON.stringify(index))
        }
      }),
    sessionUpdateDraft: ({ sessionId, draft }) =>
      run(async () => {
        assertId(sessionId)
        if (!validDraft(draft)) throw new Error('Malformed draft')
        await putEntry(sessionId, { ...draft, isDraft: true })
      }),
    sessionCompleteDraft: ({ sessionId }) =>
      run(async () => {
        assertId(sessionId)
        const index = await readIndex()
        if (sessionId in index) await putEntry(sessionId, startedEntry(index[sessionId]))
      }),
    sessionBindOwner: ({ sessionId, projectId, claudeSessionId }) =>
      run(async () => {
        assertId(sessionId)
        const index = await readIndex()
        await putEntry(sessionId, {
          ...startedEntry(index[sessionId]),
          projectId,
          claudeSessionId,
        })
      }),
    sessionOwnership: () =>
      run(async () => {
        const index = await readIndex()
        const ownership: Record<string, string | null> = {}
        for (const entry of Object.values(index)) {
          if (entry.claudeSessionId) {
            ownership[entry.claudeSessionId] = resolveProjectId(entry.projectId)
          }
        }
        return ownership
      }),
    sessionSetArchived: ({ sessions, archived }) =>
      run(async () => {
        const index = await readIndex()
        const now = Math.floor(Date.now() / 1000)
        const staleUnarchivedBefore = Date.now() - UNARCHIVED_AT_TTL_MS
        const byClaudeId = indexByClaudeId(index)
        for (const { projectId, sessionId } of sessions) {
          const boundIds = byClaudeId.get(sessionId) ?? []
          if (boundIds.length > 0) {
            for (const id of boundIds) {
              const next = { ...index[id] }
              if (archived) {
                next.archived = true
                next.archivedAt = now
              } else {
                delete next.archived
                delete next.archivedAt
                next.unarchivedAt = now
              }
              index[id] = next
            }
            continue
          }
          // Never-opened history sessions have no index entry yet; a marker
          // keyed under the claude id carries the mark (and, on unarchive, the
          // auto-archive grace timestamp) without a stored session file.
          index[`${MARKER_PREFIX}${sessionId}`] = archived
            ? { projectId, claudeSessionId: sessionId, archived: true, archivedAt: now }
            : { projectId, claudeSessionId: sessionId, unarchivedAt: now }
        }
        for (const [id, entry] of Object.entries(index)) {
          if (
            entry.unarchivedAt === undefined ||
            entry.unarchivedAt * 1000 >= staleUnarchivedBefore
          )
            continue
          if (id.startsWith(MARKER_PREFIX) && !entry.archived) {
            delete index[id]
            continue
          }
          const next = { ...entry }
          delete next.unarchivedAt
          index[id] = next
        }
        await atomic(indexPath, JSON.stringify(index))
      }),
    sessionListFlags: () =>
      run(async () => {
        const index = await readIndex()
        const flags: Record<string, SessionListFlags> = {}
        for (const entry of Object.values(index)) {
          if (!entry.claudeSessionId) continue
          const flag = flags[entry.claudeSessionId] ?? { archived: false }
          if (entry.archived) {
            flag.archived = true
            flag.archivedAt = entry.archivedAt
          }
          if (
            entry.unarchivedAt !== undefined &&
            (flag.unarchivedAt === undefined || entry.unarchivedAt > flag.unarchivedAt)
          ) {
            flag.unarchivedAt = entry.unarchivedAt
          }
          if (
            entry.pinnedAt !== undefined &&
            (flag.pinnedAt === undefined || entry.pinnedAt > flag.pinnedAt)
          ) {
            flag.pinnedAt = entry.pinnedAt
          }
          if (
            entry.unread !== undefined &&
            (flag.unreadAt === undefined || (entry.unreadAt ?? 0) >= flag.unreadAt)
          ) {
            flag.unread = entry.unread
            flag.unreadAt = entry.unreadAt
          }
          flags[entry.claudeSessionId] = flag
        }
        for (const flag of Object.values(flags)) {
          // A newer unarchive overrides an older archive mark.
          if (flag.archived && flag.unarchivedAt !== undefined) {
            flag.archived = (flag.archivedAt ?? 0) > flag.unarchivedAt
          }
        }
        return flags
      }),
    sessionSetPinned: ({ sessions, pinned }) =>
      run(async () => {
        const index = await readIndex()
        const byClaudeId = indexByClaudeId(index)
        const now = Math.floor(Date.now() / 1000)
        let changed = false
        for (const { projectId, sessionId, claudeSessionId } of sessions) {
          const boundIds = claudeSessionId ? (byClaudeId.get(claudeSessionId) ?? []) : []
          if (boundIds.length > 0) {
            for (const id of boundIds) {
              const current = index[id]
              if (!current) continue
              const next = withPinned(current, pinned, now)
              if (next === current) continue
              // A marker reached through its claude id must not linger bare.
              const settled = pruneMarker(next, id)
              if (settled) index[id] = settled
              else delete index[id]
              changed = true
            }
            continue
          }
          // Marks for sessions without a bound entry live on a marker keyed by
          // the claude id; drafts (no claude id yet) mark their own entry.
          const markerId = claudeSessionId ? `${MARKER_PREFIX}${sessionId}` : sessionId
          const previous = index[markerId]
          if (pinned) {
            if (previous?.pinnedAt !== undefined) continue
            index[markerId] = {
              ...(previous ?? {}),
              projectId: previous?.projectId ?? projectId,
              ...(claudeSessionId && !previous?.claudeSessionId ? { claudeSessionId } : {}),
              pinnedAt: now,
            }
          } else {
            if (previous?.pinnedAt === undefined) continue
            const next = { ...previous }
            delete next.pinnedAt
            const settled = pruneMarker(next, markerId)
            if (settled) index[markerId] = settled
            else delete index[markerId]
          }
          changed = true
        }
        if (changed) await atomic(indexPath, JSON.stringify(index))
      }),
    sessionSetUnread: ({ sessions, unread }) =>
      run(async () => {
        const index = await readIndex()
        const byClaudeId = indexByClaudeId(index)
        const now = Math.floor(Date.now() / 1000)
        let changed = false
        for (const { projectId, sessionId, claudeSessionId } of sessions) {
          const boundIds = claudeSessionId ? (byClaudeId.get(claudeSessionId) ?? []) : []
          if (boundIds.length > 0) {
            for (const id of boundIds) {
              const current = index[id]
              if (!current) continue
              const next = withUnread(current, unread, now)
              if (next === current) continue
              const settled = pruneMarker(next, id)
              if (settled) index[id] = settled
              else delete index[id]
              changed = true
            }
            continue
          }
          const markerId = claudeSessionId ? `${MARKER_PREFIX}${sessionId}` : sessionId
          const previous = index[markerId]
          if (unread) {
            if (previous?.unread === unread && previous.unreadAt !== undefined) continue
            index[markerId] = {
              ...(previous ?? {}),
              projectId: previous?.projectId ?? projectId,
              ...(claudeSessionId && !previous?.claudeSessionId ? { claudeSessionId } : {}),
              unread,
              unreadAt: now,
            }
          } else {
            if (previous?.unread === undefined && previous?.unreadAt === undefined) continue
            const next = { ...previous }
            delete next.unread
            delete next.unreadAt
            const settled = pruneMarker(next, markerId)
            if (settled) index[markerId] = settled
            else delete index[markerId]
          }
          changed = true
        }
        if (changed) await atomic(indexPath, JSON.stringify(index))
      }),
    sessionRebindProject: ({ fromProjectId, toProjectId }) =>
      run(async () => {
        const index = await readIndex()
        let indexChanged = false
        for (const [id, entry] of Object.entries(index)) {
          if (entry.projectId !== fromProjectId) continue
          index[id] = { ...entry, projectId: toProjectId }
          indexChanged = true
        }
        if (indexChanged) await atomic(indexPath, JSON.stringify(index))
        const files = await readdir(dir).catch(() => [] as string[])
        for (const file of files) {
          if (!file.endsWith('.json') || file === INDEX_FILE || file === LEGACY_INDEX_FILE) continue
          const filePath = path.join(dir, file)
          let value: unknown
          try {
            value = JSON.parse(await readFile(filePath, 'utf8'))
          } catch {
            continue
          }
          if (!validSession(value) || value.projectId !== fromProjectId) continue
          await atomic(filePath, JSON.stringify({ ...value, projectId: toProjectId }))
        }
      }),
    sessionDelete: ({ sessionId }) =>
      run(async () => {
        assertId(sessionId)
        try {
          await unlink(path.join(dir, `${sessionId}.json`))
        } catch (e: any) {
          if (e?.code !== 'ENOENT') throw e
        }
        const index = await readIndex()
        if (sessionId in index) {
          delete index[sessionId]
          await atomic(indexPath, JSON.stringify(index))
        }
      }),
    sessionDeleteProject: ({ projectId }) =>
      run(async () => {
        const files = await readdir(dir).catch(() => [] as string[])
        // Skip unreadable or malformed files instead of aborting: one bad
        // file must not strand the remaining sessions and the draft index.
        let skipped = 0
        for (const file of files) {
          if (!file.endsWith('.json') || file === INDEX_FILE || file === LEGACY_INDEX_FILE) continue
          try {
            const value = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
            const fileProjectId = migratedProjectId(value.projectId, value.projectPath)
            if (validSession(value) && fileProjectId === projectId)
              await unlink(path.join(dir, file))
          } catch (e: any) {
            if (e?.code === 'ENOENT') continue
            skipped += 1
          }
        }
        if (skipped) {
          logger.warning('session.delete_project_skipped', 'Skipped unreadable session files', {
            context: { projectId, skipped },
          })
        }
        const index = await readIndex()
        let changed = false
        for (const [id, entry] of Object.entries(index))
          if (entry.projectId === projectId) {
            delete index[id]
            changed = true
          }
        if (changed) await atomic(indexPath, JSON.stringify(index))
      }),
  }
}
