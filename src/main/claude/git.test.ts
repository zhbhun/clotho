// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { getProjectRepositoryRoot, listProjectGitBranches, switchProjectGitBranch } from './git'

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true })
    tempDir = undefined
  }
})

describe('Git project paths', () => {
  it('resolves a linked worktree to its common repository root', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clotho-git-'))
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

    await expect(getProjectRepositoryRoot(worktreePath)).resolves.toBe(repositoryPath)
  })

  it('does not treat a nested directory as a separate repository root', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'clotho-git-'))
    const repositoryPath = path.join(tempDir, 'repository')
    const nestedPath = path.join(repositoryPath, 'packages', 'client')
    await mkdir(path.join(repositoryPath, '.git'), { recursive: true })
    await mkdir(nestedPath, { recursive: true })

    await expect(getProjectRepositoryRoot(nestedPath)).resolves.toBeUndefined()
  })
})

describe('listProjectGitBranches', () => {
  it('parses local branches and marks the current one', async () => {
    const run = (command: string, args: string[]) => {
      expect(command).toBe('git')
      expect(args).toEqual([
        'for-each-ref',
        'refs/heads',
        '--format=%(HEAD)%00%(refname:short)',
        '--sort=-committerdate',
      ])
      return { status: 0, stdout: '*\0main\n \0feature/剧本大师\n', stderr: '' }
    }

    await expect(listProjectGitBranches({ projectPath: '/tmp/repo' }, run)).resolves.toEqual([
      { name: 'main', isCurrent: true },
      { name: 'feature/剧本大师', isCurrent: false },
    ])
  })

  it('returns null when git fails', async () => {
    const run = () => ({ status: 128, stdout: '', stderr: 'fatal: not a git repository' })

    await expect(listProjectGitBranches({ projectPath: '/tmp/repo' }, run)).resolves.toBeNull()
  })
})

describe('switchProjectGitBranch', () => {
  it('checks out an existing branch without the create flag', async () => {
    const run = (_command: string, args: string[]) => {
      expect(args).toEqual(['checkout', 'feature/剧本大师'])
      return { status: 0, stdout: 'Switched to branch\n', stderr: '' }
    }

    await expect(
      switchProjectGitBranch({ projectPath: '/tmp/repo', branch: ' feature/剧本大师 ' }, run),
    ).resolves.toEqual({ branch: 'feature/剧本大师', error: null })
  })

  it('creates and checks out a new branch with the create flag', async () => {
    const run = (_command: string, args: string[]) => {
      expect(args).toEqual(['checkout', '-b', 'feature/new'])
      return { status: 0, stdout: 'Switched to a new branch\n', stderr: '' }
    }

    await expect(
      switchProjectGitBranch(
        { projectPath: '/tmp/repo', branch: 'feature/new', create: true },
        run,
      ),
    ).resolves.toEqual({ branch: 'feature/new', error: null })
  })

  it('rejects names that git would parse as options without running git', async () => {
    const run = () => {
      throw new Error('git must not run for invalid branch names')
    }

    await expect(
      switchProjectGitBranch({ projectPath: '/tmp/repo', branch: '--force' }, run),
    ).resolves.toMatchObject({ branch: null })
    await expect(
      switchProjectGitBranch({ projectPath: '/tmp/repo', branch: '   ' }, run),
    ).resolves.toMatchObject({ branch: null })
  })

  it('surfaces git stderr when the checkout fails', async () => {
    const run = () => ({
      status: 1,
      stdout: '',
      stderr: 'error: Your local changes would be overwritten by checkout.\n',
    })

    await expect(
      switchProjectGitBranch({ projectPath: '/tmp/repo', branch: 'main' }, run),
    ).resolves.toEqual({
      branch: null,
      error: 'error: Your local changes would be overwritten by checkout.',
    })
  })
})
