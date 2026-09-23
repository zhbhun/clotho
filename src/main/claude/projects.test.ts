// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClaudeProject } from '@/shared/rpc'

import {
  createProject,
  ensureWorkProject,
  listClaudeProjects,
  readRegisteredProjects,
  readRegisteredProjectsStrict,
  registerProjectPath,
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

    // The temp-dir fixtures sit under a non-project root outside the home
    // directory, so disable both filters.
    await expect(listClaudeProjects(filePath, undefined, [], tempDir!)).resolves.toEqual([
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

  it('hides discovered projects under non-project roots but keeps registered ones', async () => {
    const filePath = await tempProjectsFile()
    const registeredPath = path.join(tempDir!, 'registered')
    const discoveredPath = path.join(tempDir!, 'clotho-probe-XuEDrR')
    await mkdir(registeredPath)
    await mkdir(discoveredPath)
    await writeRegisteredProjects(
      [{ id: 'registered', path: registeredPath, created_at: 10 }],
      filePath,
    )
    sessionMocks.listProjects.mockResolvedValue([
      {
        id: projectIdFromPath(discoveredPath),
        workspace_id: projectWorkspaceId(discoveredPath),
        path: discoveredPath,
        sessions: ['session-1'],
        created_at: 5,
      },
      {
        id: projectIdFromPath(registeredPath),
        workspace_id: projectWorkspaceId(registeredPath),
        path: registeredPath,
        sessions: ['session-2'],
        created_at: 5,
      },
    ])

    await expect(listClaudeProjects(filePath, undefined, [tempDir!])).resolves.toEqual([
      expect.objectContaining({ path: registeredPath, sessions: [] }),
    ])
    // The same session-discovered path survives when it matches no root.
    // Entries are ordered by project name ascending.
    await expect(listClaudeProjects(filePath, undefined, [], tempDir!)).resolves.toEqual([
      expect.objectContaining({ path: discoveredPath, sessions: ['session-1'] }),
      expect.objectContaining({ path: registeredPath, sessions: ['session-2'] }),
    ])
  })

  it('hides discovered projects in the OS temp directory by default', async () => {
    const filePath = await tempProjectsFile()
    const probePath = path.join(tempDir!, 'clotho-probe-JtNBiZ')
    await mkdir(probePath)
    sessionMocks.listProjects.mockResolvedValue([
      {
        id: projectIdFromPath(probePath),
        workspace_id: projectWorkspaceId(probePath),
        path: probePath,
        sessions: ['session-1'],
        created_at: 5,
      },
    ])

    await expect(listClaudeProjects(filePath)).resolves.toEqual([])
  })

  it('hides discovered projects outside the home directory but keeps registered ones', async () => {
    const filePath = await tempProjectsFile()
    const insidePath = path.join(tempDir!, 'inside')
    const outsidePath = os.tmpdir()
    await mkdir(insidePath)
    await writeRegisteredProjects([{ id: 'outside', path: outsidePath, created_at: 10 }], filePath)
    sessionMocks.listProjects.mockResolvedValue([
      {
        id: projectIdFromPath(insidePath),
        workspace_id: projectWorkspaceId(insidePath),
        path: insidePath,
        sessions: ['session-1'],
        created_at: 5,
      },
      {
        id: projectIdFromPath(outsidePath),
        workspace_id: projectWorkspaceId(outsidePath),
        path: outsidePath,
        sessions: ['session-2'],
        created_at: 5,
      },
    ])

    // Entries are ordered by project name ascending.
    await expect(listClaudeProjects(filePath, undefined, [], tempDir!)).resolves.toEqual([
      expect.objectContaining({ path: insidePath, sessions: ['session-1'] }),
      expect.objectContaining({ path: outsidePath, sessions: [] }),
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
        icon: { type: 'emoji', char: '📁' },
      },
      filePath,
    )

    expect(project).toMatchObject({
      name: 'Alpha restored',
      icon: { type: 'emoji', char: '📁' },
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
          icon: { type: 'emoji', char: '🚀' },
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
        icon: { type: 'emoji', char: '🚀' },
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

  it('keeps a plain project and a workspace project of the same folder separate', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    const docsDir = path.join(tempDir!, 'docs')
    await mkdir(projectPath)
    await mkdir(docsDir)

    const plain = await createProject({ path: projectPath, name: 'Alpha' }, filePath)
    const workspace = await createProject(
      { path: projectPath, name: 'Alpha workspace', additionalDirectories: [docsDir] },
      filePath,
    )

    expect(plain.id).toBe(projectIdFromPath(projectPath))
    expect(workspace.id).toBe(projectIdFromPath(projectPath, true))
    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      expect.objectContaining({ id: plain.id, name: 'Alpha' }),
      expect.objectContaining({
        id: workspace.id,
        name: 'Alpha workspace',
        additional_directories: [docsDir],
      }),
    ])
  })

  it('rejects creating a second project of the same type for one folder', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    const docsDir = path.join(tempDir!, 'docs')
    await mkdir(projectPath)
    await mkdir(docsDir)

    await createProject({ path: projectPath, name: 'Alpha' }, filePath)
    await expect(
      createProject({ path: projectPath, name: 'Alpha again' }, filePath),
    ).rejects.toThrow('该文件夹已存在相同类型的项目')

    await createProject(
      { path: projectPath, name: 'Alpha ws', additionalDirectories: [docsDir] },
      filePath,
    )
    await expect(
      createProject(
        { path: projectPath, name: 'Alpha ws 2', additionalDirectories: [docsDir] },
        filePath,
      ),
    ).rejects.toThrow('该文件夹已存在相同类型的项目')
  })

  it('lists a registered workspace project next to the discovered folder project', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    const docsDir = path.join(tempDir!, 'docs')
    await mkdir(projectPath)
    await mkdir(docsDir)
    await writeRegisteredProjects(
      [
        {
          id: projectIdFromPath(projectPath, true),
          path: projectPath,
          name: 'Alpha ws',
          created_at: 10,
          additional_directories: [docsDir],
        },
      ],
      filePath,
    )
    sessionMocks.listProjects.mockResolvedValue([
      {
        id: projectIdFromPath(projectPath),
        workspace_id: projectWorkspaceId(projectPath),
        path: projectPath,
        sessions: ['session-1'],
        created_at: 5,
      },
    ])

    const projects = await listClaudeProjects(filePath, undefined, [], tempDir!)
    expect(projects.map((project) => project.id)).toEqual([
      projectIdFromPath(projectPath),
      projectIdFromPath(projectPath, true),
    ])
    expect(projects[1].additional_directories).toEqual([docsDir])
  })

  it('recomputes the id and rebinds references when an edit changes the entry type', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    const docsDir = path.join(tempDir!, 'docs')
    await mkdir(projectPath)
    await mkdir(docsDir)
    await writeRegisteredProjects(
      [{ id: projectIdFromPath(projectPath), path: projectPath, name: 'Alpha', created_at: 10 }],
      filePath,
    )
    const rebind = vi.fn()

    const updated = await updateProject(
      {
        projectId: projectIdFromPath(projectPath),
        name: 'Alpha',
        additionalDirectories: [docsDir],
      },
      filePath,
      undefined,
      rebind,
    )

    const workspaceId = projectIdFromPath(projectPath, true)
    expect(updated.id).toBe(workspaceId)
    expect(updated.additional_directories).toEqual([docsDir])
    expect(rebind).toHaveBeenCalledWith({
      fromProjectId: projectIdFromPath(projectPath),
      toProjectId: workspaceId,
    })
    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      expect.objectContaining({ id: workspaceId, additional_directories: [docsDir] }),
    ])
  })

  it('rejects an edit that would duplicate the other entry type of the folder', async () => {
    const filePath = await tempProjectsFile()
    const projectPath = path.join(tempDir!, 'alpha')
    const docsDir = path.join(tempDir!, 'docs')
    await mkdir(projectPath)
    await mkdir(docsDir)
    await writeRegisteredProjects(
      [
        { id: projectIdFromPath(projectPath), path: projectPath, name: 'Alpha', created_at: 10 },
        {
          id: projectIdFromPath(projectPath, true),
          path: projectPath,
          name: 'Alpha ws',
          created_at: 11,
          additional_directories: [docsDir],
        },
      ],
      filePath,
    )

    await expect(
      updateProject(
        {
          projectId: projectIdFromPath(projectPath),
          name: 'Alpha',
          additionalDirectories: [docsDir],
        },
        filePath,
      ),
    ).rejects.toThrow('该文件夹已存在相同类型的项目')
    // Clearing the workspace entry's directories would collide with the plain entry too.
    await expect(
      updateProject(
        {
          projectId: projectIdFromPath(projectPath, true),
          name: 'Alpha ws',
          additionalDirectories: [],
        },
        filePath,
      ),
    ).rejects.toThrow('该文件夹已存在相同类型的项目')
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
    await expect(
      createProject(
        { path: projectPath, name: 'Alpha', icon: { type: 'emoji', char: 'not emoji' } },
        filePath,
      ),
    ).rejects.toThrow('Invalid project icon')
  })

  it('keeps preset icons and drops unrecognized icon shapes when loading', async () => {
    const filePath = await tempProjectsFile()
    await writeFile(
      filePath,
      `${JSON.stringify([
        {
          id: projectIdFromPath('/tmp/alpha'),
          path: '/tmp/alpha',
          created_at: 10,
          icon: { type: 'preset', name: 'folder', color: 'blue' },
        },
        {
          id: projectIdFromPath('/tmp/beta'),
          path: '/tmp/beta',
          created_at: 11,
          icon: { type: 'glyph', name: 'mystery' },
        },
      ])}\n`,
      'utf8',
    )

    const expected = [
      expect.objectContaining({
        path: '/tmp/alpha',
        icon: { type: 'preset', name: 'folder', color: 'blue' },
      }),
      expect.objectContaining({ path: '/tmp/beta', icon: undefined }),
    ]
    await expect(readRegisteredProjects(filePath)).resolves.toEqual(expected)
    await expect(readRegisteredProjectsStrict(filePath)).resolves.toEqual(expected)
  })
})

describe('work default project', () => {
  it('registers the homedir as the work project when no entry exists', async () => {
    const filePath = await tempProjectsFile()
    const homePath = path.resolve(os.homedir())

    await ensureWorkProject(filePath)

    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      {
        id: projectIdFromPath(homePath),
        path: homePath,
        name: 'work',
        created_at: expect.any(Number),
      },
    ])
  })

  it('fills in the work name on an existing homedir entry without touching other fields', async () => {
    const filePath = await tempProjectsFile()
    const homePath = path.resolve(os.homedir())
    await writeRegisteredProjects(
      [
        {
          id: projectIdFromPath(homePath),
          path: homePath,
          created_at: 10,
          last_opened_at: 20,
        },
      ],
      filePath,
    )

    await ensureWorkProject(filePath)

    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      {
        id: projectIdFromPath(homePath),
        path: homePath,
        name: 'work',
        created_at: 10,
        last_opened_at: 20,
        deleted: false,
      },
    ])
  })

  it('revives a deleted homedir entry', async () => {
    const filePath = await tempProjectsFile()
    const homePath = path.resolve(os.homedir())
    await writeRegisteredProjects(
      [
        {
          id: projectIdFromPath(homePath),
          path: homePath,
          name: 'work',
          created_at: 10,
          deleted: true,
        },
      ],
      filePath,
    )

    await ensureWorkProject(filePath)

    await expect(readRegisteredProjects(filePath)).resolves.toEqual([
      expect.objectContaining({ id: projectIdFromPath(homePath), deleted: false, name: 'work' }),
    ])
  })

  it('rejects creating or registering the homedir as a regular project', async () => {
    const filePath = await tempProjectsFile()

    await expect(createProject({ path: os.homedir(), name: 'Home' }, filePath)).rejects.toThrow(
      '用户主目录已保留为默认项目 work',
    )
    await expect(registerProjectPath(os.homedir(), filePath)).rejects.toThrow(
      '用户主目录已保留为默认项目 work',
    )
  })

  it('marks the plain homedir entry as the home project in listings', async () => {
    const filePath = await tempProjectsFile()
    const otherPath = path.join(tempDir!, 'other')
    await mkdir(otherPath)
    await writeRegisteredProjects(
      [
        { id: projectIdFromPath(os.homedir()), path: path.resolve(os.homedir()), created_at: 10 },
        { id: projectIdFromPath(otherPath), path: otherPath, created_at: 11 },
      ],
      filePath,
    )

    const projects = await listClaudeProjects(filePath)
    expect(projects.find((project) => project.id === projectIdFromPath(otherPath))?.is_home).toBe(
      undefined,
    )
    expect(
      projects.find((project) => project.id === projectIdFromPath(path.resolve(os.homedir())))
        ?.is_home,
    ).toBe(true)
    expect(
      projects.find((project) => project.id === projectIdFromPath(path.resolve(os.homedir())))
        ?.icon,
    ).toEqual({ type: 'preset', name: 'folder-kanban', color: 'neutral' })
  })
})
