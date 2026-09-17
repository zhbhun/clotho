import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type {
  ClaudeCreateProjectParams,
  ClaudeProject,
  ClaudeUpdateProjectParams,
  ProjectIcon,
  ProjectIconColor,
  ProjectIconName,
} from '@/shared/rpc'

import { clothoDir } from '../app-data'
import { getLogger } from '../logging/runtime'
import { getProjectRepositoryRoot, isWorktreePath } from './git'
import { listProjectsFromSessions, projectIdFromPath, projectWorkspaceId } from './sessions'

export type RegisteredProject = {
  id: string
  path: string
  name?: string
  icon?: ProjectIcon
  additional_directories?: string[]
  deleted?: boolean
  created_at: number
  last_opened_at?: number
  default_provider_id?: string
  default_model_id?: string
}

const projectPaths = new Map<string, string>()
const registryQueues = new Map<string, Promise<void>>()
const PROJECT_ICON_NAMES = new Set<ProjectIconName>([
  'book-open',
  'briefcase',
  'chart',
  'code-xml',
  'flask-conical',
  'folder',
  'globe',
  'graduation-cap',
  'heart',
  'music',
  'palette',
  'paw-print',
  'pen-tool',
  'pencil',
  'terminal',
  'wrench',
])
const PROJECT_ICON_COLORS = new Set<ProjectIconColor>([
  'neutral',
  'red',
  'orange',
  'amber',
  'green',
  'blue',
  'violet',
  'pink',
])
const MAX_CUSTOM_ICON_DATA_URL_LENGTH = 100_000
const CUSTOM_ICON_PATTERN = /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/
const logger = getLogger('projects')

export function projectsJsonPath() {
  return path.join(clothoDir(), 'projects.json')
}

function secondsNow() {
  return Math.floor(Date.now() / 1000)
}

function isSameProjectPath(left: string, right: string) {
  return path.resolve(left) === path.resolve(right)
}

function projectTime(
  project: Pick<ClaudeProject, 'created_at' | 'most_recent_session' | 'last_opened_at'>,
) {
  return project.last_opened_at ?? project.most_recent_session ?? project.created_at
}

async function canonicalProjectPath(projectPath: string) {
  const normalizedPath = path.resolve(projectPath)
  return (await getProjectRepositoryRoot(normalizedPath)) ?? normalizedPath
}

async function canonicalizeRegisteredProjects(projects: RegisteredProject[]) {
  const canonicalProjects = await Promise.all(
    projects.map(async (project) => ({
      project,
      normalizedPath: path.resolve(project.path),
      repositoryRoot: await getProjectRepositoryRoot(project.path),
    })),
  )

  return canonicalProjects
    .filter(
      ({ normalizedPath, repositoryRoot }) => repositoryRoot || !isWorktreePath(normalizedPath),
    )
    .map(({ project, normalizedPath, repositoryRoot }) => ({
      ...project,
      path: repositoryRoot ?? normalizedPath,
    }))
}

function isProjectIcon(value: unknown): value is ProjectIcon {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.type === 'preset') {
    return (
      typeof candidate.name === 'string' &&
      PROJECT_ICON_NAMES.has(candidate.name as ProjectIconName) &&
      typeof candidate.color === 'string' &&
      PROJECT_ICON_COLORS.has(candidate.color as ProjectIconColor)
    )
  }
  return (
    candidate.type === 'custom' &&
    typeof candidate.dataUrl === 'string' &&
    candidate.dataUrl.length <= MAX_CUSTOM_ICON_DATA_URL_LENGTH &&
    CUSTOM_ICON_PATTERN.test(candidate.dataUrl)
  )
}

function isRegisteredProject(value: unknown): value is RegisteredProject {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.path === 'string' &&
    typeof candidate.created_at === 'number' &&
    (candidate.name === undefined || typeof candidate.name === 'string') &&
    (candidate.icon === undefined || isProjectIcon(candidate.icon)) &&
    (candidate.additional_directories === undefined ||
      (Array.isArray(candidate.additional_directories) &&
        candidate.additional_directories.every((directory) => typeof directory === 'string'))) &&
    (candidate.deleted === undefined || typeof candidate.deleted === 'boolean') &&
    (candidate.last_opened_at === undefined || typeof candidate.last_opened_at === 'number') &&
    (candidate.default_provider_id === undefined ||
      typeof candidate.default_provider_id === 'string') &&
    (candidate.default_model_id === undefined || typeof candidate.default_model_id === 'string')
  )
}

async function readRegisteredProjectsStrict(filePath: string): Promise<RegisteredProject[]> {
  let content: string
  try {
    content = await fs.readFile(filePath, 'utf8')
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error('Unable to read the project data file', { cause: caught })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch (caught) {
    throw new Error('Unable to read the project data file', { cause: caught })
  }
  if (!Array.isArray(parsed)) throw new Error('Unable to read the project data file')

  const projects = parsed.filter(isRegisteredProject).map((project) => ({
    ...project,
    // Entries written before the digest id scheme keep their legacy id on disk.
    id: projectIdFromPath(project.path),
  }))
  if (projects.length !== parsed.length) throw new Error('Unable to read the project data file')
  return projects
}

export async function readRegisteredProjects(
  filePath = projectsJsonPath(),
): Promise<RegisteredProject[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(content) as unknown

    if (!Array.isArray(parsed)) {
      logger.warning('projects.read_failed', 'Ignored an invalid Clotho projects file', {
        filePath,
      })
      return []
    }

    return parsed
      .filter(isRegisteredProject)
      .map((project) => ({ ...project, id: projectIdFromPath(project.path) }))
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warning('projects.read_failed', 'Failed to read the Clotho projects file', {
        errorName: caught instanceof Error ? caught.name : 'Error',
        filePath,
      })
    }
    return []
  }
}

export async function writeRegisteredProjects(
  projects: RegisteredProject[],
  filePath = projectsJsonPath(),
) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(projects, null, 2)}\n`, 'utf8')
    await fs.rename(temporaryPath, filePath)
  } finally {
    await fs.unlink(temporaryPath).catch(() => {})
  }
}

function updateRegisteredProjects<T>(
  filePath: string,
  update: (projects: RegisteredProject[]) => Promise<T> | T,
): Promise<T> {
  const previous = registryQueues.get(filePath) ?? Promise.resolve()
  const result = previous
    .catch(() => {})
    .then(async () => {
      const projects = await readRegisteredProjectsStrict(filePath)
      const value = await update(projects)
      await writeRegisteredProjects(projects, filePath)
      return value
    })
  const queued = result.then(
    () => undefined,
    () => undefined,
  )
  registryQueues.set(filePath, queued)
  void queued.finally(() => {
    if (registryQueues.get(filePath) === queued) registryQueues.delete(filePath)
  })
  return result
}

function validateProjectName(name: string) {
  const normalized = name.trim()
  if (!normalized) throw new Error('Project name cannot be empty')
  if (normalized.length > 80) throw new Error('Project name cannot exceed 80 characters')
  return normalized
}

function validateProjectIcon(icon: ProjectIcon | undefined | null) {
  if (!icon) return
  if (icon.type === 'custom' && icon.dataUrl.length > MAX_CUSTOM_ICON_DATA_URL_LENGTH) {
    throw new Error('Project icon data is too large')
  }
  if (!isProjectIcon(icon)) throw new Error('Invalid project icon')
}

async function normalizeExistingDirectory(projectPath: string) {
  const candidate = projectPath.trim()
  if (!candidate) throw new Error('Select a project folder')

  const normalizedPath = path.resolve(candidate)
  let stats
  try {
    stats = await fs.stat(normalizedPath)
  } catch (caught) {
    throw new Error('Project path does not exist', { cause: caught })
  }
  if (!stats.isDirectory()) throw new Error('Project path must be a directory')
  return normalizedPath
}

/** Resolve extra directories, dropping missing, non-directory, and duplicate entries. */
async function normalizeAdditionalDirectories(
  directories: string[] | undefined,
  projectPath: string,
) {
  if (!directories?.length) return undefined
  const seen = new Set([path.resolve(projectPath)])
  const normalized: string[] = []
  for (const directory of directories) {
    const trimmed = directory.trim()
    if (!trimmed) continue
    const candidate = path.resolve(trimmed)
    if (seen.has(candidate)) continue
    try {
      if (!(await fs.stat(candidate)).isDirectory()) continue
    } catch {
      continue
    }
    seen.add(candidate)
    normalized.push(candidate)
  }
  return normalized.length ? normalized : undefined
}

function projectFromRegistered(
  registered: RegisteredProject,
  sessionProject?: ClaudeProject,
): ClaudeProject {
  const normalizedPath = path.resolve(registered.path)

  return {
    ...sessionProject,
    id: registered.id,
    workspace_id: projectWorkspaceId(normalizedPath),
    path: normalizedPath,
    sessions: sessionProject?.sessions ?? [],
    created_at: registered.created_at,
    ...(sessionProject?.most_recent_session !== undefined && {
      most_recent_session: sessionProject.most_recent_session,
    }),
    ...(registered.name !== undefined && { name: registered.name }),
    ...(registered.icon !== undefined && { icon: registered.icon }),
    ...(registered.additional_directories !== undefined && {
      additional_directories: registered.additional_directories,
    }),
    ...(registered.last_opened_at !== undefined && {
      last_opened_at: registered.last_opened_at,
    }),
    ...(registered.default_provider_id !== undefined && {
      default_provider_id: registered.default_provider_id,
    }),
    ...(registered.default_model_id !== undefined && {
      default_model_id: registered.default_model_id,
    }),
  }
}

export function mergeProjects(
  registeredProjects: RegisteredProject[],
  sessionProjects: ClaudeProject[],
): ClaudeProject[] {
  const byPath = new Map<string, ClaudeProject>()

  for (const project of sessionProjects) {
    const normalizedPath = path.resolve(project.path)
    byPath.set(normalizedPath, { ...project, path: normalizedPath })
  }

  for (const registered of registeredProjects) {
    const normalizedPath = path.resolve(registered.path)
    const existing = byPath.get(normalizedPath)
    if (registered.deleted) {
      byPath.delete(normalizedPath)
      continue
    }
    byPath.set(
      normalizedPath,
      projectFromRegistered({ ...registered, path: normalizedPath }, existing),
    )
  }

  return Array.from(byPath.values()).sort((left, right) => projectTime(right) - projectTime(left))
}

async function shouldListProject(project: ClaudeProject) {
  try {
    return (await fs.stat(project.path)).isDirectory()
  } catch (caught) {
    const code = (caught as NodeJS.ErrnoException).code
    return code !== 'ENOENT' && code !== 'ENOTDIR'
  }
}

async function filterInvalidProjectPaths(projects: ClaudeProject[]) {
  const shouldList = await Promise.all(projects.map(shouldListProject))
  return projects.filter((_, index) => shouldList[index])
}

function rememberProjectPaths(projects: ClaudeProject[]) {
  projectPaths.clear()
  for (const project of projects) {
    projectPaths.set(project.id, project.path)
  }
}

export async function listClaudeProjects(
  filePath = projectsJsonPath(),
  sessionProjects?: ClaudeProject[],
) {
  const [registeredProjects, discoveredProjects] = await Promise.all([
    readRegisteredProjectsStrict(filePath).then(canonicalizeRegisteredProjects),
    sessionProjects ?? listProjectsFromSessions(),
  ])
  const projects = await filterInvalidProjectPaths(
    mergeProjects(registeredProjects, discoveredProjects),
  )
  rememberProjectPaths(projects)
  return projects
}

export async function registerProjectPath(projectPath: string, filePath = projectsJsonPath()) {
  const normalizedPath = await canonicalProjectPath(projectPath)
  const projectId = projectIdFromPath(normalizedPath)
  const now = secondsNow()
  const project = await updateRegisteredProjects(filePath, (projects) => {
    const existing = projects.find((candidate) => isSameProjectPath(candidate.path, normalizedPath))
    if (existing) {
      existing.path = normalizedPath
      existing.last_opened_at = now
      existing.deleted = false
      return projectFromRegistered(existing)
    }
    const registered: RegisteredProject = {
      id: projectId,
      path: normalizedPath,
      created_at: now,
      last_opened_at: now,
    }
    projects.push(registered)
    return projectFromRegistered(registered)
  })
  projectPaths.set(project.id, project.path)
  return project
}

export async function createProject(
  params: ClaudeCreateProjectParams,
  filePath = projectsJsonPath(),
) {
  const name = validateProjectName(params.name)
  validateProjectIcon(params.icon)
  const normalizedPath = await canonicalProjectPath(await normalizeExistingDirectory(params.path))
  const additionalDirectories = await normalizeAdditionalDirectories(
    params.additionalDirectories,
    normalizedPath,
  )
  const now = secondsNow()

  const project = await updateRegisteredProjects(filePath, (projects) => {
    const existing = projects.find((candidate) => isSameProjectPath(candidate.path, normalizedPath))
    const registered: RegisteredProject = existing ?? {
      id: projectIdFromPath(normalizedPath),
      path: normalizedPath,
      created_at: now,
    }
    registered.path = normalizedPath
    registered.name = name
    registered.last_opened_at = now
    registered.deleted = false
    if (params.icon) registered.icon = params.icon
    else delete registered.icon
    if (additionalDirectories) registered.additional_directories = additionalDirectories
    else delete registered.additional_directories
    if (!existing) projects.push(registered)
    return projectFromRegistered(registered)
  })
  projectPaths.set(project.id, project.path)
  return project
}

export async function updateProject(
  params: ClaudeUpdateProjectParams,
  filePath = projectsJsonPath(),
  sessionProjects?: ClaudeProject[],
) {
  const name = validateProjectName(params.name)
  validateProjectIcon(params.icon)

  return updateRegisteredProjects(filePath, async (projects) => {
    let registered = projects.find((project) => project.id === params.projectId)
    let sessionProject = sessionProjects?.find((project) => project.id === params.projectId)
    if (!registered && sessionProject) {
      registered = {
        id: sessionProject.id,
        path: sessionProject.path,
        created_at: sessionProject.created_at,
      }
      projects.push(registered)
    }
    if (!registered && !sessionProjects) {
      sessionProject = (await listProjectsFromSessions()).find(
        (project) => project.id === params.projectId,
      )
      if (sessionProject) {
        registered = {
          id: sessionProject.id,
          path: sessionProject.path,
          created_at: sessionProject.created_at,
        }
        projects.push(registered)
      }
    }
    if (!registered) throw new Error('Project to edit was not found')

    const additionalDirectories = await normalizeAdditionalDirectories(
      params.additionalDirectories,
      registered.path,
    )
    registered.name = name
    if (params.icon) registered.icon = params.icon
    else delete registered.icon
    if (additionalDirectories) registered.additional_directories = additionalDirectories
    else delete registered.additional_directories
    return projectFromRegistered(registered, sessionProject)
  })
}

export async function removeProject(
  { projectId }: { projectId: string },
  filePath = projectsJsonPath(),
  sessionProjects?: ClaudeProject[],
) {
  const knownSessionProjects = sessionProjects ?? (await listProjectsFromSessions())

  await updateRegisteredProjects(filePath, (projects) => {
    const registeredIndex = projects.findIndex((project) => project.id === projectId)
    const registered = registeredIndex >= 0 ? projects[registeredIndex] : undefined
    const sessionProject = knownSessionProjects.find(
      (project) =>
        project.id === projectId ||
        (registered ? isSameProjectPath(project.path, registered.path) : false),
    )

    if (sessionProject) {
      if (registered) {
        registered.deleted = true
      } else {
        projects.push({
          id: sessionProject.id,
          path: sessionProject.path,
          created_at: sessionProject.created_at,
          deleted: true,
        })
      }
      return
    }
    if (registeredIndex >= 0) projects.splice(registeredIndex, 1)
  })
  projectPaths.delete(projectId)
}

export async function addProjectFromFolder() {
  const { showFolderPicker } = await import('../dialogs')
  const selectedPath = await showFolderPicker({ startingFolder: os.homedir() })

  if (!selectedPath) {
    return null
  }

  return registerProjectPath(selectedPath)
}

export async function selectProjectFolder({ startingFolder }: { startingFolder?: string } = {}) {
  const { showFolderPicker } = await import('../dialogs')
  const selectedPath = await showFolderPicker({
    startingFolder: startingFolder?.trim() || os.homedir(),
  })

  return selectedPath ? path.resolve(selectedPath) : null
}

export async function selectFiles({
  allowsMultipleSelection = true,
  startingFolder,
}: {
  allowsMultipleSelection?: boolean
  startingFolder?: string
} = {}) {
  const { showFilesPicker } = await import('../dialogs')
  const selectedPaths = await showFilesPicker({
    allowsMultipleSelection,
    startingFolder: startingFolder?.trim() || os.homedir(),
  })

  return selectedPaths.filter(Boolean).map((selectedPath) => path.resolve(selectedPath))
}

export async function setProjectLastOpened(
  { projectId }: { projectId: string },
  filePath = projectsJsonPath(),
) {
  const now = secondsNow()
  await updateRegisteredProjects(filePath, async (projects) => {
    const existing = projects.find((project) => project.id === projectId)
    if (existing) {
      existing.last_opened_at = now
      projectPaths.set(existing.id, existing.path)
      return
    }
    const sessionProject = (await listProjectsFromSessions()).find(
      (project) => project.id === projectId,
    )
    if (!sessionProject) return
    projects.push({
      id: sessionProject.id,
      path: sessionProject.path,
      created_at: sessionProject.created_at,
      last_opened_at: now,
    })
    projectPaths.set(sessionProject.id, sessionProject.path)
  })
}

export async function setProjectDefaultModel(
  { projectId, providerId, modelId }: { projectId: string; providerId: string; modelId: string },
  filePath = projectsJsonPath(),
) {
  await updateRegisteredProjects(filePath, async (projects) => {
    const existing = projects.find((project) => project.id === projectId)
    if (existing) {
      existing.default_provider_id = providerId
      existing.default_model_id = modelId
      return
    }
    const sessionProject = (await listProjectsFromSessions()).find(
      (project) => project.id === projectId,
    )
    if (!sessionProject) return
    projects.push({
      id: sessionProject.id,
      path: sessionProject.path,
      created_at: sessionProject.created_at,
      default_provider_id: providerId,
      default_model_id: modelId,
    })
  })
}

export async function projectPathForId(projectId: string) {
  const knownPath = projectPaths.get(projectId)
  if (knownPath) {
    return knownPath
  }

  const registeredProject = (await readRegisteredProjects()).find(
    (project) => project.id === projectId,
  )
  if (registeredProject) {
    const normalizedPath = await canonicalProjectPath(registeredProject.path)
    projectPaths.set(registeredProject.id, normalizedPath)
    return normalizedPath
  }

  const sessionProject = (await listProjectsFromSessions()).find(
    (project) => project.id === projectId,
  )
  if (sessionProject) {
    projectPaths.set(sessionProject.id, sessionProject.path)
    return sessionProject.path
  }

  throw new Error('Unknown project')
}
