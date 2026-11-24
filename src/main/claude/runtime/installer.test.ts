// @vitest-environment node
import { EventEmitter } from 'node:events'
import { access } from 'node:fs/promises'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { installClaude } from './installer'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), execFile: vi.fn() }))
vi.mock('node:child_process', () => mocks)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  mocks.spawn.mockReset()
})

describe('official installer runner', () => {
  it('downloads only the official script, executes it with fixed arguments and cleans up', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('# simulated installer'))
    vi.stubGlobal('fetch', fetch)
    mocks.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      })
      queueMicrotask(() => child.emit('close', 0))
      return child
    })
    await installClaude({
      signal: new AbortController().signal,
      onDownload: vi.fn(),
      onOutput: vi.fn(),
    })
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `https://claude.ai/install.${process.platform === 'win32' ? 'ps1' : 'sh'}`,
    )
    const [command, args] = mocks.spawn.mock.calls[0]
    expect(command).toBe(process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
    expect(args.at(-1)).toBe('latest')
    const script = args.find((arg: string) => arg.endsWith('.sh') || arg.endsWith('.ps1'))
    await expect(access(script)).rejects.toThrow()
  })

  it('never executes an unsuccessful installer download', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Unavailable', { status: 503 })),
    )
    await expect(
      installClaude({
        signal: new AbortController().signal,
        onDownload: vi.fn(),
        onOutput: vi.fn(),
      }),
    ).rejects.toThrow('HTTP 503')
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('stops the installer tree on cancellation', async () => {
    const abort = new AbortController()
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    mocks.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), {
        pid: 123456,
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      })
      queueMicrotask(() => {
        abort.abort()
        child.emit('close', null)
      })
      return child
    })
    await expect(
      installClaude({
        signal: abort.signal,
        executable: '/user/claude',
        onDownload: vi.fn(),
        onOutput: vi.fn(),
      }),
    ).rejects.toThrow('stopped')
    if (process.platform === 'win32') expect(mocks.execFile).toHaveBeenCalled()
    else expect(kill).toHaveBeenCalledWith(-123456, 'SIGKILL')
  })
})
