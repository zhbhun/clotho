// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getProviderUsage } from './provider-usage'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response
}

describe('getProviderUsage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('rejects empty tokens and unknown providers deterministically', async () => {
    await expect(
      getProviderUsage({ baseURL: 'https://api.example.com', authToken: ' ' }),
    ).resolves.toMatchObject({ success: false, error: 'API key is empty' })
    await expect(
      getProviderUsage({ baseURL: 'https://api.example.com', authToken: 'sk-x' }),
    ).resolves.toMatchObject({ success: false, error: 'Unsupported provider for quota query' })
  })

  test('does not fire requests for baseURLs outside the whitelist', async () => {
    await expect(
      getProviderUsage({ baseURL: 'https://www.packyapi.com', authToken: 'sk-x' }),
    ).resolves.toMatchObject({ success: false, error: 'Unsupported provider for quota query' })
    expect(fetch).not.toHaveBeenCalled()
  })

  test('throws on transport failure so callers can retry', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    await expect(
      getProviderUsage({ baseURL: 'https://api.kimi.com/coding', authToken: 'sk-x' }),
    ).rejects.toThrow('Network unreachable')
  })

  test('maps 401 responses to a deterministic auth failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 401))
    await expect(
      getProviderUsage({ baseURL: 'https://api.kimi.com/coding', authToken: 'bad' }),
    ).resolves.toMatchObject({ success: false, error: 'Authentication failed (HTTP 401)' })
  })

  test('parses Kimi five-hour and weekly windows', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        limits: [{ detail: { limit: 100, remaining: 30, resetTime: 1_700_000_000_000 } }],
        usage: { limit: 1000, remaining: 250, resetTime: '2026-09-21T00:00:00Z' },
      }),
    )
    await expect(
      getProviderUsage({ baseURL: 'https://api.kimi.com/coding/', authToken: 'sk-kimi' }),
    ).resolves.toEqual({
      success: true,
      windows: [
        { name: 'fiveHour', utilization: 70, resetsAt: '2023-11-14T22:13:20.000Z' },
        { name: 'weekly', utilization: 75, resetsAt: '2026-09-21T00:00:00Z' },
      ],
      queriedAt: expect.any(Number),
    })
    // The bearer token must be the API key, not the baseURL (arg-order bug).
    const request = vi.mocked(fetch).mock.calls[0]
    expect((request[1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer sk-kimi',
    })
  })

  test('parses Zhipu windows by unit and reports the plan level', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: {
          level: 'glm-4.7-plan',
          limits: [
            { type: 'TOKENS_LIMIT', unit: 6, percentage: 25, nextResetTime: 1_700_000_000 },
            { type: 'TOKENS_LIMIT', unit: 3, percentage: 50, nextResetTime: 1_700_000_100 },
          ],
        },
      }),
    )
    await expect(
      getProviderUsage({ baseURL: 'https://open.bigmodel.cn/api/anthropic', authToken: 'key' }),
    ).resolves.toEqual({
      success: true,
      planLabel: 'glm-4.7-plan',
      windows: [
        { name: 'fiveHour', utilization: 50, resetsAt: '2023-11-14T22:15:00.000Z' },
        { name: 'weekly', utilization: 25, resetsAt: '2023-11-14T22:13:20.000Z' },
      ],
      queriedAt: expect.any(Number),
    })
    // Zhipu takes the raw key without the Bearer prefix.
    const request = vi.mocked(fetch).mock.calls[0]
    expect((request[1] as RequestInit).headers).toMatchObject({ Authorization: 'key' })
  })

  test('does not mistake a Zhipu success envelope for a quota result', async () => {
    // Zhipu wraps its success payload in { success: true, data } — the exact
    // shape a naive duck-typed quota check would treat as an already-parsed
    // result, producing a quota without windows and crashing the UI.
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          limits: [{ type: 'TOKENS_LIMIT', unit: 3, percentage: 42, nextResetTime: 1_700_000_000 }],
        },
      }),
    )
    const quota = await getProviderUsage({
      baseURL: 'https://open.bigmodel.cn/api/anthropic',
      authToken: 'key',
    })
    expect(quota.success).toBe(true)
    expect(quota.windows).toEqual([
      { name: 'fiveHour', utilization: 42, resetsAt: '2023-11-14T22:13:20.000Z' },
    ])
  })

  test('sorts unclassified Zhipu entries without a unit by reset time', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        data: {
          limits: [
            { type: 'TOKENS_LIMIT', percentage: 80, nextResetTime: 1_700_000_200 },
            { type: 'TOKENS_LIMIT', percentage: 10 },
          ],
        },
      }),
    )
    const quota = await getProviderUsage({
      baseURL: 'https://api.z.ai/api/anthropic',
      authToken: 'key',
    })
    expect(quota.success).toBe(true)
    expect(quota.windows.map((window) => [window.name, window.utilization])).toEqual([
      ['fiveHour', 10],
      ['weekly', 80],
    ])
  })

  test('parses MiniMax remaining percent and skips inactive weekly buckets', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        model_remains: [
          {
            model_name: 'general',
            current_interval_remaining_percent: 40,
            end_time: 1_700_000_000_000,
            current_weekly_status: 3,
            current_weekly_remaining_percent: 100,
          },
          { model_name: 'video', current_interval_remaining_percent: 0 },
        ],
      }),
    )
    await expect(
      getProviderUsage({ baseURL: 'https://api.minimaxi.com/anthropic', authToken: 'key' }),
    ).resolves.toEqual({
      success: true,
      windows: [{ name: 'fiveHour', utilization: 60, resetsAt: '2023-11-14T22:13:20.000Z' }],
      queriedAt: expect.any(Number),
    })
  })

  test('reports DeepSeek balance with currency and availability', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '128.50' }],
      }),
    )
    await expect(
      getProviderUsage({ baseURL: 'https://api.deepseek.com/anthropic', authToken: 'key' }),
    ).resolves.toEqual({
      success: true,
      windows: [{ name: 'balance', remaining: 128.5, unit: 'CNY', utilization: 0, resetsAt: null }],
      queriedAt: expect.any(Number),
    })
    const request = vi.mocked(fetch).mock.calls[0]
    expect((request[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer key' })
  })

  test('flags an exhausted DeepSeek balance through the error channel', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        is_available: false,
        balance_infos: [{ currency: 'CNY', total_balance: 0 }],
      }),
    )
    const quota = await getProviderUsage({
      baseURL: 'https://api.deepseek.com/anthropic',
      authToken: 'key',
    })
    expect(quota.success).toBe(true)
    expect(quota.windows[0]).toMatchObject({ utilization: 100 })
    expect(quota.error).toBe('Insufficient balance')
  })

  test('computes OpenRouter remaining credits from totals', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ data: { total_credits: 50, total_usage: 12.5 } }),
    )
    await expect(
      getProviderUsage({ baseURL: 'https://openrouter.ai/api', authToken: 'key' }),
    ).resolves.toEqual({
      success: true,
      windows: [{ name: 'balance', remaining: 37.5, unit: 'USD', utilization: 0, resetsAt: null }],
      queriedAt: expect.any(Number),
    })
    const request = vi.mocked(fetch).mock.calls[0]
    expect((request[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer key' })
  })

  test('reads SiliconFlow totalBalance from the data envelope', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ code: 200, data: { totalBalance: 88 } }))
    await expect(
      getProviderUsage({ baseURL: 'https://api.siliconflow.cn', authToken: 'key' }),
    ).resolves.toEqual({
      success: true,
      windows: [{ name: 'balance', remaining: 88, unit: 'CNY', utilization: 0, resetsAt: null }],
      queriedAt: expect.any(Number),
    })
  })
})
