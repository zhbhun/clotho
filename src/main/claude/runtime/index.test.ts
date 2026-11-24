// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { type ClaudeRuntimeState, MIN_CLAUDE_VERSION } from '@/shared/claude-runtime'

import { createClaudeRuntime } from '.'
import type { InstallOptions } from './installer'

const missing: ClaudeRuntimeState = {
  phase: 'missing',
  minimumVersion: MIN_CLAUDE_VERSION,
  customPath: '',
  installPath: '/home/user/.local/bin/claude',
  logs: '',
}
const ready: ClaudeRuntimeState = {
  ...missing,
  phase: 'ready',
  path: process.execPath,
  version: '2.1.0',
  source: 'native',
}

function harness() {
  const discover = vi
    .fn<(path?: string) => Promise<ClaudeRuntimeState>>()
    .mockResolvedValue(missing)
  const install = vi.fn<(options: InstallOptions) => Promise<void>>().mockResolvedValue(undefined)
  const hasProcesses = vi.fn(() => false)
  const runtime = createClaudeRuntime({ discover, install, hasProcesses })
  const publish = vi.fn()
  const savePath = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined)
  runtime.configure({ publish, savePath })
  return { runtime, discover, install, hasProcesses, publish, savePath }
}

describe('Claude runtime lifecycle', () => {
  it('clears stale paths and versions when an installation disappears', async () => {
    const { runtime, discover } = harness()
    discover.mockResolvedValueOnce(ready).mockResolvedValue(missing)
    await runtime.check()
    await runtime.check()
    expect(runtime.get().phase).toBe('missing')
    expect(runtime.get().path).toBeUndefined()
    expect(runtime.get().version).toBeUndefined()
  })
  it('shares concurrent detection and never treats saved settings as proof of availability', async () => {
    const { runtime, discover } = harness()
    await Promise.all([runtime.check(), runtime.check()])
    expect(discover).toHaveBeenCalledOnce()
    await expect(runtime.executable()).rejects.toThrow('Claude Code is not ready')
  })

  it('installs once across windows, verifies and makes the new path available immediately', async () => {
    const { runtime, install, discover } = harness()
    let finish!: () => void
    install.mockImplementation(async (options) => {
      options.onDownload()
      options.onOutput('Installing\n')
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    })
    discover.mockResolvedValue(ready)
    await Promise.all([runtime.start(), runtime.start()])
    expect(install).toHaveBeenCalledOnce()
    expect(runtime.get().phase).toBe('downloading')
    await expect(runtime.executable()).rejects.toThrow('in progress')
    finish()
    await vi.waitFor(() => expect(runtime.get().phase).toBe('ready'))
    expect(await runtime.executable()).toBe(process.execPath)
  })

  it('does not trust installer success without a compatible executable', async () => {
    const { runtime } = harness()
    await runtime.start()
    await vi.waitFor(() => expect(runtime.get().phase).toBe('failed'))
    expect(runtime.get().errorCode).toBe('verification-failed')
  })

  it('keeps update retries on the existing native installation', async () => {
    const { runtime, discover, install } = harness()
    discover
      .mockResolvedValueOnce({ ...ready, phase: 'outdated', version: '2.0.76' })
      .mockResolvedValue(ready)
    install.mockRejectedValueOnce(new Error('Network unavailable'))
    await runtime.check()
    await runtime.start()
    await vi.waitFor(() => expect(runtime.get().phase).toBe('failed'))
    await runtime.start()
    await vi.waitFor(() => expect(runtime.get().phase).toBe('ready'))
    expect(install.mock.calls.map(([options]) => options.executable)).toEqual([
      process.execPath,
      process.execPath,
    ])
  })

  it.each(['native', 'other'] as const)(
    'preserves update intent for a blocked %s installation when retrying',
    async (source) => {
      const { runtime, discover, hasProcesses, install } = harness()
      discover
        .mockResolvedValueOnce({ ...ready, phase: 'outdated', version: '2.0.76', source })
        .mockResolvedValue(ready)
      await runtime.check()
      hasProcesses.mockReturnValue(true)
      await runtime.start()
      expect(runtime.get()).toMatchObject({
        phase: 'failed',
        errorCode: 'active-processes',
        operation: 'update',
      })
      expect(install).not.toHaveBeenCalled()

      hasProcesses.mockReturnValue(false)
      await runtime.start()
      if (source === 'native') {
        await vi.waitFor(() => expect(runtime.get().phase).toBe('ready'))
        expect(install).toHaveBeenCalledOnce()
        expect(install).toHaveBeenCalledWith(
          expect.objectContaining({ executable: process.execPath }),
        )
      } else {
        expect(runtime.get()).toMatchObject({ phase: 'outdated', errorCode: 'manual-update' })
        expect(install).not.toHaveBeenCalled()
      }
    },
  )

  it('protects running sessions and package-manager installations from replacement', async () => {
    const { runtime, discover, hasProcesses, install } = harness()
    hasProcesses.mockReturnValueOnce(true)
    await runtime.start()
    expect(runtime.get().errorCode).toBe('active-processes')
    discover.mockResolvedValue({ ...ready, phase: 'outdated', source: 'other' })
    await runtime.check()
    await runtime.start()
    expect(runtime.get().errorCode).toBe('manual-update')
    expect(install).not.toHaveBeenCalled()
  })

  it('persists custom selections and supports returning to automatic discovery', async () => {
    const { runtime, savePath, discover } = harness()
    await runtime.check(' /custom/claude ')
    await runtime.check('')
    expect(savePath.mock.calls).toEqual([['/custom/claude'], ['']])
    expect(discover.mock.calls).toEqual([['/custom/claude'], ['']])
  })

  it('serializes path changes and checks from other windows', async () => {
    const { runtime, discover } = harness()
    discover.mockImplementation(async (customPath = '') => ({
      ...ready,
      customPath,
      path: customPath,
    }))
    await Promise.all([
      runtime.check('/first/claude'),
      runtime.check('/second/claude'),
      runtime.check(),
    ])
    expect(runtime.get()).toMatchObject({ customPath: '/second/claude', path: '/second/claude' })
  })

  it('cancels an installer on shutdown and bounds retained output', async () => {
    const { runtime, install } = harness()
    install.mockImplementation(async ({ signal, onOutput }) => {
      onOutput('x'.repeat(100_000))
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('Stopped')), { once: true }),
      )
    })
    await runtime.start()
    expect(runtime.get().logs.length).toBe(32_768)
    await runtime.stop()
    expect(runtime.get().phase).toBe('failed')
  })
})
