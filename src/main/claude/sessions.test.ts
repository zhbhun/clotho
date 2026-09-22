// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { listSessions } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  listProjectSessions,
  listProjectsFromSessions,
  projectIdFromPath,
  projectWorkspaceId,
} from './sessions'
import { getProjectSessions, listClaudeProjects } from './workspace'

const sdkMocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => sdkMocks)

describe('Claude session reading', () => {
  let tempDir: string | undefined

  beforeEach(() => {
    vi.mocked(listSessions).mockReset()
  })

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true })
      tempDir = undefined
    }
  })

  it('groups linked worktree sessions under their common repository project', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clotho-sessions-'))
    const repositoryPath = path.join(tempDir, 'repository')
    const firstWorktreePath = path.join(tempDir, 'first-worktree')
    const secondWorktreePath = path.join(tempDir, 'second-worktree')

    for (const [worktreePath, name] of [
      [firstWorktreePath, 'first'],
      [secondWorktreePath, 'second'],
    ] as const) {
      const worktreeGitPath = path.join(repositoryPath, '.git', 'worktrees', name)
      await mkdir(worktreePath, { recursive: true })
      await mkdir(worktreeGitPath, { recursive: true })
      await writeFile(
        path.join(worktreePath, '.git'),
        `gitdir: ${path.relative(worktreePath, worktreeGitPath)}\n`,
      )
      await writeFile(path.join(worktreeGitPath, 'commondir'), '../..\n')
    }

    vi.mocked(listSessions).mockResolvedValue([
      {
        sessionId: 'first-session',
        summary: 'First worktree session',
        lastModified: 2_000,
        cwd: firstWorktreePath,
      },
      {
        sessionId: 'second-session',
        summary: 'Second worktree session',
        lastModified: 1_000,
        cwd: secondWorktreePath,
      },
    ])

    await expect(listProjectsFromSessions()).resolves.toEqual([
      {
        id: projectIdFromPath(repositoryPath),
        workspace_id: projectWorkspaceId(repositoryPath),
        path: repositoryPath,
        sessions: ['first-session', 'second-session'],
        created_at: 1,
        most_recent_session: 2,
      },
    ])
  })

  it('loads grouped project sessions from every linked worktree path', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clotho-sessions-'))
    const repositoryPath = path.join(tempDir, 'repository')
    const worktreePath = path.join(tempDir, 'worktree')
    const worktreeGitPath = path.join(repositoryPath, '.git', 'worktrees', 'feature')

    await mkdir(worktreePath, { recursive: true })
    await mkdir(worktreeGitPath, { recursive: true })
    await writeFile(
      path.join(worktreePath, '.git'),
      `gitdir: ${path.relative(worktreePath, worktreeGitPath)}\n`,
    )
    await writeFile(path.join(worktreeGitPath, 'commondir'), '../..\n')

    const worktreeSession = {
      sessionId: 'worktree-session',
      summary: 'Worktree session',
      lastModified: 2_000,
      cwd: worktreePath,
    }
    vi.mocked(listSessions).mockImplementation(async (params?: { dir?: string }) => {
      if (!params) return [worktreeSession]
      return params.dir === worktreePath ? [worktreeSession] : []
    })

    const [project] = await listProjectsFromSessions()

    await expect(
      listProjectSessions({
        projectId: project.id,
        projectPath: project.path,
      }),
    ).resolves.toEqual([
      {
        id: 'worktree-session',
        project_id: project.id,
        project_path: worktreePath,
        created_at: 2,
        title: 'Worktree session',
      },
    ])
    expect(listSessions).toHaveBeenCalledWith({ dir: repositoryPath, includeWorktrees: true })
    expect(listSessions).toHaveBeenCalledWith({ dir: worktreePath, includeWorktrees: true })
  })

  it('reuses SDK project paths instead of decoding the project id for later project reads', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clotho-sessions-'))
    const projectPath = path.join(tempDir, 'my-app')
    await mkdir(projectPath)
    vi.mocked(listSessions)
      .mockResolvedValueOnce([
        {
          sessionId: 'hyphen-path-session',
          summary: 'Hyphen path',
          lastModified: 1_000,
          cwd: projectPath,
        },
      ])
      .mockResolvedValueOnce([
        {
          sessionId: 'hyphen-path-session',
          summary: 'Hyphen path',
          lastModified: 1_000,
          cwd: projectPath,
        },
      ])

    // Point the registry at the empty temp directory so no real ~/.clotho file is read.
    // The temp-dir fixture sits under a non-project root outside the home
    // directory, so disable both filters.
    const [project] = await listClaudeProjects(
      path.join(tempDir, 'projects.json'),
      undefined,
      [],
      tempDir,
    )
    expect(project?.path).toBe(projectPath)
    await getProjectSessions({ projectId: project!.id })

    expect(listSessions).toHaveBeenNthCalledWith(2, {
      dir: projectPath,
      includeWorktrees: true,
    })
  })

  it('rejects session loading when the project directory is unavailable', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clotho-sessions-'))
    const missingPath = path.join(tempDir, 'missing-project')
    const filePath = path.join(tempDir, 'projects.json')
    await mkdir(missingPath)
    await writeFile(
      filePath,
      JSON.stringify([
        {
          id: 'legacy-missing-project',
          path: missingPath,
          created_at: 0,
        },
      ]),
    )
    vi.mocked(listSessions).mockResolvedValue([])

    await listClaudeProjects(filePath, [])
    await rm(missingPath, { recursive: true, force: true })

    await expect(getProjectSessions({ projectId: projectIdFromPath(missingPath) })).rejects.toThrow(
      'Project directory is unavailable',
    )
  })

  it('rejects session loading for an unknown project id', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clotho-sessions-'))
    vi.mocked(listSessions).mockResolvedValue([])

    await expect(getProjectSessions({ projectId: 'unknown-project' })).rejects.toThrow(
      'Unknown project',
    )
  })

  it('splits one folder history between the plain and workspace entries by ownership', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clotho-sessions-'))
    const projectPath = path.join(tempDir, 'my-app')
    await mkdir(projectPath)
    const plainId = projectIdFromPath(projectPath)
    const workspaceId = projectIdFromPath(projectPath, true)
    const session = (sessionId: string) => ({
      sessionId,
      summary: `Session ${sessionId}`,
      lastModified: 1_000,
      cwd: projectPath,
    })
    vi.mocked(listSessions).mockImplementation(async (params?: { dir?: string }) =>
      params
        ? [session('plain-session'), session('workspace-session'), session('home-session')]
        : [],
    )
    const ownership = {
      'plain-session': plainId,
      'workspace-session': workspaceId,
      // A home-mode conversation belongs to no project entry.
      'home-session': null,
    }

    await expect(
      listProjectSessions({ projectId: plainId, projectPath, ownership, isFallbackOwner: true }),
    ).resolves.toEqual([expect.objectContaining({ id: 'plain-session' })])
    await expect(
      listProjectSessions({
        projectId: workspaceId,
        projectPath,
        ownership,
        isFallbackOwner: false,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: 'workspace-session' })])
  })

  it('keeps unmapped sessions only for the fallback owner of a path', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clotho-sessions-'))
    const projectPath = path.join(tempDir, 'my-app')
    await mkdir(projectPath)
    const plainId = projectIdFromPath(projectPath)
    const workspaceId = projectIdFromPath(projectPath, true)
    const unmapped = {
      sessionId: 'cli-session',
      summary: 'CLI session',
      lastModified: 1_000,
      cwd: projectPath,
    }
    vi.mocked(listSessions).mockImplementation(async (params?: { dir?: string }) =>
      params ? [unmapped] : [],
    )

    await expect(
      listProjectSessions({
        projectId: plainId,
        projectPath,
        ownership: {},
        isFallbackOwner: true,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: 'cli-session' })])
    await expect(
      listProjectSessions({
        projectId: workspaceId,
        projectPath,
        ownership: {},
        isFallbackOwner: false,
      }),
    ).resolves.toEqual([])
  })
})
