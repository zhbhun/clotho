import { createHash } from 'node:crypto'
import path from 'node:path'

import { type SDKSessionInfo, listSessions } from '@anthropic-ai/claude-agent-sdk'

import type { ClaudeProject, ClaudeSession } from '@/shared/rpc'

import { getProjectRepositoryRoot, isWorktreePath } from './git'

const sessionPathsByProjectPath = new Map<string, string[]>()

/** Suffix distinguishing the workspace entry of a path from the plain one. */
const WORKSPACE_ID_SUFFIX = '#workspace'

export function projectIdFromPath(projectPath: string, isWorkspace = false) {
  const source = path.resolve(projectPath) + (isWorkspace ? WORKSPACE_ID_SUFFIX : '')
  return createHash('md5').update(source).digest('hex')
}

export function projectWorkspaceId(projectPath: string, isWorkspace = false) {
  return projectIdFromPath(projectPath, isWorkspace)
}

/** Claude Code stores session transcripts under this munged rendering of the project path. */
export function projectDirNameFromPath(projectPath: string) {
  return projectPath.replace(/[^a-zA-Z0-9]/g, '-')
}

function secondsFromMillis(timestampMs?: number) {
  return Math.floor((timestampMs ?? 0) / 1000)
}

function sessionTitle(info: SDKSessionInfo) {
  return info.summary?.trim() || info.customTitle?.trim() || info.firstPrompt?.trim()
}

export function sessionInfoToClaudeSession({
  info,
  projectId,
  projectPath,
}: {
  info: SDKSessionInfo
  projectId: string
  projectPath: string
}): ClaudeSession | undefined {
  const title = sessionTitle(info)
  if (!title) {
    return undefined
  }

  return {
    id: info.sessionId,
    project_id: projectId,
    project_path: projectPath,
    created_at: secondsFromMillis(info.lastModified),
    title,
    custom_title: info.customTitle,
    first_prompt: info.firstPrompt,
    git_branch: info.gitBranch,
    tag: info.tag,
  }
}

export async function listProjectsFromSessions(): Promise<ClaudeProject[]> {
  const sessions = await listSessions()
  const byPath = new Map<string, ClaudeProject>()
  const sourcePathsByProjectPath = new Map<string, Set<string>>()
  const canonicalPathPromises = new Map<string, Promise<string | undefined>>()

  sessionPathsByProjectPath.clear()

  for (const session of sessions) {
    if (!session.cwd || canonicalPathPromises.has(session.cwd)) continue

    canonicalPathPromises.set(session.cwd, getProjectRepositoryRoot(session.cwd))
  }

  for (const session of sessions) {
    if (!session.cwd) {
      continue
    }

    const sourcePath = path.resolve(session.cwd)
    const repositoryRoot = await canonicalPathPromises.get(session.cwd)!
    if (!repositoryRoot && isWorktreePath(session.cwd)) continue
    const projectPath = path.resolve(repositoryRoot ?? session.cwd)

    const project =
      byPath.get(projectPath) ??
      ({
        id: projectIdFromPath(projectPath),
        workspace_id: projectWorkspaceId(projectPath),
        path: projectPath,
        sessions: [],
        created_at: secondsFromMillis(session.createdAt ?? session.lastModified),
      } satisfies ClaudeProject)

    project.sessions.push(session.sessionId)
    project.created_at = Math.min(
      project.created_at,
      secondsFromMillis(session.createdAt ?? session.lastModified),
    )
    project.most_recent_session = Math.max(
      project.most_recent_session ?? 0,
      secondsFromMillis(session.lastModified),
    )
    byPath.set(projectPath, project)
    const sourcePaths = sourcePathsByProjectPath.get(projectPath) ?? new Set<string>()
    sourcePaths.add(sourcePath)
    sourcePathsByProjectPath.set(projectPath, sourcePaths)
  }

  for (const project of byPath.values()) {
    sessionPathsByProjectPath.set(project.path, [
      project.path,
      ...(sourcePathsByProjectPath.get(project.path) ?? []),
    ])
  }

  return Array.from(byPath.values()).sort((left, right) => {
    const leftTime = left.most_recent_session ?? left.created_at
    const rightTime = right.most_recent_session ?? right.created_at
    return rightTime - leftTime
  })
}

export async function listProjectSessions({
  projectId,
  projectPath,
  ownership,
  isFallbackOwner = true,
}: {
  projectId: string
  projectPath: string
  /**
   * claudeSessionId → owning project-entry id. `null` marks a home-mode
   * conversation, which belongs to no project.
   */
  ownership?: Record<string, string | null>
  /**
   * Unmapped sessions (started outside Clotho, or recorded before the index)
   * belong to the plain entry of the path — or to the only entry when no
   * plain one exists.
   */
  isFallbackOwner?: boolean
}): Promise<ClaudeSession[]> {
  const projectPaths = [projectPath, ...(sessionPathsByProjectPath.get(projectPath) ?? [])].filter(
    (candidate, index, paths) => paths.indexOf(candidate) === index,
  )
  const sessionsByPath = await Promise.all(
    projectPaths.map(async (sourcePath) => ({
      sourcePath,
      sessions: await listSessions({ dir: sourcePath, includeWorktrees: true }),
    })),
  )
  const seenSessionIds = new Set<string>()

  return sessionsByPath
    .flatMap(({ sourcePath, sessions }) =>
      sessions.flatMap((info) => {
        if (seenSessionIds.has(info.sessionId)) return []
        seenSessionIds.add(info.sessionId)
        const owner = ownership?.[info.sessionId]
        if (owner !== projectId && !(owner === undefined && isFallbackOwner)) return []
        return [
          sessionInfoToClaudeSession({
            info,
            projectId,
            projectPath: info.cwd ? path.resolve(info.cwd) : sourcePath,
          }),
        ]
      }),
    )
    .filter((session): session is ClaudeSession => Boolean(session))
}
