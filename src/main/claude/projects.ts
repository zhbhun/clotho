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
import { isNonProjectPath, isOutsideHomePath, resolvedNonProjectRoots } from './project-filter'
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
  'folder-code',
  'folder-kanban',
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
const WORK_PROJECT_NAME = 'work'
/** The built-in home project defaults to a kanban folder icon unless customized. */
const HOME_PROJECT_ICON: ProjectIcon = {
  type: 'preset',
  name: 'folder-kanban',
  color: 'neutral',
}
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

/**
 * A path holds at most two entries: the plain project and the workspace
 * (extra-directories) variant. The type is derived, never stored.
 */
export function isWorkspaceEntry(project: Pick<RegisteredProject, 'additional_directories'>) {
  return (project.additional_directories?.length ?? 0) > 0
}

/** Entries predating the digest scheme get the plain digest; existing digest ids survive. */
function trustedProjectId(storedId: string, normalizedPath: string) {
  return storedId === projectIdFromPath(normalizedPath) ||
    storedId === projectIdFromPath(normalizedPath, true)
    ? storedId
    : projectIdFromPath(normalizedPath)
}

function projectSortName(project: Pick<ClaudeProject, 'name' | 'path'>) {
  const name = project.name?.trim()
  if (name) return name
  const parts = project.path.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? project.path
}

function compareProjectsByName(
  left: Pick<ClaudeProject, 'name' | 'path'>,
  right: Pick<ClaudeProject, 'name' | 'path'>,
) {
  const byName = projectSortName(left).localeCompare(projectSortName(right), undefined, {
    sensitivity: 'base',
  })
  return byName || left.path.localeCompare(right.path, undefined, { sensitivity: 'base' })
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
    id: trustedProjectId(project.id, path.resolve(project.path)),
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

    return parsed.filter(isRegisteredProject).map((project) => ({
      ...project,
      id: trustedProjectId(project.id, path.resolve(project.path)),
    }))
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
    workspace_id: projectWorkspaceId(normalizedPath, isWorkspaceEntry(registered)),
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
  const byKey = new Map<string, ClaudeProject>()
  // Sessions only ever describe the plain folder, so discovery lands in the
  // normal bucket and a workspace entry of the same path stays separate.
  const mergeKey = (projectPath: string, isWorkspace: boolean) =>
    `${path.resolve(projectPath)}\n${isWorkspace ? 'workspace' : 'normal'}`

  for (const project of sessionProjects) {
    const normalizedPath = path.resolve(project.path)
    byKey.set(mergeKey(normalizedPath, false), { ...project, path: normalizedPath })
  }

  for (const registered of registeredProjects) {
    const normalizedPath = path.resolve(registered.path)
    const key = mergeKey(normalizedPath, isWorkspaceEntry(registered))
    if (registered.deleted) {
      byKey.delete(key)
      continue
    }
    byKey.set(key, projectFromRegistered({ ...registered, path: normalizedPath }, byKey.get(key)))
  }

  return Array.from(byKey.values()).sort(compareProjectsByName)
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
  nonProjectRootList?: string[],
  homedir = os.homedir(),
) {
  const [registeredProjects, discoveredProjects, hiddenRoots] = await Promise.all([
    readRegisteredProjectsStrict(filePath).then(canonicalizeRegisteredProjects),
    sessionProjects ?? listProjectsFromSessions(),
    nonProjectRootList ?? resolvedNonProjectRoots(),
  ])
  // Only session-discovered projects are hidden: a path the user explicitly
  // registered stays listed even inside a temp, app-managed, or non-home location.
  const visibleProjects = discoveredProjects.filter(
    (project) =>
      !isNonProjectPath(project.path, hiddenRoots) && !isOutsideHomePath(project.path, homedir),
  )
  const projects = await filterInvalidProjectPaths(
    mergeProjects(registeredProjects, visibleProjects),
  )
  rememberProjectPaths(projects)
  return projects.map((project) =>
    !project.additional_directories?.length && isSameProjectPath(project.path, homedir)
      ? { ...project, icon: project.icon ?? HOME_PROJECT_ICON, is_home: true }
      : project,
  )
}

/**
 * The homedir-backed default project owns home-mode conversations. Ensure it
 * exists and stays named `work`, reviving a tombstone and keeping any other
 * fields (icon, model defaults) the entry already carries.
 */
export async function ensureWorkProject(filePath = projectsJsonPath()) {
  const homePath = path.resolve(os.homedir())
  await updateRegisteredProjects(filePath, (projects) => {
    const existing = projects.find(
      (project) => isSameProjectPath(project.path, homePath) && !isWorkspaceEntry(project),
    )
    if (!existing) {
      projects.push({
        id: projectIdFromPath(homePath),
        path: homePath,
        name: WORK_PROJECT_NAME,
        created_at: secondsNow(),
      })
      return
    }
    existing.deleted = false
    if (!existing.name) existing.name = WORK_PROJECT_NAME
  })
}

/** The homedir is reserved for the built-in work default project. */
function assertNotHomeProjectPath(projectPath: string) {
  if (isSameProjectPath(projectPath, os.homedir())) {
    throw new Error('用户主目录已保留为默认项目 work')
  }
}

export async function registerProjectPath(projectPath: string, filePath = projectsJsonPath()) {
  const normalizedPath = await canonicalProjectPath(projectPath)
  assertNotHomeProjectPath(normalizedPath)
  const projectId = projectIdFromPath(normalizedPath)
  const now = secondsNow()
  const project = await updateRegisteredProjects(filePath, (projects) => {
    // Opening a folder registers the plain entry; the workspace variant of the
    // same path stays untouched.
    const existing = projects.find(
      (candidate) =>
        isSameProjectPath(candidate.path, normalizedPath) && !isWorkspaceEntry(candidate),
    )
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
  assertNotHomeProjectPath(normalizedPath)
  const additionalDirectories = await normalizeAdditionalDirectories(
    params.additionalDirectories,
    normalizedPath,
  )
  // The extra-directories presence decides the entry type and therefore its id.
  const isWorkspace = (additionalDirectories?.length ?? 0) > 0
  const projectId = projectIdFromPath(normalizedPath, isWorkspace)
  const now = secondsNow()

  const project = await updateRegisteredProjects(filePath, (projects) => {
    const liveConflict = projects.find(
      (candidate) =>
        !candidate.deleted &&
        isSameProjectPath(candidate.path, normalizedPath) &&
        isWorkspaceEntry(candidate) === isWorkspace,
    )
    if (liveConflict) throw new Error('该文件夹已存在相同类型的项目')
    const reusable = projects.find(
      (candidate) =>
        candidate.deleted === true &&
        isSameProjectPath(candidate.path, normalizedPath) &&
        isWorkspaceEntry(candidate) === isWorkspace,
    )
    const registered: RegisteredProject = reusable ?? {
      id: projectId,
      path: normalizedPath,
      created_at: now,
    }
    registered.id = projectId
    registered.path = normalizedPath
    registered.name = name
    registered.last_opened_at = now
    registered.deleted = false
    if (params.icon) registered.icon = params.icon
    else delete registered.icon
    if (additionalDirectories) registered.additional_directories = additionalDirectories
    else delete registered.additional_directories
    if (!reusable) projects.push(registered)
    return projectFromRegistered(registered)
  })
  projectPaths.set(project.id, project.path)
  return project
}

export async function updateProject(
  params: ClaudeUpdateProjectParams,
  filePath = projectsJsonPath(),
  sessionProjects?: ClaudeProject[],
  rebindProject?: (ids: { fromProjectId: string; toProjectId: string }) => Promise<void>,
) {
  const name = validateProjectName(params.name)
  validateProjectIcon(params.icon)
  // Set while the registry update runs, applied after the write succeeded so
  // the id references are only migrated once the new id is durable.
  let pendingRebind: { fromProjectId: string; toProjectId: string } | undefined

  const project = await updateRegisteredProjects(filePath, async (projects) => {
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
    const previousIsWorkspace = isWorkspaceEntry(registered)
    const nextIsWorkspace = (additionalDirectories?.length ?? 0) > 0
    registered.name = name
    if (params.icon) registered.icon = params.icon
    else delete registered.icon
    if (additionalDirectories) registered.additional_directories = additionalDirectories
    else delete registered.additional_directories
    if (nextIsWorkspace !== previousIsWorkspace) {
      const conflict = projects.find(
        (candidate) =>
          candidate.id !== registered!.id &&
          !candidate.deleted &&
          isSameProjectPath(candidate.path, registered!.path) &&
          isWorkspaceEntry(candidate) === nextIsWorkspace,
      )
      if (conflict) throw new Error('该文件夹已存在相同类型的项目')
      const nextId = projectIdFromPath(registered.path, nextIsWorkspace)
      if (nextId !== registered.id) {
        pendingRebind = { fromProjectId: registered.id, toProjectId: nextId }
        registered.id = nextId
      }
    }
    return projectFromRegistered(registered, sessionProject)
  })
  if (pendingRebind) await rebindProject?.(pendingRebind)
  return project
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
