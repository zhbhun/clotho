// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  deleteSubagentConfig,
  listSubagentConfigs,
  parseFrontmatter,
  saveSubagentConfig,
  serializeSubagent,
} from './subagents'

let tempDir: string

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

async function makeAgentsDir() {
  tempDir = await mkdtemp(path.join(tmpdir(), 'subagents-'))
  return tempDir
}

const SAMPLE = `---
name: code-reviewer
description: 'Reviews code for quality'
tools: Read, Grep, Glob
model: inherit
---

You are a code reviewer.
`

describe('parseFrontmatter', () => {
  it('parses the owned fields and keeps unknown raw lines', () => {
    const parsed = parseFrontmatter(SAMPLE)
    expect(parsed).not.toBeNull()
    expect(parsed?.fields).toEqual({
      name: 'code-reviewer',
      description: 'Reviews code for quality',
      tools: 'Read, Grep, Glob',
      model: 'inherit',
    })
    expect(parsed?.raw).toEqual([
      'name: code-reviewer',
      "description: 'Reviews code for quality'",
      'tools: Read, Grep, Glob',
      'model: inherit',
    ])
    expect(parsed?.body).toBe('You are a code reviewer.\n')
  })

  it('returns null when there is no frontmatter block', () => {
    expect(parseFrontmatter('just text')).toBeNull()
  })
})

describe('serializeSubagent round-trip', () => {
  it('preserves unknown frontmatter keys and patches only owned ones', () => {
    const source = `---
name: reviewer
custom-key: keep-me
description: old
---

body
`
    const parsed = parseFrontmatter(source)
    const output = serializeSubagent({
      file: 'reviewer',
      frontmatter: { name: 'reviewer', description: 'new description' },
      body: 'new body',
      rawLines: parsed?.raw,
    })
    expect(output).toBe(`---
name: 'reviewer'
custom-key: keep-me
description: 'new description'
---

new body
`)
  })
})

describe('listSubagentConfigs', () => {
  it('lists parsed files and reports unparseable ones by filename', async () => {
    const claudeDir = await makeAgentsDir()
    const agentsDir = path.join(claudeDir, 'agents')
    await mkdir(agentsDir, { recursive: true })
    await writeFile(path.join(agentsDir, 'good.md'), SAMPLE, 'utf8')
    await writeFile(path.join(agentsDir, 'broken.md'), 'no frontmatter here', 'utf8')

    const listed = await listSubagentConfigs(claudeDir)
    const names = listed.map((entry) => entry.file).sort()
    expect(names).toEqual(['broken', 'good'])
    const good = listed.find((entry) => entry.file === 'good')
    expect(good && 'fields' in good && good.fields.name).toBe('code-reviewer')
    const broken = listed.find((entry) => entry.file === 'broken')
    expect(broken && 'broken' in broken && broken.broken).toBe(true)
  })

  it('returns an empty list when the directory is missing', async () => {
    const claudeDir = await makeAgentsDir()
    await expect(listSubagentConfigs(claudeDir)).resolves.toEqual([])
  })
})

describe('saveSubagentConfig', () => {
  it('creates a new agent file with frontmatter and body', async () => {
    const claudeDir = await makeAgentsDir()
    await saveSubagentConfig(
      {
        file: 'new-agent',
        frontmatter: { name: 'new-agent', description: 'A test', model: 'sonnet' },
        body: 'Do things.',
      },
      claudeDir,
    )
    const content = await readFile(path.join(claudeDir, 'agents', 'new-agent.md'), 'utf8')
    expect(content).toBe(`---
name: 'new-agent'
description: 'A test'
model: 'sonnet'
---

Do things.
`)
  })

  it('rejects names that would escape the directory', async () => {
    const claudeDir = await makeAgentsDir()
    await expect(
      saveSubagentConfig({ file: '../escape', frontmatter: { name: 'x' }, body: '' }, claudeDir),
    ).rejects.toThrow(/Invalid subagent name/)
  })
})

describe('deleteSubagentConfig', () => {
  it('removes the agent file', async () => {
    const claudeDir = await makeAgentsDir()
    const agentsDir = path.join(claudeDir, 'agents')
    await (await import('node:fs/promises')).mkdir(agentsDir, { recursive: true })
    await writeFile(path.join(agentsDir, 'gone.md'), SAMPLE, 'utf8')
    await deleteSubagentConfig('gone', claudeDir)
    await expect(readdir(agentsDir)).resolves.toEqual([])
  })

  it('throws when the file is missing (no silent success)', async () => {
    const claudeDir = await makeAgentsDir()
    await expect(deleteSubagentConfig('missing', claudeDir)).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
