// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { claudeSettingsPath, deleteHookGroup, listHookGroups, saveHookGroup } from './hooks'

let tempDir: string

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

async function makeClaudeDir(settings: Record<string, unknown>) {
  tempDir = await mkdtemp(path.join(tmpdir(), 'hooks-'))
  const claudeDir = path.join(tempDir, '.claude')
  await mkdir(claudeDir, { recursive: true })
  await writeFile(claudeSettingsPath(claudeDir), `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  return claudeDir
}

const CLI_SHAPED_SETTINGS = {
  // Non-command hook types written by the CLI must survive untouched.
  hooks: {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          { type: 'command', command: 'echo before' },
          { type: 'prompt', prompt: 'check it' },
        ],
      },
    ],
  },
  theme: 'dark',
}

describe('listHookGroups', () => {
  it('lists events with their matcher entries', async () => {
    const claudeDir = await makeClaudeDir(CLI_SHAPED_SETTINGS)
    const groups = await listHookGroups(claudeDir)
    expect(groups).toHaveLength(1)
    expect(groups[0].event).toBe('PreToolUse')
    expect(groups[0].entries[0].matcher).toBe('Bash')
    expect(groups[0].entries[0].hooks).toHaveLength(2)
  })

  it('returns empty when settings.json is missing', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'hooks-'))
    expect(await listHookGroups(path.join(tempDir, '.claude'))).toEqual([])
  })
})

describe('saveHookGroup', () => {
  it('writes a command-type group in CLI format and preserves other fields', async () => {
    const claudeDir = await makeClaudeDir(CLI_SHAPED_SETTINGS)
    await saveHookGroup(
      'Stop',
      [{ matcher: '', hooks: [{ type: 'command', command: "echo 'done'" }] }],
      claudeDir,
    )
    const saved = JSON.parse(await readFile(claudeSettingsPath(claudeDir), 'utf8'))
    expect(saved.theme).toBe('dark')
    expect(saved.hooks.Stop).toEqual([
      { matcher: '', hooks: [{ type: 'command', command: "echo 'done'" }] },
    ])
    // The CLI's prompt-type hook is untouched.
    expect(saved.hooks.PreToolUse[0].hooks[1]).toEqual({ type: 'prompt', prompt: 'check it' })
  })

  it('rejects empty command lists and non-command types', async () => {
    const claudeDir = await makeClaudeDir(CLI_SHAPED_SETTINGS)
    await expect(saveHookGroup('Stop', [{ hooks: [] }], claudeDir)).rejects.toThrow(
      /at least one command/,
    )
    await expect(
      saveHookGroup('Stop', [{ hooks: [{ type: 'prompt', prompt: 'x' } as never] }], claudeDir),
    ).rejects.toThrow(/command-type/)
  })
})

describe('deleteHookGroup', () => {
  it('removes the event when its last hook goes away, keeping the rest', async () => {
    const claudeDir = await makeClaudeDir(CLI_SHAPED_SETTINGS)
    await saveHookGroup('Stop', [{ hooks: [{ type: 'command', command: 'echo x' }] }], claudeDir)
    await deleteHookGroup('Stop', claudeDir)
    const saved = JSON.parse(await readFile(claudeSettingsPath(claudeDir), 'utf8'))
    expect(saved.hooks.Stop).toBeUndefined()
    expect(saved.hooks.PreToolUse).toBeDefined()
    expect(saved.theme).toBe('dark')
  })
})
