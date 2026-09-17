// @vitest-environment node
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { DEV_SERVER_URL, getMainViewTarget } from './main-view-url'

const MAIN_DIRECTORY = path.resolve('/mock', 'main')

function bundledTarget() {
  return { kind: 'bundled', filePath: path.resolve(MAIN_DIRECTORY, '../renderer/main_window/index.html') }
}

describe('getMainViewTarget', () => {
  it('uses the bundled view without querying a dev server in normal operation', async () => {
    const fetchImpl = vi.fn()

    await expect(
      getMainViewTarget({ channel: 'stable', mainDirectory: MAIN_DIRECTORY, fetchImpl }),
    ).resolves.toEqual(bundledTarget())
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uses the dev-server URL only after the server becomes reachable', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('starting'))
      .mockResolvedValueOnce({ ok: true })

    await expect(
      getMainViewTarget({
        channel: 'dev',
        mainDirectory: MAIN_DIRECTORY,
        useDevServer: true,
        fetchImpl,
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toEqual({ kind: 'dev-server', url: DEV_SERVER_URL })
  })

  it('falls back to the bundled view when the dev server never appears', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('starting'))

    await expect(
      getMainViewTarget({
        channel: 'dev',
        mainDirectory: MAIN_DIRECTORY,
        useDevServer: true,
        fetchImpl,
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toEqual(bundledTarget())
  })
})
