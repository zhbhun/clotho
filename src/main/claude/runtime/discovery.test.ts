// @vitest-environment node
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { discoverClaude, isSupportedClaudeVersion, parseClaudeVersion } from './discovery'

vi.mock('../../shell-env', () => ({ applyLoginShellEnv: vi.fn(async () => true) }))

let home: string
async function executable(directory: string, version: string) {
  await mkdir(directory, { recursive: true })
  const file = path.join(directory, 'claude')
  await writeFile(file, `#!/bin/sh\nprintf '%s\\n' '${version} (Claude Code)'\n`)
  await chmod(file, 0o755)
  return file
}

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'clotho-cli-discovery-'))
  vi.spyOn(os, 'homedir').mockReturnValue(home)
  vi.stubEnv('PATH', path.join(home, 'bin'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(home, { force: true, recursive: true })
})

describe('Claude discovery', () => {
  it('accepts 2.1.0 and newer without tying the minimum to the SDK patch', () => {
    expect(parseClaudeVersion('2.1.0 (Claude Code)\n')).toBe('2.1.0')
    expect(parseClaudeVersion('Unexpected output')).toBeUndefined()
    expect(isSupportedClaudeVersion('2.0.999')).toBe(false)
    expect(isSupportedClaudeVersion('2.1.0')).toBe(true)
    expect(isSupportedClaudeVersion('2.10.0')).toBe(true)
    expect(isSupportedClaudeVersion('3.0.0')).toBe(true)
  })

  it.skipIf(process.platform === 'win32')(
    'finds the native launcher even when the GUI PATH lacks it',
    async () => {
      const target = await executable(
        path.join(home, '.local/share/claude/versions/2.1.0'),
        '2.1.0',
      )
      const directory = path.join(home, '.local/bin')
      await mkdir(directory, { recursive: true })
      await symlink(target, path.join(directory, 'claude'))
      expect(await discoverClaude()).toMatchObject({
        phase: 'ready',
        source: 'native',
        version: '2.1.0',
      })
    },
  )

  it.skipIf(process.platform === 'win32')(
    'selects a compatible candidate after an old PATH installation',
    async () => {
      await executable(path.join(home, 'old'), '2.0.76')
      const file = await executable(path.join(home, 'new'), '2.1.1')
      vi.stubEnv('PATH', [path.join(home, 'old'), path.join(home, 'new')].join(path.delimiter))
      expect(await discoverClaude()).toMatchObject({ phase: 'ready', path: file })
    },
  )

  it.skipIf(process.platform === 'win32')(
    'does not silently bypass an invalid custom selection',
    async () => {
      await executable(path.join(home, 'bin'), '2.1.319')
      expect(await discoverClaude(path.join(home, 'missing'))).toMatchObject({
        phase: 'error',
        errorCode: 'ENOENT',
      })
      expect(await discoverClaude('relative/claude')).toMatchObject({
        phase: 'error',
        errorCode: 'invalid-path',
      })
    },
  )

  it.skipIf(process.platform === 'win32')(
    'distinguishes missing, non-executable and outdated installations',
    async () => {
      expect((await discoverClaude()).phase).toBe('missing')
      const file = await executable(path.join(home, 'bin'), '2.0.76')
      expect((await discoverClaude()).phase).toBe('outdated')
      await chmod(file, 0o644)
      expect(await discoverClaude()).toMatchObject({ phase: 'error', errorCode: 'EACCES' })
    },
  )
})
