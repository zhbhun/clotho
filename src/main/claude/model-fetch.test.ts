// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { fetchProviderModels } from './model-fetch'

describe('fetchProviderModels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('falls through compatible endpoints until a provider returns models', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'm1' }] }) } as Response)

    await expect(
      fetchProviderModels({ baseURL: 'https://api.x.com/anthropic', authToken: 'sk-x' }),
    ).resolves.toEqual(['m1'])
  })

  test('fails clearly after every compatible endpoint is unavailable', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)

    await expect(
      fetchProviderModels({ baseURL: 'https://api.x.com/anthropic', authToken: 'sk-x' }),
    ).rejects.toThrow(/All candidates failed/)
  })

  test('authenticates with a bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'm1' }] }),
    } as Response)

    await fetchProviderModels({ baseURL: 'https://api.x.com', authToken: 'sk-x' })

    const headers = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer sk-x')
    expect(headers.has('x-api-key')).toBe(false)
  })
})
