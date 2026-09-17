// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProviderUsageQuota } from '../services/claude/claude'
import { createProviderUsageStore } from './provider-usage-store'

vi.mock('../services/claude/claude', () => ({
  claude: { getProviderUsage: vi.fn() },
}))

const { claude } = await import('../services/claude/claude')
const getProviderUsage = vi.mocked(claude.getProviderUsage)

function quota(overrides: Partial<ProviderUsageQuota> = {}): ProviderUsageQuota {
  return { success: true, windows: [], queriedAt: 1, ...overrides }
}

const PROVIDER = { id: 'p1', baseURL: 'https://api.deepseek.com/anthropic', authToken: 'sk-1' }

describe('createProviderUsageStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('caches a successful query result by provider id', async () => {
    getProviderUsage.mockResolvedValue(
      quota({ windows: [{ name: 'weekly', utilization: 40, resetsAt: null }] }),
    )
    const store = createProviderUsageStore()

    await store.getState().refresh({ ...PROVIDER, baseURL: 'https://api.deepseek.com/anthropic' })

    expect(store.getState().usage.p1).toMatchObject({ success: true })
    expect(store.getState().pendingIds.p1).toBeUndefined()
  })

  it('never queries providers outside the usage whitelist', async () => {
    const store = createProviderUsageStore()

    await store.getState().refresh({ ...PROVIDER, baseURL: 'https://www.packyapi.com' })
    await store.getState().refreshAll([
      { ...PROVIDER, baseURL: 'https://www.packyapi.com' },
      { ...PROVIDER, id: 'p2', baseURL: 'https://www.packyapi.com' },
    ])

    expect(getProviderUsage).not.toHaveBeenCalled()
    expect(store.getState().usage.p1).toBeUndefined()
  })

  it('keeps the previous snapshot when a transient query rejects', async () => {
    getProviderUsage.mockResolvedValueOnce(quota())
    const store = createProviderUsageStore()
    await store.getState().refresh(PROVIDER)

    getProviderUsage.mockRejectedValueOnce(new Error('Network unreachable'))
    await expect(store.getState().refresh(PROVIDER)).rejects.toThrow('Network unreachable')

    expect(store.getState().usage.p1).toMatchObject({ success: true })
    expect(store.getState().pendingIds.p1).toBeUndefined()
  })

  it('coalesces duplicate refreshes while a query is in flight', async () => {
    let release!: (value: ProviderUsageQuota) => void
    getProviderUsage.mockReturnValueOnce(
      new Promise<ProviderUsageQuota>((resolve) => {
        release = resolve
      }),
    )
    const store = createProviderUsageStore()

    const first = store.getState().refresh(PROVIDER)
    const second = store.getState().refresh(PROVIDER)
    release(quota())
    await Promise.all([first, second])

    expect(getProviderUsage).toHaveBeenCalledOnce()
  })

  it('drops the cached entry when a provider is removed', async () => {
    getProviderUsage.mockResolvedValue(quota())
    const store = createProviderUsageStore()
    await store.getState().refresh(PROVIDER)

    store.getState().drop('p1')

    expect(store.getState().usage.p1).toBeUndefined()
  })

  it('refreshAll skips providers that already have a query in flight', async () => {
    const deferreds: ((value: ProviderUsageQuota) => void)[] = []
    getProviderUsage.mockImplementation(
      () =>
        new Promise<ProviderUsageQuota>((resolve) => {
          deferreds.push(resolve)
        }),
    )
    const store = createProviderUsageStore()
    const providers = [
      PROVIDER,
      { id: 'p2', baseURL: 'https://api.deepseek.com/anthropic', authToken: 'sk-2' },
    ]

    const first = store.getState().refreshAll(providers)
    const second = store.getState().refreshAll(providers)
    deferreds.forEach((resolve) => resolve(quota()))
    await Promise.all([first, second])

    expect(getProviderUsage).toHaveBeenCalledTimes(2)
  })
})
