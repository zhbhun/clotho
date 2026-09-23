import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  DraftSession,
  DraftSessionIndex,
  LocalSession,
  SessionIndex,
  SessionIndexEntry,
} from '@/shared/session'

import { projectIdFromPath } from './claude/sessions'
import { getLogger } from './logging/runtime'

const logger = getLogger('persistence')

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const INDEX_FILE = 'index.json'
const LEGACY_INDEX_FILE = 'drafts.json'

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
    (x.updatedAt === undefined || typeof x.updatedAt === 'number')
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
  /** A started conversation keeps its ownership and drops the draft bookkeeping. */
  const startedEntry = (entry: SessionIndexEntry | undefined): SessionIndexEntry => ({
    projectId: entry?.projectId ?? null,
    ...(entry?.claudeSessionId ? { claudeSessionId: entry.claudeSessionId } : {}),
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
