import { constants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  getSessionInfo,
  deleteSession as sdkDeleteSession,
  renameSession as sdkRenameSession,
} from '@anthropic-ai/claude-agent-sdk'

import { isWorkspaceEntry, projectPathForId, readRegisteredProjects } from './projects'
import { type HeadTail, type SessionEntry } from './session-meta'
import { listProjectSessions, projectDirNameFromPath } from './sessions'

export {
  addProjectFromFolder,
  createProject,
  listClaudeProjects,
  projectPathForId,
  removeProject,
  selectFiles,
  selectProjectFolder,
  setProjectLastOpened,
  updateProject,
} from './projects'

const SESSION_CHUNK = 65_536

export function systemTimeSeconds(timestampMs: number) {
  return Math.floor(timestampMs / 1000)
}

export async function modifiedSeconds(filePath: string) {
  try {
    const stats = await fs.stat(filePath)
    return systemTimeSeconds((stats.mtimeMs || stats.birthtimeMs || Date.now()) as number)
  } catch {
    return 0
  }
}

export function claudeDir() {
  return path.join(os.homedir(), '.claude')
}

export async function readHeadTail(filePath: string): Promise<HeadTail> {
  const handle = await fs.open(filePath, 'r')
  try {
    const stats = await handle.stat()
    const headLength = Math.min(Number(stats.size), SESSION_CHUNK)
    const headBuffer = Buffer.alloc(headLength)
    const headRead = await handle.read(headBuffer, 0, headLength, 0)
    const head = headBuffer.subarray(0, headRead.bytesRead).toString('utf8')

    if (stats.size <= SESSION_CHUNK) {
      return { head, tail: head }
    }

    const tailBuffer = Buffer.alloc(SESSION_CHUNK)
    const start = Number(stats.size) - SESSION_CHUNK
    const tailRead = await handle.read(tailBuffer, 0, SESSION_CHUNK, start)
    const tail = tailBuffer.subarray(0, tailRead.bytesRead).toString('utf8')
    return { head, tail }
  } finally {
    await handle.close()
  }
}

export async function findProjectPathFromSessions(projectDir: string) {
  try {
    const entries = await fs.readdir(projectDir)
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) {
        continue
      }

      const filePath = path.join(projectDir, entry)
      const content = await fs.readFile(filePath, 'utf8')
      for (const line of content.split('\n').slice(0, 12)) {
        try {
          const json = JSON.parse(line) as SessionEntry
          const cwd = typeof json.cwd === 'string' ? json.cwd : ''
          if (cwd) {
            return cwd
          }
        } catch {
          continue
        }
      }
    }
  } catch {
    return undefined
  }

  return undefined
}

export async function getProjectSessions({
  projectId,
  ownership,
}: {
  projectId: string
  /** claudeSessionId → owning project-entry id, from sessions/index.json. */
  ownership?: Record<string, string | null>
}) {
  const projectPath = await projectPathForId(projectId)
  try {
    const stats = await fs.stat(projectPath)
    if (!stats.isDirectory()) throw new Error('Project path is not a directory')
    await fs.access(projectPath, constants.R_OK | constants.X_OK)
  } catch (caught) {
    throw new Error('Project directory is unavailable', { cause: caught })
  }

  // Sessions recorded before the index (or started outside Clotho) belong to
  // the plain entry of the path, or to the only entry when no plain one exists.
  let isFallbackOwner = true
  if (ownership) {
    const siblings = (await readRegisteredProjects()).filter(
      (project) => !project.deleted && path.resolve(project.path) === path.resolve(projectPath),
    )
    const fallback = siblings.find((project) => !isWorkspaceEntry(project)) ?? siblings[0]
    isFallbackOwner = !fallback || fallback.id === projectId
  }

  return listProjectSessions({
    projectId,
    projectPath,
    ...(ownership ? { ownership } : {}),
    isFallbackOwner,
  })
}

/**
 * User-initiated rename. Goes through the SDK's own store so the appended
 * custom-title record carries the fields the CLI expects; nothing else in
 * clotho may write to the transcript.
 */
export async function renameSession({
  projectId,
  sessionId,
  title,
}: {
  projectId: string
  sessionId: string
  title: string
}) {
  assertPathSegment(projectId, 'project id')
  assertPathSegment(sessionId, 'session id')
  const projectPath = await projectPathForId(projectId)
  await sdkRenameSession(sessionId, title, { dir: projectPath })
}

export function assertPathSegment(value: string, label: string) {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
}

export async function deleteSession({
  projectId,
  sessionId,
}: {
  projectId: string
  sessionId: string
}) {
  assertPathSegment(projectId, 'project id')
  assertPathSegment(sessionId, 'session id')
  const dir = await projectPathForId(projectId)
  const projectDirName = projectDirNameFromPath(dir)
  const transcriptPath = path.join(claudeDir(), 'projects', projectDirName, `${sessionId}.jsonl`)
  const subagentDir = path.join(claudeDir(), 'projects', projectDirName, sessionId)
  const removeTranscript = () => fs.rm(transcriptPath, { force: true })
  const removeSubagentDir = () => fs.rm(subagentDir, { force: true, recursive: true })
  if (!(await getSessionInfo(sessionId, { dir }))) {
    // A query cancelled before init can leave a JSONL file without enough
    // metadata for getSessionInfo. Remove that orphan transcript as well.
    await removeTranscript()
    await removeSubagentDir()
    return
  }

  try {
    await sdkDeleteSession(sessionId, { dir })
  } catch (caught) {
    if (!(await getSessionInfo(sessionId, { dir }))) {
      await removeTranscript()
      await removeSubagentDir()
      return
    }
    throw caught
  }
  await removeTranscript()
  await removeSubagentDir()
}
