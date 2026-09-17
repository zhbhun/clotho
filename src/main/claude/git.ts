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
  const result = spawnSync('git', ['branch', '--show-current'], {
    cwd: projectPath,
    encoding: 'utf8',
    windowsHide: true,
  })

  if (result.status !== 0) {
    return null
  }

  const branch = result.stdout.trim()
  return branch || null
}
