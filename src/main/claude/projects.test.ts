// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClaudeProject } from '@/shared/rpc'

import {
  createProject,
  listClaudeProjects,
  readRegisteredProjects,
  removeProject,
  setProjectDefaultModel,
  updateProject,
  writeRegisteredProjects,
} from './projects'
import { projectIdFromPath, projectWorkspaceId } from './sessions'

const sessionMocks = vi.hoisted(() => ({
  listProjects: vi.fn<() => Promise<ClaudeProject[]>>(),
}))

vi.mock('./sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sessions')>()),
  listProjectsFromSessions: sessionMocks.listProjects,
}))

let tempDir: string | undefined

async function tempProjectsFile() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'clotho-projects-'))
  return path.join(tempDir, 'projects.json')
}

beforeEach(() => {
  sessionMocks.listProjects.mockReset().mockResolvedValue([])
})

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

describe('project registry', () => {
  it('omits invalid project paths without deleting registry entries', async () => {
    const filePath = await tempProjectsFile()
    const existingPath = path.join(tempDir!, 'existing')
    const missingPath = path.join(tempDir!, 'missing')
    const fileProjectPath = path.join(tempDir!, 'project-file')
    const discoveredMissingPath = path.join(tempDir!, 'discovered-missing')
    const registeredProjects = [
      { id: 'existing', path: existingPath, created_at: 40 },
      { id: 'missing', path: missingPath, created_at: 30 },
      { id: 'file', path: fileProjectPath, created_at: 20 },
    ]

    await mkdir(existingPath)
    await writeFile(fileProjectPath, 'not a directory')
    await writeRegisteredProjects(registeredProjects, filePath)
    sessionMocks.listProjects.mockResolvedValue([
      {
        id: 'discovered-missing',
        workspace_id: projectWorkspaceId(discoveredMissingPath),
        path: discoveredMissingPath,
        sessions: ['session-1'],
        created_at: 10,
      },
    ])

    await expect(listClaudeProjects(filePath)).resolves.toEqual([
      {
        id: projectIdFromPath(existingPath),
        workspace_id: projectWorkspaceId(existingPath),
        path: existingPath,
        sessions: [],
        created_at: 40,
      },
    ])
    await expect(readRegisteredProjects(filePath)).resolves.toEqual(
      registeredProjects.map((project) => ({ ...project, id: projectIdFromPath(project.path) })),
    )
  })

  it('replaces legacy path-encoded ids with the path digest on read', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    await mkdir(projectPath)
    await writeFile(
      filePath,
      JSON.stringify([{ id: '-tmp-alpha', path: projectPath, created_at: 10 }]),
      'utf8',
    )

    const digestId = projectIdFromPath(projectPath)
    expect(digestId).toMatch(/^[0-9a-f]{32}$/)
    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      { id: digestId, path: projectPath, created_at: 10 },
    ])
    await expect(listClaudeProjects(filePath)).resolves.toEqual([
      expect.objectContaining({ id: digestId, path: projectPath }),
    ])
  })

  it('merges a registered linked worktree into its repository project', async () => {
    const filePath = await tempProjectsFile()
    const repositoryPath = path.join(tempDir!, 'repository')
    const worktreePath = path.join(tempDir!, 'worktree')
    const worktreeGitPath = path.join(repositoryPath, '.git', 'worktrees', 'feature')

    await mkdir(worktreePath, { recursive: true })
    await mkdir(worktreeGitPath, { recursive: true })
    await writeFile(
      path.join(worktreePath, '.git'),
      `gitdir: ${path.relative(worktreePath, worktreeGitPath)}\n`,
    )
    await writeFile(path.join(worktreeGitPath, 'commondir'), '../..\n')
    await writeRegisteredProjects(
      [
        {
          id: projectIdFromPath(worktreePath),
          path: worktreePath,
          name: 'Repository project',
          created_at: 10,
        },
      ],
      filePath,
    )
    sessionMocks.listProjects.mockResolvedValue([
      {
        id: projectIdFromPath(repositoryPath),
        workspace_id: projectWorkspaceId(repositoryPath),
        path: repositoryPath,
        sessions: ['session-1'],
        created_at: 5,
      },
    ])

    await expect(listClaudeProjects(filePath)).resolves.toEqual([
      {
        id: projectIdFromPath(worktreePath),
        workspace_id: projectWorkspaceId(repositoryPath),
        path: repositoryPath,
        name: 'Repository project',
        sessions: ['session-1'],
        created_at: 10,
      },
    ])
  })

  it('restores a deleted project without losing its existing settings', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    await mkdir(projectPath)
    await writeRegisteredProjects(
      [
        {
          id: '-alpha',
          path: projectPath,
          created_at: 10,
          deleted: true,
          default_provider_id: 'glm',
          default_model_id: 'glm-5.2[1M]',
        },
      ],
      filePath,
    )

    const project = await createProject(
      {
        path: projectPath,
        name: 'Alpha restored',
        icon: { type: 'preset', name: 'folder', color: 'blue' },
      },
      filePath,
    )

    expect(project).toMatchObject({
      name: 'Alpha restored',
      icon: { type: 'preset', name: 'folder', color: 'blue' },
      default_provider_id: 'glm',
      default_model_id: 'glm-5.2[1M]',
    })
    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      expect.objectContaining({
        created_at: 10,
        deleted: false,
        name: 'Alpha restored',
        default_provider_id: 'glm',
        default_model_id: 'glm-5.2[1M]',
      }),
    ])
  })

  it('soft deletes projects still present in Claude and removes local-only projects', async () => {
    const filePath = await tempProjectsFile()
    const alphaId = projectIdFromPath('/tmp/alpha')
    const localId = projectIdFromPath('/tmp/local')
    // Legacy dash-encoded ids are rewritten to the digest on read.
    await writeRegisteredProjects(
      [
        { id: '-tmp-alpha', path: '/tmp/alpha', created_at: 10 },
        { id: '-tmp-local', path: '/tmp/local', created_at: 11 },
      ],
      filePath,
    )

    await removeProject({ projectId: alphaId }, filePath, [
      { id: alphaId, path: '/tmp/alpha', sessions: ['s1'], created_at: 5 },
    ])
    await removeProject({ projectId: localId }, filePath, [])

    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      expect.objectContaining({ id: alphaId, deleted: true }),
    ])
  })

  it('creates a tombstone when removing a Claude-only project', async () => {
    const filePath = await tempProjectsFile()
    const alphaId = projectIdFromPath('/tmp/alpha')

    await removeProject({ projectId: alphaId }, filePath, [
      { id: alphaId, path: '/tmp/alpha', sessions: ['s1'], created_at: 5 },
    ])

    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      {
        id: alphaId,
        path: '/tmp/alpha',
        created_at: 5,
        deleted: true,
      },
    ])
  })

  it('edits metadata without racing a default-model save', async () => {
    const filePath = await tempProjectsFile()
    const alphaId = projectIdFromPath('/tmp/alpha')
    await writeRegisteredProjects(
      [{ id: '-tmp-alpha', path: '/tmp/alpha', created_at: 10 }],
      filePath,
    )

    await Promise.all([
      updateProject(
        {
          projectId: alphaId,
          name: 'Alpha edited',
          icon: { type: 'preset', name: 'terminal', color: 'green' },
        },
        filePath,
      ),
      setProjectDefaultModel(
        { projectId: alphaId, providerId: 'glm', modelId: 'glm-5.2[1M]' },
        filePath,
      ),
    ])

    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      expect.objectContaining({
        name: 'Alpha edited',
        icon: { type: 'preset', name: 'terminal', color: 'green' },
        default_provider_id: 'glm',
        default_model_id: 'glm-5.2[1M]',
      }),
    ])
  })

  it('saves additional directories in normalized order', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    const docsDir = path.join(tempDir!, 'docs')
    const assetsDir = path.join(tempDir!, 'assets')
    await mkdir(projectPath)
    await mkdir(docsDir)
    await mkdir(assetsDir)

    const created = await createProject(
      {
        path: projectPath,
        name: 'Alpha',
        additionalDirectories: [
          docsDir,
          path.join(docsDir, '..', 'docs'),
          projectPath,
          path.join(tempDir!, 'missing'),
          assetsDir,
        ],
      },
      filePath,
    )

    expect(created.additional_directories).toEqual([docsDir, assetsDir])
    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      expect.objectContaining({ additional_directories: [docsDir, assetsDir] }),
    ])
  })

  it('replaces additional directories when editing a project', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    const docsDir = path.join(tempDir!, 'docs')
    const assetsDir = path.join(tempDir!, 'assets')
    await mkdir(projectPath)
    await mkdir(docsDir)
    await mkdir(assetsDir)
    const created = await createProject(
      { path: projectPath, name: 'Alpha', additionalDirectories: [docsDir] },
      filePath,
    )

    const updated = await updateProject(
      { projectId: created.id, name: 'Alpha', additionalDirectories: [assetsDir] },
      filePath,
    )

    expect(updated.additional_directories).toEqual([assetsDir])
    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      expect.objectContaining({ additional_directories: [assetsDir] }),
    ])
  })

  it('clears additional directories when editing with an empty list', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    const docsDir = path.join(tempDir!, 'docs')
    await mkdir(projectPath)
    await mkdir(docsDir)
    await writeRegisteredProjects(
      [
        {
          id: projectIdFromPath(projectPath),
          path: projectPath,
          name: 'Alpha',
          created_at: 10,
          additional_directories: [docsDir],
        },
      ],
      filePath,
    )

    const updated = await updateProject(
      { projectId: projectIdFromPath(projectPath), name: 'Alpha', additionalDirectories: [] },
      filePath,
    )

    expect(updated.additional_directories).toBeUndefined()
    const [stored] = await readRegisteredProjects(filePath)
    expect(stored).not.toHaveProperty('additional_directories')
  })

  it('rejects registry entries with non-string additional directories', async () => {
    const filePath = await tempProjectsFile()
    await writeFile(
      filePath,
      JSON.stringify([
        { id: 'ok', path: '/tmp/ok', created_at: 10, additional_directories: ['/tmp/docs'] },
        { id: 'bad', path: '/tmp/bad', created_at: 10, additional_directories: ['/tmp/docs', 42] },
      ]),
      'utf8',
    )

    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      {
        id: projectIdFromPath('/tmp/ok'),
        path: '/tmp/ok',
        created_at: 10,
        additional_directories: ['/tmp/docs'],
      },
    ])
  })

  it('refuses to overwrite a corrupt registry during a mutation', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    await mkdir(projectPath)
    await writeFile(filePath, '{not json', 'utf8')

    await expect(createProject({ path: projectPath, name: 'Alpha' }, filePath)).rejects.toThrow(
      'Unable to read the project data file',
    )
    await expect(readFile(filePath, 'utf8')).resolves.toBe('{not json')
  })

  it('rejects invalid names and oversized custom icons', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    await mkdir(projectPath)

    await expect(createProject({ path: projectPath, name: '   ' }, filePath)).rejects.toThrow(
      'Project name cannot be empty',
    )
    await expect(createProject({ path: '', name: 'Alpha' }, filePath)).rejects.toThrow(
      'Select a project folder',
    )
    await expect(
      createProject(
        {
          path: projectPath,
          name: 'Alpha',
          icon: { type: 'custom', dataUrl: `data:image/png;base64,${'a'.repeat(100_001)}` },
        },
        filePath,
      ),
    ).rejects.toThrow('Project icon data is too large')
  })
})
