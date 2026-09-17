import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Resolves the Claude Code CLI binary shipped inside the Agent SDK's
 * per-platform package.
 *
 * When the app runs from an asar archive, spawn() cannot execute files inside
 * the archive, so the unpacked copy under `app.asar.unpacked` is preferred.
 * During development the plain project `node_modules` path is used.
 */
export function resolveClaudeCodeBinary(
  mainDirectory = __dirname,
  exists = existsSync,
): string | undefined {
  const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude'
  const suffix = `${process.platform}-${process.arch}`
  const packagedBinaryPath = path.join(
    mainDirectory,
    '..',
    '..',
    'node_modules',
    '@anthropic-ai',
    `claude-agent-sdk-${suffix}`,
    binaryName,
  )
  const unpackedBinaryPath = packagedBinaryPath
    .split(`${path.sep}app.asar${path.sep}`)
    .join(`${path.sep}app.asar.unpacked${path.sep}`)

  if (exists(unpackedBinaryPath)) return unpackedBinaryPath
  if (exists(packagedBinaryPath)) return packagedBinaryPath
  return undefined
}
