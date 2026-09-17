import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { DraftSession, DraftSessionIndex, LocalSession } from '@/shared/session'

import { projectIdFromPath } from './claude/sessions'
import { getLogger } from './logging/runtime'

const logger = getLogger('persistence')

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

function assertId(id: string) {
  if (id === 'drafts' || !ID_RE.test(id)) throw new Error('Invalid session id')
}

/** Stored records may predate the digest id scheme; the path is the source of truth. */
function migratedProjectId(projectId: string | null, projectPath: string | null) {
  return projectId && projectPath ? projectIdFromPath(projectPath) : projectId
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
function validSession(v: unknown): v is LocalSession {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const x = v as Record<string, any>
  const i = x.input
  return (
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
  sessionDelete(params: { sessionId: string }): Promise<void>
  sessionDeleteProject(params: { projectId: string }): Promise<void>
}

export function createSessionStorage(rootDir: string): SessionStorage {
  const dir = rootDir,
    indexPath = path.join(dir, 'drafts.json')
  let queue = Promise.resolve()
  const run = <T>(fn: () => Promise<T>) => {
    const next = queue.then(fn)
    queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
  const readIndex = async (): Promise<DraftSessionIndex> => {
    let value: unknown
    try {
      value = JSON.parse(await readFile(indexPath, 'utf8'))
    } catch (e: any) {
      if (e?.code !== 'ENOENT') {
        logger.warning('session.drafts_index_unreadable', 'Ignored an unreadable drafts index')
      }
      return {}
    }
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      logger.warning('session.drafts_index_unreadable', 'Ignored an unreadable drafts index')
      return {}
    }
    // Skip malformed entries individually: one bad row must not hide every
    // draft, and the next write rewrites the index without them.
    const index: DraftSessionIndex = {}
    let skipped = 0
    for (const [id, draft] of Object.entries(value)) {
      try {
        assertId(id)
      } catch {
        skipped += 1
        continue
      }
      if (!validDraft(draft)) {
        skipped += 1
        continue
      }
      index[id] = {
        ...draft,
        projectId: migratedProjectId(draft.projectId, draft.projectPath),
      }
    }
    if (skipped) {
      logger.warning('session.drafts_entries_skipped', 'Skipped malformed draft index entries', {
        context: { skipped },
      })
    }
    return index
  }
  const atomic = async (file: string, content: string) => {
    await mkdir(dir, { recursive: true })
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    await writeFile(tmp, content)
    await rename(tmp, file)
  }
  return {
    sessionListDrafts: () => run(readIndex),
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
              projectId: migratedProjectId(value.projectId, value.projectPath),
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
          index[sessionId] = draft
          await atomic(indexPath, JSON.stringify(index))
        }
      }),
    sessionUpdateDraft: ({ sessionId, draft }) =>
      run(async () => {
        assertId(sessionId)
        if (!validDraft(draft)) throw new Error('Malformed draft')
        const index = await readIndex()
        index[sessionId] = draft
        await atomic(indexPath, JSON.stringify(index))
      }),
    sessionCompleteDraft: ({ sessionId }) =>
      run(async () => {
        assertId(sessionId)
        const index = await readIndex()
        if (sessionId in index) {
          delete index[sessionId]
          await atomic(indexPath, JSON.stringify(index))
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
          if (!file.endsWith('.json') || file === 'drafts.json') continue
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
        for (const [id, draft] of Object.entries(index))
          if (draft.projectId === projectId) {
            delete index[id]
            changed = true
          }
        if (changed) await atomic(indexPath, JSON.stringify(index))
      }),
  }
}
