import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, realpath, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { type ClaudeRuntimeState, MIN_CLAUDE_VERSION } from '@/shared/claude-runtime'

import { applyLoginShellEnv } from '../../shell-env'

export function nativeClaudePath(platform = process.platform, home = os.homedir()) {
  return path.join(home, '.local', 'bin', platform === 'win32' ? 'claude.exe' : 'claude')
}

export function parseClaudeVersion(output: string): string | undefined {
  return output.trim().match(/^(\d+\.\d+\.\d+)(?:\s|$)/)?.[1]
}

export function isSupportedClaudeVersion(version: string) {
  const [major, minor] = version.split('.').map(Number)
  return major > 2 || (major === 2 && minor >= 1)
}

export function runVersion(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      ['--version'],
      { timeout: 8_000, maxBuffer: 64 * 1024, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    )
  })
}

export async function isNativeClaude(file: string) {
  const resolved = await realpath(file)
  const directory = path.join(os.homedir(), '.local', 'share', 'claude')
  const root = await realpath(directory).catch(() => directory)
  return (
    resolved.startsWith(root + path.sep) ||
    (process.platform === 'win32' && resolved.toLowerCase() === nativeClaudePath().toLowerCase())
  )
}

export function discoveryCandidates(customPath: string, envPath: string | undefined) {
  if (customPath) return [customPath]
  const binary = process.platform === 'win32' ? 'claude.exe' : 'claude'
  return [
    ...new Set([
      ...(envPath ?? '')
        .split(path.delimiter)
        .filter((dir) => path.isAbsolute(dir))
        .map((dir) => path.join(dir, binary)),
      nativeClaudePath(),
    ]),
  ]
}

export async function discoverClaude(customPath = ''): Promise<ClaudeRuntimeState> {
  await applyLoginShellEnv()
  const base: ClaudeRuntimeState = {
    phase: 'missing',
    minimumVersion: MIN_CLAUDE_VERSION,
    customPath,
    installPath: nativeClaudePath(),
    logs: '',
  }
  if (customPath && !path.isAbsolute(customPath)) {
    return {
      ...base,
      phase: 'error',
      errorCode: 'invalid-path',
      error: 'Choose an absolute path to the Claude Code executable.',
    }
  }
  let best: ClaudeRuntimeState = base
  for (const candidate of discoveryCandidates(customPath, process.env.PATH)) {
    try {
      const file = await stat(candidate)
      if (!file.isFile()) throw new Error('The selected path is not a file.')
      await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
      const version = parseClaudeVersion(await runVersion(candidate))
      if (!version) throw new Error('Could not read the Claude Code version.')
      const found: ClaudeRuntimeState = {
        ...base,
        path: candidate,
        version,
        source: (await isNativeClaude(candidate)) ? 'native' : 'other',
        phase: isSupportedClaudeVersion(version) ? 'ready' : 'outdated',
      }
      if (found.phase === 'ready') return found
      best = found
    } catch (caught) {
      const error = caught as NodeJS.ErrnoException & { killed?: boolean }
      if (error.code === 'ENOENT' && !customPath) continue
      if (best.phase === 'outdated') continue
      best = {
        ...base,
        path: candidate,
        phase: 'error',
        errorCode: error.killed ? 'timeout' : (error.code ?? 'invalid-executable'),
        error: error.message,
      }
    }
  }
  return best
}
