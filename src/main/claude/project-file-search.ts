import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type {
  ProjectFileSearchCapability,
  ProjectFileSearchEntry,
  ProjectFileSearchEntryKind,
  ProjectFileSearchListParams,
  ProjectFileSearchOutline,
  ProjectFileSearchOutlineParams,
  ProjectFileSearchParams,
  ProjectFileSearchQueryParams,
  ProjectFileSearchRanking,
  ProjectFileSearchReason,
  ProjectFileSearchResult,
  ProjectFileSearchSource,
  ProjectFileSearchStrategy,
} from '@/shared/rpc'

type CommandResult = {
  ok: boolean
  stdout: string
}

type CommandRunner = (command: string, args: string[], cwd?: string) => Promise<CommandResult>

type FffMixedSearchResult = {
  ok: true
  value: {
    items: (
      | { type: 'directory'; item: { dirName?: string; relativePath: string } }
      | { type: 'file'; item: { fileName?: string; relativePath: string } }
    )[]
    scores?: { total?: number }[]
  }
}

type FffFinderLike = {
  destroy: () => void
  mixedSearch: (
    query: string,
    options?: { pageSize?: number },
  ) => FffMixedSearchResult | { ok: false }
  waitForScan?: (timeoutMs?: number) => Promise<{ ok: boolean; value?: boolean }>
}

type ProjectFileSearchServiceOptions = {
  createFffFinder?: (projectPath: string) => FffFinderLike | Promise<FffFinderLike>
  homeDir?: string
  idleDestroyMs?: number
  runCommand?: CommandRunner
}

type WarmSession = {
  destroyTimer?: ReturnType<typeof setTimeout>
  finder?: FffFinderLike
  starting?: Promise<void>
}

const FFF_FILE_LIMIT = 50_000
const DEFAULT_LIMIT = 40
const DEFAULT_IDLE_DESTROY_MS = 60_000
const WALKER_MAX_ENTRIES = 20_000
const WALKER_MAX_DEPTH = 20
const WALKER_TIMEOUT_MS = 2_500
const SKIPPED_DIRS = new Set(['.git', 'build', 'dist', 'node_modules'])

function unsupported(
  reason: ProjectFileSearchReason,
  message: string,
  projectPath?: string,
): ProjectFileSearchCapability {
  return {
    isGit: false,
    message,
    projectPath,
    reason,
    strategy: 'none',
    supported: false,
  }
}

function unsupportedResult(
  reason: ProjectFileSearchReason,
  message: string,
  query = '',
): ProjectFileSearchResult {
  return {
    items: [],
    message,
    query,
    reason,
    supported: false,
  }
}

function normalizeRelativePath(relativePath: string) {
  return relativePath.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function directoryRelativePath(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath).replace(/\/+$/, '')
  return normalized ? `${normalized}/` : ''
}

function basename(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath).replace(/\/+$/, '')
  return normalized.split('/').filter(Boolean).at(-1) ?? normalized
}

function dirname(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath).replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function entryDisplayPath(kind: ProjectFileSearchEntryKind, relativePath: string) {
  if (kind === 'directory') return directoryRelativePath(relativePath)
  return dirname(relativePath)
}

function absolutePathFor(projectPath: string, relativePath: string) {
  return path.join(projectPath, normalizeRelativePath(relativePath).replace(/\/+$/, ''))
}

function matchRanges(relativePath: string, name: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return undefined

  const ranges = []
  const nameIndex = name.toLowerCase().indexOf(normalizedQuery)
  if (nameIndex >= 0) {
    ranges.push({
      end: nameIndex + normalizedQuery.length,
      field: 'name' as const,
      start: nameIndex,
    })
  }

  const pathIndex = relativePath.toLowerCase().indexOf(normalizedQuery)
  if (pathIndex >= 0) {
    ranges.push({
      end: pathIndex + normalizedQuery.length,
      field: 'relativePath' as const,
      start: pathIndex,
    })
  }

  return ranges.length ? ranges : undefined
}

function projectEntry({
  kind,
  projectPath,
  query = '',
  ranking,
  relativePath,
  score,
  source,
}: {
  kind: ProjectFileSearchEntryKind
  projectPath: string
  query?: string
  ranking: ProjectFileSearchRanking
  relativePath: string
  score?: number
  source: ProjectFileSearchSource
}): ProjectFileSearchEntry {
  const normalizedRelativePath =
    kind === 'directory' ? directoryRelativePath(relativePath) : normalizeRelativePath(relativePath)
  const name = basename(normalizedRelativePath)

  return {
    absolutePath: absolutePathFor(projectPath, normalizedRelativePath),
    displayPath: entryDisplayPath(kind, normalizedRelativePath),
    kind,
    matchRanges: matchRanges(normalizedRelativePath, name, query),
    name,
    ranking,
    relativePath: normalizedRelativePath,
    score,
    source,
  }
}

function splitNullList(stdout: string) {
  return stdout.split('\0').map(normalizeRelativePath).filter(Boolean)
}

function sortRootEntries(left: ProjectFileSearchEntry, right: ProjectFileSearchEntry) {
  if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
}

export function rootEntriesFromRelativePaths(
  projectPath: string,
  relativePaths: string[],
  limit = DEFAULT_LIMIT,
): ProjectFileSearchEntry[] {
  const entries = new Map<string, ProjectFileSearchEntry>()

  for (const rawPath of relativePaths) {
    const relativePath = normalizeRelativePath(rawPath)
    if (!relativePath || relativePath.startsWith('.git/')) continue

    const [firstSegment, secondSegment] = relativePath.split('/')
    if (!firstSegment) continue

    if (secondSegment) {
      const directoryPath = `${firstSegment}/`
      entries.set(
        directoryPath,
        projectEntry({
          kind: 'directory',
          projectPath,
          ranking: 'root',
          relativePath: directoryPath,
          source: 'root',
        }),
      )
    } else {
      entries.set(
        relativePath,
        projectEntry({
          kind: 'file',
          projectPath,
          ranking: 'root',
          relativePath,
          source: 'root',
        }),
      )
    }
  }

  return Array.from(entries.values()).sort(sortRootEntries).slice(0, limit)
}

function isWindowsBroadRoot(input: string) {
  return /^[a-z]:[\\/]?$/i.test(input) || /^[a-z]:[\\/]users[\\/]?$/i.test(input)
}

export function isSafeProjectSearchRoot(projectPath: string | undefined, homeDir = os.homedir()) {
  if (!projectPath?.trim()) return false
  const trimmed = projectPath.trim()
  if (trimmed === '~' || trimmed.startsWith(`~${path.sep}`)) return false
  if (isWindowsBroadRoot(trimmed)) return false

  const resolved = path.resolve(trimmed)
  const resolvedHome = path.resolve(homeDir)
  const root = path.parse(resolved).root

  if (resolved === root) return false
  if (resolved === resolvedHome) return false
  if (resolved === '/Users') return false

  return true
}

async function defaultRunCommand(
  command: string,
  args: string[],
  cwd?: string,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    proc.once('error', () => resolve({ ok: false, stdout }))
    proc.once('close', (exitCode) => resolve({ ok: exitCode === 0, stdout }))
  })
}

async function defaultCreateFffFinder(projectPath: string): Promise<FffFinderLike> {
  const { FileFinder } = await import('@ff-labs/fff-node')
  const created = FileFinder.create({ aiMode: true, basePath: projectPath })
  if (!created.ok) throw new Error(created.error)
  return created.value
}

function hasRg(runCommand: CommandRunner) {
  return runCommand('rg', ['--version']).then((result) => result.ok)
}

async function gitTrackedFiles(projectPath: string, runCommand: CommandRunner) {
  const result = await runCommand('git', ['ls-files', '-z'], projectPath)
  return result.ok ? splitNullList(result.stdout) : []
}

async function gitVisibleFiles(projectPath: string, runCommand: CommandRunner) {
  const result = await runCommand(
    'git',
    ['ls-files', '-z', '-c', '-o', '--exclude-standard'],
    projectPath,
  )
  return result.ok ? splitNullList(result.stdout) : []
}

async function rgFiles(projectPath: string, runCommand: CommandRunner) {
  const result = await runCommand(
    'rg',
    ['--files', '-0', '--hidden', '-g', '!.git', '-g', '!node_modules'],
    projectPath,
  )
  return result.ok ? splitNullList(result.stdout) : []
}

function shouldSkipDirectory(name: string) {
  if (SKIPPED_DIRS.has(name)) return true
  return name.startsWith('dist-')
}

async function readSimpleGitignore(projectPath: string) {
  try {
    const content = await fs.readFile(path.join(projectPath, '.gitignore'), 'utf8')
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) => line && !line.startsWith('#') && !line.includes('*') && !line.startsWith('!'),
      )
      .map((line) => line.replace(/\/+$/, ''))
  } catch {
    return []
  }
}

async function walkFiles(projectPath: string) {
  const startedAt = Date.now()
  const ignored = await readSimpleGitignore(projectPath)
  const files: string[] = []

  async function visit(directory: string, depth: number) {
    if (depth > WALKER_MAX_DEPTH) return
    if (files.length >= WALKER_MAX_ENTRIES) return
    if (Date.now() - startedAt > WALKER_TIMEOUT_MS) return

    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      const relativePath = normalizeRelativePath(path.relative(projectPath, absolutePath))
      const firstSegment = relativePath.split('/')[0]

      if (ignored.includes(relativePath) || ignored.includes(firstSegment)) continue
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) await visit(absolutePath, depth + 1)
      } else if (entry.isFile()) {
        files.push(relativePath)
      }
      if (files.length >= WALKER_MAX_ENTRIES) return
    }
  }

  await visit(projectPath, 0)
  return files
}

function pathSearchEntries({
  files,
  limit,
  projectPath,
  query,
  source,
}: {
  files: string[]
  limit: number
  projectPath: string
  query: string
  source: ProjectFileSearchSource
}) {
  const normalizedQuery = query.trim().toLowerCase()
  const directories = new Set<string>()
  const entries: ProjectFileSearchEntry[] = []

  for (const filePath of files) {
    const relativePath = normalizeRelativePath(filePath)
    const parts = relativePath.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(`${parts.slice(0, index).join('/')}/`)
    }
    if (relativePath.toLowerCase().includes(normalizedQuery)) {
      entries.push(
        projectEntry({
          kind: 'file',
          projectPath,
          query,
          ranking: 'path',
          relativePath,
          source,
        }),
      )
    }
  }

  for (const directory of directories) {
    if (directory.toLowerCase().includes(normalizedQuery)) {
      entries.push(
        projectEntry({
          kind: 'directory',
          projectPath,
          query,
          ranking: 'path',
          relativePath: directory,
          source,
        }),
      )
    }
  }

  return entries.slice(0, limit)
}

function fffEntries({
  mixed,
  projectPath,
  query,
}: {
  mixed: FffMixedSearchResult['value']
  projectPath: string
  query: string
}) {
  return mixed.items.map((mixedItem, index) => {
    const score = mixed.scores?.[index]?.total
    if (mixedItem.type === 'directory') {
      return projectEntry({
        kind: 'directory',
        projectPath,
        query,
        ranking: 'fuzzy',
        relativePath: mixedItem.item.relativePath,
        score,
        source: 'fff',
      })
    }

    return projectEntry({
      kind: 'file',
      projectPath,
      query,
      ranking: 'fuzzy',
      relativePath: mixedItem.item.relativePath,
      score,
      source: 'fff',
    })
  })
}

function outlineFromRelativePath(relativePath: string): ProjectFileSearchOutline {
  const normalized = normalizeRelativePath(relativePath)
  const isDirectory = normalized.endsWith('/')
  const parts = normalized.replace(/\/+$/, '').split('/').filter(Boolean)
  const nodes = parts.map((name, index) => {
    const kind: ProjectFileSearchEntryKind =
      index === parts.length - 1 && !isDirectory ? 'file' : 'directory'
    const nodeRelativePath = parts.slice(0, index + 1).join('/')
    return {
      kind,
      name,
      relativePath: kind === 'directory' ? `${nodeRelativePath}/` : nodeRelativePath,
    }
  })

  return { nodes, supported: true }
}

export function createProjectFileSearchService({
  createFffFinder = defaultCreateFffFinder,
  homeDir = os.homedir(),
  idleDestroyMs = DEFAULT_IDLE_DESTROY_MS,
  runCommand = defaultRunCommand,
}: ProjectFileSearchServiceOptions = {}) {
  const warmSessions = new Map<string, WarmSession>()

  function projectRoot(params: ProjectFileSearchParams) {
    return params.projectPath ? path.resolve(params.projectPath) : undefined
  }

  async function canSearchProjectFiles(
    params: ProjectFileSearchParams,
  ): Promise<ProjectFileSearchCapability> {
    const root = projectRoot(params)
    if (!root) {
      return unsupported(
        'missing-project',
        '@ file search is not supported in the current directory',
      )
    }
    if (!isSafeProjectSearchRoot(root, homeDir)) {
      return unsupported(
        'unsafe-root',
        '@ file search is not supported in the current directory',
        root,
      )
    }

    const gitResult = await runCommand('git', ['rev-parse', '--is-inside-work-tree'], root)
    const isGit = gitResult.ok && gitResult.stdout.trim() === 'true'
    if (isGit) {
      const trackedFiles = await gitTrackedFiles(root, runCommand)
      const strategy: ProjectFileSearchStrategy =
        trackedFiles.length <= FFF_FILE_LIMIT ? 'fff' : (await hasRg(runCommand)) ? 'rg' : 'git'
      return {
        isGit: true,
        projectPath: root,
        strategy,
        supported: true,
        trackedFileCount: trackedFiles.length,
      }
    }

    return {
      isGit: false,
      projectPath: root,
      strategy: (await hasRg(runCommand)) ? 'rg' : 'walker',
      supported: true,
    }
  }

  async function visibleProjectFiles(projectPath: string, capability: ProjectFileSearchCapability) {
    if (capability.isGit) return gitVisibleFiles(projectPath, runCommand)
    if (capability.strategy === 'rg') return rgFiles(projectPath, runCommand)
    return walkFiles(projectPath)
  }

  async function listRootEntries({
    limit = DEFAULT_LIMIT,
    ...params
  }: ProjectFileSearchListParams): Promise<ProjectFileSearchResult> {
    const capability = await canSearchProjectFiles(params)
    if (!capability.supported || !capability.projectPath) {
      return unsupportedResult(
        capability.reason ?? 'unknown',
        capability.message ?? '@ file search is not supported in the current directory',
      )
    }

    const files = await visibleProjectFiles(capability.projectPath, capability)
    return {
      items: rootEntriesFromRelativePaths(capability.projectPath, files, limit),
      query: '',
      ranking: 'root',
      source: 'root',
      supported: true,
    }
  }

  async function enterWarmup(
    params: ProjectFileSearchParams,
  ): Promise<ProjectFileSearchCapability> {
    const capability = await canSearchProjectFiles(params)
    if (!capability.supported || capability.strategy !== 'fff' || !capability.projectPath) {
      return capability
    }

    const root = capability.projectPath
    const existing = warmSessions.get(root)
    if (existing?.destroyTimer) {
      clearTimeout(existing.destroyTimer)
      existing.destroyTimer = undefined
    }
    if (existing?.finder || existing?.starting) return capability

    const session: WarmSession = {}
    warmSessions.set(root, session)
    session.starting = Promise.resolve()
      .then(async () => {
        const finder = await createFffFinder(root)
        session.finder = finder
        void finder.waitForScan?.(5_000)
      })
      .catch(() => {
        warmSessions.delete(root)
      })
      .finally(() => {
        session.starting = undefined
      })

    await session.starting
    return capability
  }

  async function exitWarmup(params: ProjectFileSearchParams) {
    const root = projectRoot(params)
    if (!root) return

    const session = warmSessions.get(root)
    if (!session) return
    if (session.destroyTimer) clearTimeout(session.destroyTimer)

    session.destroyTimer = setTimeout(() => {
      session.finder?.destroy()
      warmSessions.delete(root)
    }, idleDestroyMs)
  }

  async function search({
    limit = DEFAULT_LIMIT,
    query,
    ...params
  }: ProjectFileSearchQueryParams): Promise<ProjectFileSearchResult> {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return listRootEntries({ ...params, limit })

    const capability = await canSearchProjectFiles(params)
    if (!capability.supported || !capability.projectPath) {
      return unsupportedResult(
        capability.reason ?? 'unknown',
        capability.message ?? '@ file search is not supported in the current directory',
        trimmedQuery,
      )
    }

    const warmSession = warmSessions.get(capability.projectPath)
    if (capability.strategy === 'fff' && warmSession?.finder) {
      const mixed = warmSession.finder.mixedSearch(trimmedQuery, { pageSize: limit })
      if (mixed.ok) {
        return {
          items: fffEntries({
            mixed: mixed.value,
            projectPath: capability.projectPath,
            query: trimmedQuery,
          }),
          query: trimmedQuery,
          ranking: 'fuzzy',
          source: 'fff',
          supported: true,
        }
      }
    }

    const files =
      capability.strategy === 'rg'
        ? await rgFiles(capability.projectPath, runCommand)
        : capability.isGit
          ? await gitVisibleFiles(capability.projectPath, runCommand)
          : await walkFiles(capability.projectPath)
    const source: ProjectFileSearchSource =
      capability.strategy === 'fff'
        ? 'fallback'
        : capability.strategy === 'rg' || capability.strategy === 'git'
          ? capability.strategy
          : 'walker'

    return {
      items: pathSearchEntries({
        files,
        limit,
        projectPath: capability.projectPath,
        query: trimmedQuery,
        source,
      }),
      query: trimmedQuery,
      ranking: 'path',
      source,
      supported: true,
    }
  }

  async function getOutline(
    params: ProjectFileSearchOutlineParams,
  ): Promise<ProjectFileSearchOutline> {
    const capability = await canSearchProjectFiles(params)
    if (!capability.supported) {
      return {
        message: capability.message,
        nodes: [],
        reason: capability.reason,
        supported: false,
      }
    }

    return outlineFromRelativePath(params.relativePath)
  }

  return {
    canSearchProjectFiles,
    enterWarmup,
    exitWarmup,
    getOutline,
    listRootEntries,
    search,
  }
}

export const projectFileSearch = createProjectFileSearchService()
