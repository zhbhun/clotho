// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  claudeWorkflowsDir,
  deleteWorkflow,
  listWorkflows,
  readWorkflow,
  renameWorkflow,
  saveWorkflow,
} from './workflows'

let tempDir: string

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

async function makeWorkflowsDir() {
  tempDir = await mkdtemp(path.join(tmpdir(), 'workflows-'))
  return tempDir
}

describe('listWorkflows', () => {
  it('lists files with last-modified time', async () => {
    const claudeDir = await makeWorkflowsDir()
    const dir = claudeWorkflowsDir(claudeDir)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'deploy.md'), '# deploy', 'utf8')
    const workflows = await listWorkflows(claudeDir)
    expect(workflows).toHaveLength(1)
    expect(workflows[0].name).toBe('deploy.md')
    expect(workflows[0].lastModifiedMs).toBeGreaterThan(0)
  })

  it('returns empty when the directory is missing', async () => {
    const claudeDir = await makeWorkflowsDir()
    await expect(listWorkflows(claudeDir)).resolves.toEqual([])
  })
})

describe('saveWorkflow / readWorkflow', () => {
  it('creates and reads back a workflow file', async () => {
    const claudeDir = await makeWorkflowsDir()
    await saveWorkflow('deploy.md', '# steps', claudeDir)
    await expect(readWorkflow('deploy.md', claudeDir)).resolves.toBe('# steps')
  })

  it('rejects names that would escape the directory', async () => {
    const claudeDir = await makeWorkflowsDir()
    await expect(saveWorkflow('../evil.md', 'x', claudeDir)).rejects.toThrow(
      /Invalid workflow name/,
    )
  })
})

describe('renameWorkflow', () => {
  it('renames without touching content', async () => {
    const claudeDir = await makeWorkflowsDir()
    await saveWorkflow('a.md', 'content', claudeDir)
    await renameWorkflow('a.md', 'b.md', claudeDir)
    await expect(readWorkflow('b.md', claudeDir)).resolves.toBe('content')
    await expect(readdir(claudeWorkflowsDir(claudeDir))).resolves.toEqual(['b.md'])
  })

  it('refuses to overwrite an existing target', async () => {
    const claudeDir = await makeWorkflowsDir()
    await saveWorkflow('a.md', 'one', claudeDir)
    await saveWorkflow('b.md', 'two', claudeDir)
    await expect(renameWorkflow('a.md', 'b.md', claudeDir)).rejects.toThrow(/already exists/)
    await expect(readWorkflow('b.md', claudeDir)).resolves.toBe('two')
  })
})

describe('deleteWorkflow', () => {
  it('removes the file', async () => {
    const claudeDir = await makeWorkflowsDir()
    await saveWorkflow('gone.md', 'x', claudeDir)
    await deleteWorkflow('gone.md', claudeDir)
    await expect(listWorkflows(claudeDir)).resolves.toEqual([])
  })
})
