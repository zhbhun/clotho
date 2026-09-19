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
  models: [{ id: 'glm-5.2/fast', displayName: 'GLM 5.2 Fast', contextWindow: 200000 }],
}

const kimiProvider: ModelProvider = {
  id: 'kimi',
  name: 'Kimi',
  baseURL: 'https://api.kimi.com/coding',
  authToken: 'kimi-secret',
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

  test('honors the claude effort within the support set and falls back to the default level', async () => {
    const harness = createServeHarness()
    const upstreamBodies: Record<string, unknown>[] = []
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
            {
              id: 'tiered',
              displayName: 'Tiered',
              contextWindow: 200000,
              thinkingLevel: 'high',
              thinkingPresetId: 'glm-5-3',
            },
            {
              id: 'switchable',
              displayName: 'Switchable',
              contextWindow: 200000,
              thinkingLevel: 'on',
              thinkingPresetId: 'kimi-k2-6',
            },
            { id: 'pinned', displayName: 'Pinned', contextWindow: 200000, thinkingLevel: 'low' },
          ],
        },
      ],
      serve: harness.serve,
    })

    const cases = [
      { model: 'zhipu/tiered', output_config: { effort: 'low', format: { type: 'json' } } },
      { model: 'zhipu/tiered', output_config: { effort: 'medium' } },
      { model: 'zhipu/tiered' },
      { model: 'zhipu/tiered', output_config: { effort: 'high' }, thinking: { type: 'disabled' } },
      { model: 'zhipu/switchable', output_config: { effort: 'xhigh' } },
      { model: 'zhipu/switchable', thinking: { type: 'disabled' } },
      { model: 'zhipu/pinned', output_config: { effort: 'xhigh' } },
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
          }),
        }),
      )
    }

    expect(upstreamBodies).toEqual([
      {
        model: 'tiered',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'enabled' },
        output_config: { effort: 'low', format: { type: 'json' } },
      },
      {
        model: 'tiered',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'enabled' },
        output_config: { effort: 'high' },
      },
      {
        model: 'tiered',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'enabled' },
        output_config: { effort: 'high' },
      },
      {
        model: 'tiered',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'enabled' },
        output_config: { effort: 'high' },
      },
      {
        model: 'switchable',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'enabled' },
      },
      {
        model: 'switchable',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'disabled' },
      },
      {
        model: 'pinned',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'enabled' },
        output_config: { effort: 'low' },
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

  test('derives the session thinking from the linked reasoning preset', async () => {
    const harness = createServeHarness()
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: vi.fn(async () => Response.json({ ok: true })),
      providers: [
        {
          ...provider,
          models: [
            {
              id: 'tiered',
              displayName: 'Tiered',
              contextWindow: 200000,
              thinkingLevel: 'max',
              thinkingPresetId: 'glm-5-3',
            },
            {
              id: 'switch-off',
              displayName: 'Switch Off',
              contextWindow: 200000,
              thinkingLevel: 'off',
              thinkingPresetId: 'glm-5-2',
            },
            { id: 'plain', displayName: 'Plain', contextWindow: 200000 },
            {
              id: 'switched-off',
              displayName: 'Switched Off',
              contextWindow: 200000,
              thinkingLevel: 'off',
            },
          ],
        },
      ],
      serve: harness.serve,
    })

    expect(proxy.sessionThinking('zhipu/tiered')).toEqual({ effort: 'max' })
    expect(proxy.sessionThinking('zhipu/switch-off')).toEqual({ disabled: true })
    // Unknown models speak the claude thinking vocabulary directly.
    expect(proxy.sessionThinking('zhipu/plain')).toEqual({ enabled: true })
    expect(proxy.sessionThinking('zhipu/switched-off')).toEqual({ disabled: true })
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

  test('translates anthropic messages into chat completions and back for chat providers', async () => {
    const harness = createServeHarness()
    const upstreamFetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      Response.json({
        id: 'chat-1',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: '42', reasoning_content: '7*6 is 42' },
          },
        ],
        usage: { prompt_tokens: 25, completion_tokens: 44 },
      }),
    )
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [
        {
          ...provider,
          apiType: 'chat-completions',
          baseURL: 'https://model-router.meitu.com/v1',
          models: [
            {
              id: 'glm-5.3-flash',
              displayName: 'GLM 5.3 Flash',
              contextWindow: 250000,
              thinkingLevel: 'max',
              thinkingPresetId: 'glm-5-3',
            },
          ],
        },
      ],
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
          model: 'zhipu/glm-5.3-flash',
          max_tokens: 1024,
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
          output_config: { effort: 'low' },
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 'chat-1',
      type: 'message',
      role: 'assistant',
      model: 'zhipu/glm-5.3-flash',
      content: [
        { type: 'thinking', thinking: '7*6 is 42' },
        { type: 'text', text: '42' },
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 25, output_tokens: 44 },
    })

    expect(upstreamFetch).toHaveBeenCalledOnce()
    const upstreamRequest = upstreamFetch.mock.calls[0]?.[0]
    expect(upstreamRequest?.url).toBe('https://model-router.meitu.com/v1/chat/completions')
    expect(upstreamRequest?.headers.get('authorization')).toBe('Bearer provider-secret')
    expect(await upstreamRequest?.clone().json()).toEqual({
      model: 'glm-5.3-flash',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ],
      reasoning_effort: 'low',
    })
  })

  test('streams chat completions back as anthropic sse events', async () => {
    const harness = createServeHarness()
    const encoder = new TextEncoder()
    const upstreamFetch = vi.fn<(request: Request) => Promise<Response>>(async () => {
      const chunks = [
        `data: ${JSON.stringify({
          id: 'chat-1',
          choices: [{ index: 0, delta: { role: 'assistant', content: 'Hi' } }],
        })}\n\n`,
        'data: [DONE]\n\n',
      ]
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
            controller.close()
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [{ ...provider, apiType: 'chat-completions' }],
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
          stream: true,
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      }),
    )

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain('"type":"message_start"')
    expect(text).toContain('event: content_block_delta')
    expect(text).toContain('"type":"text_delta","text":"Hi"')
    expect(text).toContain('"type":"message_stop"')

    const upstreamRequest = upstreamFetch.mock.calls[0]?.[0]
    expect(await upstreamRequest?.clone().json()).toMatchObject({
      model: 'glm-5.2/fast',
      stream: true,
      stream_options: { include_usage: true },
    })
  })

  test('answers count_tokens locally for chat completions providers', async () => {
    const harness = createServeHarness()
    const upstreamFetch = vi.fn()
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [{ ...provider, apiType: 'chat-completions' }],
      serve: harness.serve,
    })

    const response = await harness.request(
      new Request(`${proxy.baseURL}/v1/messages/count_tokens`, {
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
    const body = await response.json()
    expect(body.input_tokens).toBeGreaterThanOrEqual(1)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  test('expresses the thinking switch per family on chat providers', async () => {
    const harness = createServeHarness()
    const upstreamBodies: Record<string, unknown>[] = []
    const upstreamFetch = vi.fn(async (request: Request) => {
      upstreamBodies.push(await request.clone().json())
      return Response.json({
        choices: [
          { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } },
        ],
      })
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [
        {
          ...provider,
          apiType: 'chat-completions',
          models: [
            {
              id: 'qwen3.8-flash',
              displayName: 'Qwen 3.8 Flash',
              contextWindow: 250000,
              thinkingLevel: 'off',
              thinkingPresetId: 'qwen',
            },
            {
              id: 'deepseek-flash',
              displayName: 'DeepSeek Flash',
              contextWindow: 250000,
              thinkingLevel: 'off',
              thinkingPresetId: 'deepseek',
            },
          ],
        },
      ],
      serve: harness.serve,
    })

    for (const model of ['zhipu/qwen3.8-flash', 'zhipu/deepseek-flash']) {
      await harness.request(
        new Request(`${proxy.baseURL}/v1/messages`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer local-secret',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Hello' }],
            thinking: { type: 'disabled' },
          }),
        }),
      )
    }

    expect(upstreamBodies).toEqual([
      {
        model: 'qwen3.8-flash',
        messages: [{ role: 'user', content: 'Hello' }],
        enable_thinking: false,
      },
      {
        model: 'deepseek-flash',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'disabled' },
      },
    ])
  })

  test('translates the claude thinking param directly for unknown chat models', async () => {
    const harness = createServeHarness()
    const upstreamBodies: Record<string, unknown>[] = []
    const upstreamFetch = vi.fn(async (request: Request) => {
      upstreamBodies.push(await request.clone().json())
      return Response.json({
        choices: [
          { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } },
        ],
      })
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [
        {
          ...provider,
          apiType: 'chat-completions',
          models: [
            {
              id: 'mystery',
              displayName: 'Mystery',
              contextWindow: 200000,
              thinkingLevel: 'off',
            },
          ],
        },
      ],
      serve: harness.serve,
    })

    const send = (thinking: unknown) =>
      harness.request(
        new Request(`${proxy.baseURL}/v1/messages`, {
          method: 'POST',
          headers: { authorization: 'Bearer local-secret', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'zhipu/mystery',
            messages: [{ role: 'user', content: 'Hello' }],
            ...(thinking ? { thinking } : {}),
          }),
        }),
      )

    await send({ type: 'disabled' })
    await send({ type: 'adaptive' })
    await send(undefined)

    expect(upstreamBodies).toEqual([
      {
        model: 'mystery',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'disabled' },
      },
      {
        model: 'mystery',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'enabled' },
      },
      {
        model: 'mystery',
        messages: [{ role: 'user', content: 'Hello' }],
        thinking: { type: 'disabled' },
      },
    ])
  })

  test('minimax m3 expresses thinking-on as adaptive on both paths', async () => {
    const harness = createServeHarness()
    const upstreamBodies: Record<string, unknown>[] = []
    const upstreamFetch = vi.fn(async (request: Request) => {
      upstreamBodies.push(await request.clone().json())
      return Response.json({
        choices: [
          { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } },
        ],
      })
    })
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [
        {
          ...provider,
          apiType: 'chat-completions',
          models: [
            {
              id: 'minimax-m3',
              displayName: 'MiniMax M3',
              contextWindow: 200000,
              thinkingLevel: 'on',
              thinkingPresetId: 'minimax-m3',
            },
          ],
        },
      ],
      serve: harness.serve,
    })

    const send = () =>
      harness.request(
        new Request(`${proxy.baseURL}/v1/messages`, {
          method: 'POST',
          headers: { authorization: 'Bearer local-secret', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'zhipu/minimax-m3',
            messages: [{ role: 'user', content: 'Hello' }],
          }),
        }),
      )
    await send()
    const chatOn = upstreamBodies[0]
    expect(chatOn.thinking).toEqual({ type: 'adaptive' })

    // Anthropic passthrough keeps thinking adaptive for MiniMax too.
    const anthropicProxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [
        {
          ...provider,
          models: [
            {
              id: 'minimax-m3',
              displayName: 'MiniMax M3',
              contextWindow: 200000,
              thinkingLevel: 'on',
              thinkingPresetId: 'minimax-m3',
            },
          ],
        },
      ],
      serve: harness.serve,
    })
    const response = await harness.request(
      new Request(`${anthropicProxy.baseURL}/v1/messages`, {
        method: 'POST',
        headers: { authorization: 'Bearer local-secret', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'zhipu/minimax-m3',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      }),
    )
    expect(response.status).toBe(200)
    expect(upstreamBodies[1].thinking).toEqual({ type: 'adaptive' })
  })

  test('wraps chat completions upstream errors in anthropic error payloads', async () => {
    const harness = createServeHarness()
    const upstreamFetch = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: '1210',
            message: '该模型始终思考，不支持关闭思考；请使用 low、high 或 max。',
          },
        },
        { status: 400 },
      ),
    )
    const proxy = await createModelProxy({
      authToken: 'local-secret',
      fetch: upstreamFetch,
      providers: [{ ...provider, apiType: 'chat-completions' }],
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

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: '该模型始终思考，不支持关闭思考；请使用 low、high 或 max。',
      },
    })
  })
})
