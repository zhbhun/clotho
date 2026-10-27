import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { accessSync, constants as fsConstants } from 'node:fs'

const CAPTURE_PREFIX = '__CLOTHO_LOGIN_ENV_START__'
const CAPTURE_SUFFIX = '__CLOTHO_LOGIN_ENV_END__'

// A GUI process started from Finder/Dock only inherits launchd's minimal PATH.
// Capturing an interactive login shell's environment restores the user's own
// tool paths (nvm, homebrew, ~/.local/bin) for every child we spawn — the same
// approach VS Code takes with getUnixShellEnvironment.
const DARWIN_BOOTSTRAP_PATH = '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'
const LINUX_BOOTSTRAP_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

const CAPTURE_TIMEOUT_MS = 4_000
const CAPTURE_MAX_BUFFER_BYTES = 2 * 1024 * 1024

type LoginShellExecutor = (
  shellPath: string,
  shellArgs: string[],
  options: {
    env: NodeJS.ProcessEnv
    timeoutMs: number
    onOutput: (chunk: string) => void
  },
) => Promise<void>

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

export function buildShellBootstrapPath(currentPath: string | undefined): string {
  const bootstrap = process.platform === 'darwin' ? DARWIN_BOOTSTRAP_PATH : LINUX_BOOTSTRAP_PATH
  const entries = [...bootstrap.split(':'), ...(currentPath?.split(':') ?? [])].filter(Boolean)
  return Array.from(new Set(entries)).join(':')
}

function resolveShellPath(baseEnv: NodeJS.ProcessEnv): string | null {
  const candidates = [baseEnv.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh']
  for (const candidate of candidates) {
    if (candidate && isExecutableFile(candidate)) return candidate
  }
  return null
}

// zsh/bash read .zshrc/.bashrc only in interactive mode (-i) and .zprofile in
// login mode (-l); sh has no rc file worth waiting for, so plain login suffices.
function buildCaptureArgs(shellPath: string): string[] {
  const command = `printf '%s\\0' '${CAPTURE_PREFIX}'; env -0; printf '%s\\0' '${CAPTURE_SUFFIX}'`
  return shellPath.endsWith('/zsh') || shellPath.endsWith('/bash')
    ? ['-ilc', command]
    : ['-lc', command]
}

function buildCaptureEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    // The probing shell gets a minimal system PATH; the user profile replays
    // their own command paths on top of it.
    PATH: buildShellBootstrapPath(baseEnv.PATH),
    // Suppress interactive output that would pollute the captured stream.
    TERM: 'dumb',
    CI: '1',
  }
}

function killProcessTree(child: ChildProcess): void {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL')
      return
    } catch {
      // The process may already be gone; fall through to a direct kill.
    }
  }
  try {
    child.kill('SIGKILL')
  } catch {
    // Timeout and natural exit may race; nothing left to kill.
  }
}

// Login profiles may spawn descendants that inherit stdout; killing only the
// shell would leave the pipe open forever. A detached process group lets the
// deadline tear down the whole capture tree.
const defaultExecuteLoginShell: LoginShellExecutor = (shellPath, shellArgs, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(shellPath, shellArgs, {
      env: options.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
    let outputBytes = 0
    let settled = false

    const killTree = () => {
      killProcessTree(child)
      child.stdout?.destroy()
      child.stderr?.destroy()
    }
    const settle = (error?: Error) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve()
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes > CAPTURE_MAX_BUFFER_BYTES) {
        killTree()
        settle(new Error(`login shell env capture exceeded ${CAPTURE_MAX_BUFFER_BYTES} bytes`))
        return
      }
      options.onOutput(chunk.toString('utf8'))
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes > CAPTURE_MAX_BUFFER_BYTES) {
        killTree()
        settle(new Error(`login shell env capture exceeded ${CAPTURE_MAX_BUFFER_BYTES} bytes`))
      }
    })
    child.once('error', (error) => settle(error))
    child.once('close', (code, signal) => {
      if (code === 0) settle()
      else
        settle(
          new Error(
            `login shell env capture exited with code ${code ?? 'null'}, signal ${signal ?? 'none'}`,
          ),
        )
    })
    const timer = setTimeout(() => {
      killTree()
      settle(new Error(`login shell env capture timed out after ${options.timeoutMs}ms`))
    }, options.timeoutMs)
    timer.unref?.()
  })

function extractCapturedEnvSnapshot(rawOutput: string): Record<string, string> | null {
  const startMarker = `${CAPTURE_PREFIX}\0`
  const endMarker = `${CAPTURE_SUFFIX}\0`
  const startIndex = rawOutput.lastIndexOf(startMarker)
  const endIndex = rawOutput.lastIndexOf(endMarker)
  if (startIndex < 0 || endIndex <= startIndex) return null
  const result: Record<string, string> = {}
  for (const entry of rawOutput.slice(startIndex + startMarker.length, endIndex).split('\0')) {
    if (!entry) continue
    const separatorIndex = entry.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = entry.slice(0, separatorIndex).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    result[key] = entry.slice(separatorIndex + 1)
  }
  return Object.keys(result).length > 0 ? result : null
}

/** Test seam: marker parsing without spawning a shell. */
export const extractCapturedEnvSnapshotForTest = extractCapturedEnvSnapshot

let capturePromise: Promise<Record<string, string> | null> | undefined

export async function captureLoginShellEnv(
  options: {
    baseEnv?: NodeJS.ProcessEnv
    executeShell?: LoginShellExecutor
    timeoutMs?: number
  } = {},
): Promise<Record<string, string> | null> {
  const baseEnv = options.baseEnv ?? process.env
  if (process.platform === 'win32') return null

  const shellPath = resolveShellPath(baseEnv)
  if (!shellPath) return null

  let output = ''
  try {
    await (options.executeShell ?? defaultExecuteLoginShell)(
      shellPath,
      buildCaptureArgs(shellPath),
      {
        env: buildCaptureEnv(baseEnv),
        timeoutMs: options.timeoutMs ?? CAPTURE_TIMEOUT_MS,
        onOutput: (chunk) => {
          output += chunk
        },
      },
    )
  } catch {
    return null
  }
  return extractCapturedEnvSnapshot(output)
}

/**
 * Capture once per process; later callers await the same snapshot. Returns
 * null when the capture fails or times out — callers must degrade gracefully.
 */
export function loginShellEnvOnce(
  executeShell?: LoginShellExecutor,
): Promise<Record<string, string> | null> {
  capturePromise ??= captureLoginShellEnv({ executeShell }).catch(() => null)
  return capturePromise
}

/** Test seam: drop the memoized snapshot so a test captures fresh. */
export function resetLoginShellEnvForTest(): void {
  capturePromise = undefined
}

/**
 * Merge the login shell snapshot into `process.env`: PATH is replaced by the
 * captured value (the launchd PATH a GUI start provides is worthless), every
 * other key only fills gaps so caller-set variables like
 * CLAUDE_CODE_ENTRYPOINT keep precedence.
 */
export async function applyLoginShellEnv(executeShell?: LoginShellExecutor): Promise<boolean> {
  const snapshot = await loginShellEnvOnce(executeShell)
  if (!snapshot) return false
  if (snapshot.PATH) process.env.PATH = snapshot.PATH
  for (const [key, value] of Object.entries(snapshot)) {
    if (key !== 'PATH' && process.env[key] === undefined) process.env[key] = value
  }
  return true
}
