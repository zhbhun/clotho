import { spawn } from 'node:child_process'

import type { SpawnOptions, SpawnedProcess } from '@anthropic-ai/claude-agent-sdk'

/** Tracks the actual child exit independently of the SDK's bounded cleanup wait. */
export function createQueryProcess() {
  let exited: Promise<void> | undefined
  let stderr = ''

  return {
    spawn(options: SpawnOptions): SpawnedProcess {
      const child = spawn(options.command, options.args, {
        cwd: options.cwd,
        env: options.env,
        signal: options.signal,
        stdio: 'pipe',
        windowsHide: true,
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-16_384)
      })
      child.stderr.on('error', () => {})
      exited = new Promise<void>((resolve, reject) => {
        child.once('exit', () => resolve())
        child.on('error', (error) => {
          // A forwarded abort can emit an error before the child actually
          // exits. Only a spawn failure means there is no writer to await.
          if (child.pid === undefined) reject(error)
        })
      })
      void exited.catch(() => {})
      return child
    },
    async waitForExit() {
      await exited
    },
    stderr() {
      return stderr
    },
  }
}
