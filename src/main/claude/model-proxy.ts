import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'

import type { ClaudeModelMappings, ModelProvider, ProviderModel } from '@/shared/rpc'

import { anthropicToChatCompletions, estimatePromptTokens } from './chat-completions-request'
import { chatCompletionsToAnthropic, chatErrorToAnthropic } from './chat-completions-response'
import { createChatCompletionsStream } from './chat-completions-stream'
import type { ClaudeskSettings } from './settings'
import {
  type SessionThinking,
  applyThinking,
  chatThinkingConfig,
  sessionThinkingFor,
} from './thinking-mapping'

export type { SessionThinking } from './thinking-mapping'

export type ModelProxyFetch = (request: Request) => Promise<Response>

export interface ModelProxyServeOptions {
  hostname: string
  idleTimeout: number
  port: number
  fetch: (request: Request) => Response | Promise<Response>
}

export interface ModelProxyServer {
  port: number
  stop: (closeActiveConnections?: boolean) => void | Promise<void>
}

export type ModelProxyServe = (
  options: ModelProxyServeOptions,
) => ModelProxyServer | Promise<ModelProxyServer>

export interface ModelProxy {
  baseURL: string
  authToken: string
  replaceSettings: (settings: ClaudeskSettings) => void
  settingsEnv: (model?: string) => Record<string, string>
  /** Forward mapping: the claude effort/thinking for a session on this model. */
  sessionThinking: (model?: string) => SessionThinking | undefined
  stop: () => Promise<void>
}

export interface CreateModelProxyOptions {
  providers: ModelProvider[]
  models?: ClaudeModelMappings
  authToken?: string
  fetch?: ModelProxyFetch
  serve?: ModelProxyServe
}

function providerMap(providers: ModelProvider[]) {
  return new Map(
    providers.map((provider) => [
      provider.id,
      {
        ...provider,
        models: provider.models.map((model) => ({ ...model })),
      },
    ]),
  )
}

const MODEL_MAPPING_ENV = {
  sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
  opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  fable: 'ANTHROPIC_DEFAULT_FABLE_MODEL',
  haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  subagent: 'CLAUDE_CODE_SUBAGENT_MODEL',
  fallback: 'ANTHROPIC_MODEL',
} as const

function resolveModel(routes: ReturnType<typeof providerMap>, qualifiedModel: string | undefined) {
  if (!qualifiedModel) return undefined
  const separator = qualifiedModel.indexOf('/')
  if (separator <= 0 || separator === qualifiedModel.length - 1) return undefined
  const provider = routes.get(qualifiedModel.slice(0, separator))
  const modelId = qualifiedModel.slice(separator + 1)
  const model = provider?.models.find((candidate) => candidate.id === modelId)
  return provider && model ? { model, provider } : undefined
}

function errorResponse(status: number, type: string, message: string) {
  return Response.json({ type: 'error', error: { type, message } }, { status })
}

function tokensMatch(candidate: string | null, expected: string) {
  if (!candidate) return false
  const candidateBytes = Buffer.from(candidate)
  const expectedBytes = Buffer.from(expected)
  return (
    candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes)
  )
}

function isAuthorized(request: Request, authToken: string) {
  const authorization = request.headers.get('authorization')
  const bearer =
    authorization?.slice(0, 7).toLowerCase() === 'bearer ' ? authorization.slice(7) : null
  return tokensMatch(bearer, authToken) || tokensMatch(request.headers.get('x-api-key'), authToken)
}

function upstreamURL(baseURL: string, requestURL: string) {
  const upstream = new URL(baseURL)
  const incoming = new URL(requestURL)
  upstream.pathname = `${upstream.pathname.replace(/\/+$/, '')}${incoming.pathname}`
  upstream.search = incoming.search
  return upstream
}

/**
 * Chat Completions upstreams only expose one completion endpoint. The base URL
 * follows the OpenAI convention (including `/v1`); an explicit
 * `/chat/completions` suffix is kept as-is.
 */
function chatCompletionsURL(baseURL: string) {
  const trimmed = baseURL.replace(/\/+$/, '')
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`
}

const REQUEST_HEADERS_TO_REMOVE = [
  'authorization',
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-api-key',
] as const

const PROXY_ENDPOINTS = new Set(['/v1/messages', '/v1/messages/count_tokens'])

function providerHeaders(request: Request, provider: ModelProvider) {
  const headers = new Headers(request.headers)
  for (const header of REQUEST_HEADERS_TO_REMOVE) {
    headers.delete(header)
  }
  headers.set('authorization', `Bearer ${provider.authToken}`)
  return headers
}

function proxyResponseHeaders(response: Response) {
  const headers = new Headers(response.headers)
  for (const header of [
    'connection',
    'content-encoding',
    'content-length',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]) {
    headers.delete(header)
  }
  return headers
}

async function upstreamPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Translate an Anthropic Messages request through a Chat Completions upstream:
 * request in, Anthropic response (streaming or not) back out.
 */
async function serveChatCompletions({
  request,
  body,
  isCountTokens,
  provider,
  model,
  qualifiedModel,
  modelId,
  fetchUpstream,
}: {
  request: Request
  body: Record<string, unknown>
  isCountTokens: boolean
  provider: ModelProvider
  model: ProviderModel
  qualifiedModel: string
  modelId: string
  fetchUpstream: ModelProxyFetch
}): Promise<Response> {
  if (isCountTokens) {
    return Response.json({ input_tokens: estimatePromptTokens(body) })
  }

  const chatBody = anthropicToChatCompletions(
    { ...body, model: modelId },
    chatThinkingConfig(model, body),
  )
  const upstreamRequest = new Request(chatCompletionsURL(provider.baseURL), {
    method: 'POST',
    headers: providerHeaders(request, provider),
    body: JSON.stringify(chatBody),
    signal: request.signal,
  })
  const response = await fetchUpstream(upstreamRequest)

  const headers = proxyResponseHeaders(response)
  if (!response.ok) {
    const { status, body: errorBody } = chatErrorToAnthropic(
      response.status,
      await upstreamPayload(response),
    )
    headers.set('content-type', 'application/json')
    return new Response(JSON.stringify(errorBody), { status, headers })
  }
  if (chatBody.stream === true && response.body) {
    return new Response(response.body.pipeThrough(createChatCompletionsStream(qualifiedModel)), {
      status: response.status,
      headers,
    })
  }
  const chat = await upstreamPayload(response)
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(chatCompletionsToAnthropic(chat, qualifiedModel)), {
    status: response.status,
    headers,
  })
}

function serveWithNode(options: ModelProxyServeOptions): Promise<ModelProxyServer> {
  const server = createServer((request, response) => {
    void handleProxyRequest(request, response, options.fetch).catch(() => {
      if (!response.headersSent) {
        response.statusCode = 500
      }
      response.end()
    })
  })
  server.requestTimeout = 0
  server.headersTimeout = 60_000

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.hostname, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Model proxy failed to bind a TCP port'))
        return
      }
      resolve({
        port: address.port,
        stop: (closeActiveConnections) =>
          new Promise<void>((resolveStop, rejectStop) => {
            if (closeActiveConnections) server.closeAllConnections()
            server.close((error) => (error ? rejectStop(error) : resolveStop()))
          }),
      })
    })
  })
}

async function handleProxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  fetch: (request: Request) => Response | Promise<Response>,
) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value)
    } else if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry)
    }
  }

  const host = request.headers.host ?? '127.0.0.1'
  const requestInit: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    requestInit.body = Readable.toWeb(request) as ReadableStream<Uint8Array>
    requestInit.duplex = 'half'
  }

  const upstream = await fetch(new Request(`http://${host}${request.url}`, requestInit))

  const responseHeaders: Record<string, string> = {}
  upstream.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })
  response.writeHead(upstream.status, responseHeaders)

  if (!upstream.body) {
    response.end()
    return
  }
  await pipeline(
    Readable.fromWeb(upstream.body as unknown as NodeWebReadableStream<Uint8Array>),
    response,
  )
}

export async function createModelProxy({
  providers,
  models = {},
  authToken = randomBytes(32).toString('base64url'),
  fetch: fetchUpstream = (request) => fetch(request),
  serve = serveWithNode,
}: CreateModelProxyOptions): Promise<ModelProxy> {
  let routes = providerMap(providers)
  let modelMappings = { ...models }
  const server = await serve({
    hostname: '127.0.0.1',
    idleTimeout: 0,
    port: 0,
    async fetch(request) {
      if (!isAuthorized(request, authToken)) {
        return errorResponse(401, 'authentication_error', 'Invalid proxy authentication')
      }

      const requestURL = new URL(request.url)
      if (request.method !== 'POST' || !PROXY_ENDPOINTS.has(requestURL.pathname)) {
        return errorResponse(404, 'invalid_request_error', 'Unsupported proxy endpoint')
      }

      let parsedBody: unknown
      try {
        parsedBody = await request.json()
      } catch {
        return errorResponse(400, 'invalid_request_error', 'Request body must be valid JSON')
      }
      const body =
        parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
          ? (parsedBody as Record<string, unknown>)
          : {}
      const qualifiedModel = body.model
      if (typeof qualifiedModel !== 'string') {
        return errorResponse(400, 'invalid_request_error', 'Model must use providerId/modelId')
      }
      const separator = qualifiedModel.indexOf('/')
      if (separator <= 0 || separator === qualifiedModel.length - 1) {
        return errorResponse(400, 'invalid_request_error', 'Model must use providerId/modelId')
      }
      const providerId = qualifiedModel.slice(0, separator)
      const modelId = qualifiedModel.slice(separator + 1)
      const provider = routes.get(providerId)
      if (!provider) {
        return errorResponse(404, 'not_found_error', `Provider not found: ${providerId}`)
      }
      const model = provider.models.find((candidate) => candidate.id === modelId)
      if (!model) {
        return errorResponse(
          404,
          'not_found_error',
          `Model not found for provider ${providerId}: ${modelId}`,
        )
      }

      try {
        if (provider.apiType === 'chat-completions') {
          return await serveChatCompletions({
            request,
            body,
            isCountTokens: requestURL.pathname === '/v1/messages/count_tokens',
            provider,
            model,
            qualifiedModel,
            modelId,
            fetchUpstream,
          })
        }
        const upstreamRequest = new Request(upstreamURL(provider.baseURL, request.url), {
          method: request.method,
          headers: providerHeaders(request, provider),
          body: JSON.stringify({ ...applyThinking(body, model), model: modelId }),
          signal: request.signal,
        })
        const response = await fetchUpstream(upstreamRequest)
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: proxyResponseHeaders(response),
        })
      } catch {
        return errorResponse(502, 'api_error', 'Failed to connect to model provider')
      }
    },
  })

  return {
    baseURL: `http://127.0.0.1:${server.port}`,
    authToken,
    replaceSettings(settings) {
      routes = providerMap(settings.providers)
      modelMappings = { ...settings.models }
    },
    sessionThinking(model) {
      return sessionThinkingFor(resolveModel(routes, model)?.model)
    },
    settingsEnv(model) {
      const env: Record<string, string> = {
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_AUTH_TOKEN: authToken,
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.port}`,
      }
      for (const [role, name] of Object.entries(MODEL_MAPPING_ENV)) {
        const mapping = modelMappings[role as keyof ClaudeModelMappings]
        if (mapping && resolveModel(routes, mapping)) {
          env[name] = mapping
        }
      }
      const current = resolveModel(routes, model)
      if (current && current.model.contextWindow > 0) {
        const contextWindow = String(current.model.contextWindow)
        env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = contextWindow
        env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = contextWindow
      }
      return env
    },
    async stop() {
      await server.stop(true)
    },
  }
}
