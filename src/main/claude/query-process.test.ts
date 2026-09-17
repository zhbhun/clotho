// @vitest-environment node
import { once } from 'node:events'

import { describe, expect, it } from 'vitest'

import { createQueryProcess } from './query-process'

describe('query process', () => {
  it('waits for the actual exit rather than the cancellation signal', async () => {
    const process = createQueryProcess()
    const child = process.spawn({
      command: globalThis.process.execPath,
      args: [
        '-e',
        "process.stdout.write('ready'); process.stdin.resume(); process.stdin.on('end', () => { process.stderr.write('shutdown complete'); process.exit(0) })",
      ],
      env: globalThis.process.env,
      signal: new AbortController().signal,
    })
    try {
      await once(child.stdout, 'data')
      let hasExited = false
      const exiting = process.waitForExit().then(() => {
        hasExited = true
      })
      await Promise.resolve()
      expect(hasExited).toBe(false)

      child.stdin.end()
      await exiting
      expect(hasExited).toBe(true)
      expect(child.exitCode).toBe(0)
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  })
})
