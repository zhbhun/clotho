import { constants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getSessionInfo, deleteSession as sdkDeleteSession } from '@anthropic-ai/claude-agent-sdk'

import { projectPathForId } from './projects'
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

export async function getProjectSessions({ projectId }: { projectId: string }) {
  const projectPath = await projectPathForId(projectId)
  try {
    const stats = await fs.stat(projectPath)
    if (!stats.isDirectory()) throw new Error('Project path is not a directory')
    await fs.access(projectPath, constants.R_OK | constants.X_OK)
  } catch (caught) {
    throw new Error('Project directory is unavailable', { cause: caught })
  }

  return listProjectSessions({
    projectId,
    projectPath,
  })
}

export async function renameSession({
  projectId,
  sessionId,
  title,
}: {
  projectId: string
  sessionId: string
  title: string
}) {
  const projectPath = await projectPathForId(projectId)
  const sessionPath = path.join(
    claudeDir(),
    'projects',
    projectDirNameFromPath(projectPath),
    `${sessionId}.jsonl`,
  )
  const entry = JSON.stringify({
    type: 'custom-title',
    sessionId,
    customTitle: title,
  })

  await fs.mkdir(path.dirname(sessionPath), { recursive: true })
  await fs.appendFile(sessionPath, `${entry}\n`)
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
