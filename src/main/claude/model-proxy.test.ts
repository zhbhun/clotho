// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'

import type { ModelProvider } from '@/shared/rpc'

import { type ModelProxyServe, type ModelProxyServeOptions, createModelProxy } from './model-proxy'
import { DEFAULT_APP_PREFERENCES } from './settings'

const provider: ModelProvider = {
  id: 'zhipu',
  name: 'Zhipu',
  baseURL: 'https://open.bigmodel.cn/api/anthropic',
  authToken: 'provider-secret',
  authField: 'ANTHROPIC_AUTH_TOKEN',
  models: [{ id: 'glm-5.2/fast', displayName: 'GLM 5.2 Fast', contextWindow: 200000 }],
}

const kimiProvider: ModelProvider = {
  id: 'kimi',
  name: 'Kimi',
  baseURL: 'https://api.kimi.com/coding',
  authToken: 'kimi-secret',
  authField: 'ANTHROPIC_AUTH_TOKEN',
  models: [{ id: 'k3/long', displayName: 'K3 Long', contextWindow: 1048576 }],
}

function createServeHarness() {
  let options: ModelProxyServeOptions | undefined
  const stop = vi.fn()
  const serve: ModelProxyServe = (nextOptions) => {
    options = nextOptions
    return { port: 43123, stop }
  }

  return {
    get listenOptions() {
      return options
    },
    serve,
    stop,
    request(request: Request) {
      if (!options) throw new Error('Proxy server was not started')
      return options.fetch(request)
    },
  }
}

describe('model proxy', () => {
  test('binds only to loopback on an operating-system-assigned port', async () => {
    const harness = createServeHarness()

    await createModelProxy({
      authToken: 'local-secret',
      fetch: vi.fn(async () => Response.json({ ok: true })),
      providers: [provider],
      serve: harness.serve,
    })

    expect(harness.listenOptions).toMatchObject({
      hostname: '127.0.0.1',
      port: 0,
    })
  })

  test('routes a qualified model to its provider and restores the upstream model id', async () => {
    const harness = createServeHarness()
    const upstreamFetch = vi.fn(async (request: Request) => {
      return Response.json({ model: (await request.clone().json()).model })
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [provider],
      serve: harness.serve,
    })

    const response = await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer local-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'zhipu/glm-5.2/fast',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ model: 'glm-5.2/fast' })
    expect(upstreamFetch).toHaveBeenCalledOnce()
    const upstreamRequest = upstreamFetch.mock.calls[0]?.[0]
    expect(upstreamRequest?.url).toBe('https://open.bigmodel.cn/api/anthropic/v1/messages')
    expect(await upstreamRequest?.clone().json()).toMatchObject({
      model: 'glm-5.2/fast',
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  test('pins thinking and effort to the reasoning level configured per model', async () => {
    const harness = createServeHarness()
    const upstreamBodies: unknown[] = []
    const upstreamFetch = vi.fn(async (request: Request) => {
      upstreamBodies.push(await request.clone().json())
      return Response.json({ ok: true })
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [
        {
          ...provider,
          models: [
            { id: 'glm-default', displayName: 'GLM Default', contextWindow: 200000 },
            { id: 'glm-none', displayName: 'GLM None', contextWindow: 200000, reasoning: 'none' },
            { id: 'glm-high', displayName: 'GLM High', contextWindow: 200000, reasoning: 'high' },
            {
              id: 'glm-invalid',
              displayName: 'GLM Invalid',
              contextWindow: 200000,
              reasoning: 'turbo',
            },
          ],
        } as unknown as ModelProvider,
      ],
      serve: harness.serve,
    })

    const cases = [
      { model: 'zhipu/glm-default', output_config: { effort: 'low', format: { type: 'json' } } },
      { model: 'zhipu/glm-none', output_config: { effort: 'low' } },
      { model: 'zhipu/glm-high', output_config: { effort: 'low' } },
      { model: 'zhipu/glm-invalid', output_config: { effort: 'low' } },
    ]
    for (const body of cases) {
      await harness.request(
        new Request(`${proxy.baseURL}/v1/messages`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer local-secret',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            ...body,
            messages: [{ role: 'user', content: 'Hello' }],
            thinking: { type: 'enabled', budget_tokens: 2048 },
          }),
        }),
      )
    }

    expect(upstreamBodies).toEqual([
      {
        model: 'glm-default',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: { type: 'json' } },
      },
      {
        model: 'glm-none',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'disabled' },
      },
      {
        model: 'glm-high',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
      },
      {
        model: 'glm-invalid',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
      },
    ])
  })

  test('rejects an invalid local credential before contacting the provider', async () => {
    const harness = createServeHarness()
    const upstreamFetch = vi.fn(async () => Response.json({ ok: true }))
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [provider],
      serve: harness.serve,
    })

    const response = await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'zhipu/glm-5.2/fast', messages: [] }),
      }),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'Invalid proxy authentication',
      },
    })
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  test('replaces local credentials with the provider bearer token', async () => {
    const harness = createServeHarness()
    let upstreamHeaders: Headers | undefined
    const upstreamFetch = vi.fn(async (request: Request) => {
      upstreamHeaders = request.headers
      return Response.json({ ok: true })
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [provider],
      serve: harness.serve,
    })

    await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer local-secret',
          'content-type': 'application/json',
          host: '127.0.0.1:43123',
          'x-api-key': 'local-secret',
        },
        body: JSON.stringify({ model: 'zhipu/glm-5.2/fast', messages: [] }),
      }),
    )

    expect(upstreamHeaders?.get('authorization')).toBe('Bearer provider-secret')
    expect(upstreamHeaders?.has('x-api-key')).toBe(false)
    expect(upstreamHeaders?.has('host')).toBe(false)
    expect(upstreamHeaders?.has('content-length')).toBe(false)
  })

  test('returns a not-found error for an unknown provider', async () => {
    const harness = createServeHarness()
    const upstreamFetch = vi.fn(async () => Response.json({ ok: true }))
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [provider],
      serve: harness.serve,
    })

    const response = await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer local-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'missing/model', messages: [] }),
      }),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      type: 'error',
      error: {
        type: 'not_found_error',
        message: 'Provider not found: missing',
      },
    })
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  test('returns a not-found error for a model not configured on the provider', async () => {
    const harness = createServeHarness()
    const upstreamFetch = vi.fn(async () => Response.json({ ok: true }))
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [provider],
      serve: harness.serve,
    })

    const response = await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer local-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'zhipu/unknown', messages: [] }),
      }),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      type: 'error',
      error: {
        type: 'not_found_error',
        message: 'Model not found for provider zhipu: unknown',
      },
    })
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  test('returns a sanitized gateway error when the provider cannot be reached', async () => {
    const harness = createServeHarness()
    const upstreamFetch = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED provider-secret')
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [provider],
      serve: harness.serve,
    })

    const response = await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer local-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'zhipu/glm-5.2/fast', messages: [] }),
      }),
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      type: 'error',
      error: {
        type: 'api_error',
        message: 'Failed to connect to model provider',
      },
    })
  })

  test('passes through provider status, headers, and body without hop-by-hop headers', async () => {
    const harness = createServeHarness()
    const upstreamFetch = vi.fn(async () => {
      return new Response('event: error\ndata: {"type":"error"}\n\n', {
        status: 429,
        headers: {
          connection: 'keep-alive',
          'content-type': 'text/event-stream',
          'transfer-encoding': 'chunked',
          'x-request-id': 'upstream-request',
        },
      })
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [provider],
      serve: harness.serve,
    })

    const response = await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer local-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'zhipu/glm-5.2/fast', messages: [] }),
      }),
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('x-request-id')).toBe('upstream-request')
    expect(response.headers.has('connection')).toBe(false)
    expect(response.headers.has('transfer-encoding')).toBe(false)
    expect(await response.text()).toBe('event: error\ndata: {"type":"error"}\n\n')
  })

  test('removes stale compression headers from a decoded provider response', async () => {
    const harness = createServeHarness()
    const upstreamFetch = vi.fn(async () => {
      return new Response('data: decoded\n\n', {
        headers: {
          'content-encoding': 'gzip',
          'content-length': '128',
          'content-type': 'text/event-stream',
          'x-request-id': 'compressed-request',
        },
      })
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [provider],
      serve: harness.serve,
    })

    const response = await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer local-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'zhipu/glm-5.2/fast', messages: [] }),
      }),
    )

    expect(response.headers.has('content-encoding')).toBe(false)
    expect(response.headers.has('content-length')).toBe(false)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('x-request-id')).toBe('compressed-request')
    expect(await response.text()).toBe('data: decoded\n\n')
  })

  test('passes the provider response stream through without buffering it', async () => {
    const harness = createServeHarness()
    const upstreamStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: first\n\n'))
        controller.close()
      },
    })
    const upstreamResponse = new Response(upstreamStream, {
      headers: { 'content-type': 'text/event-stream' },
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: vi.fn(async () => upstreamResponse),
      providers: [provider],
      serve: harness.serve,
    })

    const response = await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer local-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'zhipu/glm-5.2/fast', messages: [] }),
      }),
    )

    expect(response.body).toBe(upstreamResponse.body)
  })

  test('uses a replaced provider snapshot for new requests', async () => {
    const harness = createServeHarness()
    let upstreamURL = ''
    const upstreamFetch = vi.fn(async (request: Request) => {
      upstreamURL = request.url
      return Response.json({ ok: true })
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [provider],
      serve: harness.serve,
    })
    proxy.replaceSettings({
      ...DEFAULT_APP_PREFERENCES,
      models: {},
      providers: [
        {
          ...provider,
          baseURL: 'https://replacement.example/anthropic',
          authToken: 'replacement-secret',
        },
      ],
    })

    await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer local-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'zhipu/glm-5.2/fast', messages: [] }),
      }),
    )

    expect(upstreamURL).toBe('https://replacement.example/anthropic/v1/messages')
  })

  test('replaces providers and model mappings as one settings snapshot', async () => {
    const harness = createServeHarness()
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: vi.fn(async () => Response.json({ ok: true })),
      models: { opus: 'zhipu/glm-5.2/fast' },
      providers: [provider],
      serve: harness.serve,
    })

    proxy.replaceSettings({
      ...DEFAULT_APP_PREFERENCES,
      providers: [kimiProvider],
      models: { sonnet: 'kimi/k3/long' },
    })

    expect(proxy.settingsEnv('kimi/k3/long')).toMatchObject({
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'kimi/k3/long',
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: '1048576',
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: '1048576',
    })
    expect(proxy.settingsEnv('kimi/k3/long')).not.toHaveProperty('ANTHROPIC_DEFAULT_OPUS_MODEL')
  })

  test('keeps an immutable snapshot of provider configuration', async () => {
    const harness = createServeHarness()
    let upstreamURL = ''
    const mutableProvider = {
      ...provider,
      models: provider.models.map((model) => ({ ...model })),
    }
    const upstreamFetch = vi.fn(async (request: Request) => {
      upstreamURL = request.url
      return Response.json({ ok: true })
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [mutableProvider],
      serve: harness.serve,
    })
    mutableProvider.baseURL = 'https://mutated.example'
    mutableProvider.authToken = 'mutated-secret'

    await harness.request(
      new Request(`${proxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer local-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'zhipu/glm-5.2/fast', messages: [] }),
      }),
    )

    expect(upstreamURL).toBe('https://open.bigmodel.cn/api/anthropic/v1/messages')
  })

  test('generates a fresh local credential when none is supplied', async () => {
    const firstHarness = createServeHarness()
    const secondHarness = createServeHarness()
    const upstreamFetch = vi.fn(async () => Response.json({ ok: true }))

    const first = await createModelProxy({
      fetch: upstreamFetch,
      providers: [provider],
      serve: firstHarness.serve,
    })
    const second = await createModelProxy({
      fetch: upstreamFetch,
      providers: [provider],
      serve: secondHarness.serve,
    })

    expect(first.authToken.length).toBeGreaterThanOrEqual(32)
    expect(second.authToken).not.toBe(first.authToken)
  })

  test('stops the listener and active connections', async () => {
    const harness = createServeHarness()
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: vi.fn(async () => Response.json({ ok: true })),
      providers: [provider],
      serve: harness.serve,
    })

    await proxy.stop()

    expect(harness.stop).toHaveBeenCalledWith(true)
  })
})
