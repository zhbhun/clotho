// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { getProjectRepositoryRoot } from './git'

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
