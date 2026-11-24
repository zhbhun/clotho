import { describe, expect, it, vi } from 'vitest'

import { type ClaudeRuntimeState } from '@/shared/claude-runtime'

import { listenDesktopEvent, requestFromDesktop } from '../services/desktop/client'
import { enableRuntimePreview } from './claude-runtime-preview'
import { createClaudeRuntimeStore } from './claude-runtime-store'

vi.mock('../services/desktop/client', () => ({
  requestFromDesktop: vi.fn(),
  listenDesktopEvent: vi.fn(async () => () => {}),
}))

const missing: ClaudeRuntimeState = {
  phase: 'missing',
  minimumVersion: '2.1.0',
  customPath: '',
  installPath: '/user/claude',
  logs: '',
}
const ready: ClaudeRuntimeState = {
  ...missing,
  phase: 'ready',
  path: '/user/claude',
  version: '2.1.0',
}

describe('temporary onboarding entry', () => {
  it('skips the initial check and waits for Next after real detection succeeds', async () => {
    vi.mocked(requestFromDesktop).mockReset().mockResolvedValue(ready)
    const store = createClaudeRuntimeStore()
    enableRuntimePreview(store)
    await store.getState().initialize()
    expect(requestFromDesktop).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({ runtime: { phase: 'missing' }, hasContinued: false })
    await store.getState().check()
    expect(requestFromDesktop).toHaveBeenCalledWith('claudeRuntimeCheck', {})
    expect(store.getState()).toMatchObject({ runtime: ready, hasContinued: false })
    store.getState().continue()
    expect(store.getState().hasContinued).toBe(true)
  })

  it('keeps real detection failures visible and retries against the system', async () => {
    vi.mocked(requestFromDesktop).mockReset().mockResolvedValue(missing)
    const store = createClaudeRuntimeStore()
    enableRuntimePreview(store)
    await store.getState().check()
    expect(store.getState().hasContinued).toBe(false)
    vi.mocked(requestFromDesktop).mockResolvedValue(ready)
    await store.getState().check()
    expect(store.getState()).toMatchObject({ runtime: ready, hasContinued: false })
  })

  it('checks before installing so a compatible installation is never replaced', async () => {
    vi.mocked(requestFromDesktop).mockReset().mockResolvedValue(ready)
    const store = createClaudeRuntimeStore()
    enableRuntimePreview(store)
    await store.getState().install()
    expect(requestFromDesktop).not.toHaveBeenCalledWith('claudeRuntimeInstall', {})
    expect(store.getState()).toMatchObject({ runtime: ready, hasContinued: false })
  })
})

describe('runtime startup and recovery', () => {
  it('keeps initial loading until the check response returns, even after a ready event', async () => {
    let finish!: (state: ClaudeRuntimeState) => void
    vi.mocked(requestFromDesktop)
      .mockReset()
      .mockImplementation((method) => {
        if (method === 'claudeRuntimeGet')
          return Promise.resolve({ ...ready, phase: 'checking' }) as never
        return new Promise((resolve) => {
          finish = resolve
        }) as never
      })
    const store = createClaudeRuntimeStore()
    const initialization = store.getState().initialize()
    await vi.waitFor(() => expect(requestFromDesktop).toHaveBeenCalledTimes(2))
    const listener = vi.mocked(listenDesktopEvent).mock.calls.at(-1)![1] as (
      runtime: ClaudeRuntimeState,
    ) => void
    listener(ready)
    expect(store.getState()).toMatchObject({ isInitializing: true, hasContinued: false })
    finish(ready)
    await initialization
    expect(store.getState()).toMatchObject({ isInitializing: false, hasContinued: true })
  })

  it('settles initial loading when detection fails so recovery remains available', async () => {
    vi.mocked(requestFromDesktop).mockReset().mockRejectedValue(new Error('IPC unavailable'))
    const store = createClaudeRuntimeStore()
    await store.getState().initialize()
    expect(store.getState()).toMatchObject({
      isInitializing: false,
      hasContinued: false,
      requestError: 'IPC unavailable',
    })
  })
  it('checks once on startup and passes an existing compatible installation automatically', async () => {
    vi.mocked(requestFromDesktop).mockReset().mockResolvedValue(ready)
    const store = createClaudeRuntimeStore()
    await Promise.all([store.getState().initialize(), store.getState().initialize()])
    expect(requestFromDesktop).toHaveBeenCalledTimes(2)
    expect(store.getState().hasContinued).toBe(true)
  })

  it('requires runtime repair before continuing, then invalidates model probe generations', async () => {
    vi.mocked(requestFromDesktop).mockReset().mockResolvedValue(missing)
    const store = createClaudeRuntimeStore()
    await store.getState().initialize()
    store.getState().continue()
    expect(store.getState().hasContinued).toBe(false)
    const listener = vi.mocked(listenDesktopEvent).mock.calls.at(-1)![1] as (
      runtime: ClaudeRuntimeState,
    ) => void
    listener(ready)
    expect(store.getState().generation).toBe(1)
    expect(store.getState().hasContinued).toBe(false)
    store.getState().continue()
    expect(store.getState().hasContinued).toBe(true)
    listener(missing)
    expect(store.getState().hasContinued).toBe(false)
    listener(ready)
    expect(store.getState().generation).toBe(2)
  })

  it('attaches a new window to an ongoing install without launching another check', async () => {
    vi.mocked(requestFromDesktop)
      .mockReset()
      .mockResolvedValue({ ...missing, phase: 'downloading' })
    const store = createClaudeRuntimeStore()
    await store.getState().initialize()
    expect(requestFromDesktop).toHaveBeenCalledTimes(1)
    expect(store.getState().hasContinued).toBe(false)
  })
})
