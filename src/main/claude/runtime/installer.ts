import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface InstallOptions {
  signal: AbortSignal
  executable?: string
  onDownload: () => void
  onOutput: (text: string) => void
}

/** Own only the installer tree, never the user's existing Claude processes. */
function stopInstaller(pid: number) {
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => {})
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      /* Already exited. */
    }
  }
}

async function runInstaller(command: string, args: string[], options: InstallOptions) {
  options.signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const abort = () => {
      if (child.pid) stopInstaller(child.pid)
    }
    options.signal.addEventListener('abort', abort, { once: true })
    child.stdout.setEncoding('utf8').on('data', options.onOutput)
    child.stderr.setEncoding('utf8').on('data', options.onOutput)
    child.once('error', reject)
    child.once('close', (code) => {
      options.signal.removeEventListener('abort', abort)
      if (options.signal.aborted) reject(new Error('Installation stopped or timed out.'))
      else if (code === 0) resolve()
      else reject(new Error(`Claude Code installer exited with code ${code}.`))
    })
  })
}

export async function installClaude(options: InstallOptions) {
  if (options.executable) {
    options.onDownload()
    await runInstaller(options.executable, ['update'], options)
    return
  }
  if (!['darwin', 'linux', 'win32'].includes(process.platform)) {
    throw new Error(
      'Automatic installation is not available on this platform. Use the installation guide.',
    )
  }
  const isWindows = process.platform === 'win32'
  const extension = isWindows ? 'ps1' : 'sh'
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'clotho-claude-install-'))
  try {
    const response = await fetch(`https://claude.ai/install.${extension}`, {
      signal: AbortSignal.any([options.signal, AbortSignal.timeout(60_000)]),
    })
    if (!response.ok)
      throw new Error(`Could not download the official installer (HTTP ${response.status}).`)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('The installer download was empty.')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 2 * 1024 * 1024) throw new Error('Installer script exceeds the download limit.')
        chunks.push(value)
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
    const script = path.join(temporary, `install.${extension}`)
    await writeFile(script, Buffer.concat(chunks))
    options.onDownload()
    options.onOutput('Official installer downloaded. Starting user-level installation.\n')
    await runInstaller(
      isWindows ? 'powershell.exe' : '/bin/bash',
      isWindows
        ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, 'latest']
        : [script, 'latest'],
      options,
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
