import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

async function readGitDirectory(gitEntryPath: string) {
  try {
    const stats = await fs.stat(gitEntryPath)
    if (stats.isDirectory()) return { path: gitEntryPath, isWorktree: false }
    if (!stats.isFile()) return undefined

    const content = await fs.readFile(gitEntryPath, 'utf8')
    const match = content.match(/^gitdir:\s*(.+)$/m)
    return match
      ? { path: path.resolve(path.dirname(gitEntryPath), match[1].trim()), isWorktree: true }
      : undefined
  } catch {
    return undefined
  }
}

export function isWorktreePath(projectPath: string) {
  return path.basename(path.resolve(projectPath)) === 'worktree'
}

export async function getProjectRepositoryRoot(projectPath: string) {
  const originalPath = path.resolve(projectPath)
  let currentPath = originalPath

  while (true) {
    const gitEntry = await readGitDirectory(path.join(currentPath, '.git'))
    if (gitEntry) {
      if (!gitEntry.isWorktree) return currentPath === originalPath ? currentPath : undefined

      const gitDirectory = gitEntry.path
      try {
        const commonDirectory = (
          await fs.readFile(path.join(gitDirectory, 'commondir'), 'utf8')
        ).trim()
        if (commonDirectory) {
          return path.dirname(path.resolve(gitDirectory, commonDirectory))
        }
      } catch {
        // A normal repository stores its Git directory directly under its root.
      }

      return path.basename(path.dirname(gitDirectory)) === 'worktrees'
        ? path.dirname(path.dirname(path.dirname(gitDirectory)))
        : currentPath
    }

    const parentPath = path.dirname(currentPath)
    if (parentPath === currentPath) return undefined
    currentPath = parentPath
  }
}

export async function getProjectGitBranch({ projectPath }: { projectPath: string }) {
  const result = runGit(projectPath, ['branch', '--show-current'], spawnGit)
  if (result.status !== 0) {
    return null
  }

  const branch = result.stdout.trim()
  return branch || null
}

type GitCommandResult = { status: number | null; stdout: string; stderr: string }
type GitCommandRunner = (command: string, args: string[], cwd: string) => GitCommandResult

const spawnGit: GitCommandRunner = (command, args, cwd) =>
  spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true })

function runGit(projectPath: string, args: string[], run: GitCommandRunner): GitCommandResult {
  return run('git', args, projectPath)
}

export interface GitBranchRef {
  name: string
  isCurrent: boolean
}

export interface GitBranchSwitchResult {
  /** The checked out branch on success; null when the operation failed. */
  branch: string | null
  /** Git's failure detail; null on success. */
  error: string | null
}

export async function listProjectGitBranches(
  { projectPath }: { projectPath: string },
  run: GitCommandRunner = spawnGit,
) {
  const result = runGit(
    projectPath,
    ['for-each-ref', 'refs/heads', '--format=%(HEAD)%00%(refname:short)', '--sort=-committerdate'],
    run,
  )

  if (result.status !== 0) {
    return null
  }

  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [head, name = ''] = line.split('\0')
      return { name, isCurrent: head === '*' }
    })
    .filter((branch) => branch.name)
}

export async function switchProjectGitBranch(
  {
    projectPath,
    branch,
    create = false,
  }: {
    projectPath: string
    branch: string
    create?: boolean
  },
  run: GitCommandRunner = spawnGit,
): Promise<GitBranchSwitchResult> {
  const name = branch.trim()
  // A leading dash would be parsed as a git option rather than a ref name.
  if (!name || name.startsWith('-')) {
    return { branch: null, error: `Invalid branch name: ${branch}` }
  }

  const result = runGit(projectPath, create ? ['checkout', '-b', name] : ['checkout', name], run)
  if (result.status !== 0) {
    return { branch: null, error: result.stderr.trim() || `Failed to check out ${name}` }
  }

  return { branch: name, error: null }
}
