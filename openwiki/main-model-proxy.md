---
type: "Infrastructure"
title: "Model Proxy"
description: "How a local HTTP proxy lets the Claude SDK call OpenAI-compatible providers, and the request/response/streaming protocol translation."
tags: ["model-proxy", "protocol-translation", "streaming", "thinking"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-f17d2125ec1f19aa906a4d38
    resource: repo://src/main/claude/chat-completions-request.ts
  - id: openwiki-source-9f9ac4539e62d593ea410fa6
    resource: repo://src/main/claude/chat-completions-response.ts
  - id: openwiki-source-53e7aba77b2a424e0a007a2c
    resource: repo://src/main/claude/chat-completions-stream.ts
  - id: openwiki-source-e84634730a2861fb8df682dd
    resource: repo://src/main/claude/model-proxy.ts
  - id: openwiki-source-141c76c0b3ec74170b5dffde
    resource: repo://src/main/claude/thinking-mapping.ts
  - id: openwiki-source-6287c367ed97785aeeb15c6f
    resource: repo://src/main/claude/token-count.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Model Proxy

The Claude Agent SDK only speaks the Anthropic Messages protocol, while user-configured third-party providers mostly speak OpenAI Chat Completions. [model-proxy.ts](../src/main/claude/model-proxy.ts) runs a local HTTP proxy that translates the SDK's requests into the upstream protocol and the responses back. To the SDK, only `ANTHROPIC_BASE_URL` pointing at 127.0.0.1 is visible.

## Service shape

`createModelProxy({ providers, authToken?, fetch?, serve? })`:

- Listens on `127.0.0.1`, port 0 (system-assigned), with `requestTimeout = 0` (streaming responses must not time out) and `headersTimeout = 60_000`.
- `authToken` defaults to `randomBytes(32).toString('base64url')`, different on every launch.
- Only two endpoints are accepted: `/v1/messages` and `/v1/messages/count_tokens`; the method must be POST, else 404.
- The returned `ModelProxy` exposes `baseURL`, `authToken`, `replaceSettings`, `sessionThinking`, `settingsEnv`, `stop`.

`stop()` passes `closeActiveConnections: true` so in-flight requests drop immediately at quit.

## Authentication

`isAuthorized` accepts `Authorization: Bearer <token>` or `x-api-key: <token>`. Comparison uses `timingSafeEqual`, comparing lengths first — unequal lengths return false immediately, avoiding a `timingSafeEqual` throw. Failure returns 401 `authentication_error`.

## Model routing

The request body's `model` must be shaped `providerId/modelId`. `resolveModel` and the request-handler's parsing agree: find the first `/`, both sides non-empty; look up the provider map, then exact-match by id in the provider's models. Unknown provider returns 404 `Provider not found: <id>`; unknown model returns 404 `Model not found for provider <id>: <model>`.

`replaceSettings(providers)` swaps the whole routing table — called by [Claude Service](./main-claude-service.md) after any provider change, no proxy restart needed.

## Two upstream paths

**anthropic-messages** (the provider natively speaks Anthropic): the body passes through `applyThinking(body, model)` to rewrite the thinking config, then forwards directly to `upstreamURL(provider.baseURL, request.url)` — splicing the upstream baseURL's path prefix onto the inbound path, preserving the query. The response body passes through untouched, only `proxyResponseHeaders` strips hop-by-hop headers.

**chat-completions**: goes through `serveChatCompletions`, below.

On both paths `count_tokens` **answers locally**, never forwarding upstream. The comment explains why: zhipu's count_tokens endpoint silently drops all tool definitions when the request carries the `ToolSearch` tool, and large payloads then 502.

## Request translation

`anthropicToChatCompletions(body, thinking)` ([chat-completions-request.ts](../src/main/claude/chat-completions-request.ts)) covers the Messages subset Claude Code actually uses:

- `system` (string or block array) → one `role: 'system'` message, multiple text blocks joined with `\n`.
- Message blocks converted one by one: `text` accumulates into content; `image` (base64 source) becomes an `image_url` data URL; `tool_use` becomes a `function`-type tool_call with `input` serialized as the `arguments` string; `tool_result` becomes a standalone `role: 'tool'` message.
- Sampling params pass through: `max_tokens`, `temperature`, `top_p`, `stop_sequences` → `stop`.
- `tools` converted item by item; if all are filtered out, no `tools` field is sent.
- `stream: true` adds `stream_options: { include_usage: true }` — the upstream must report usage or token accounting is lost.
- The `thinking` parameter merges in via `Object.assign`.

`chatCompletionsURL` decides the upstream URL: a baseURL already ending in `/chat/completions` is used as-is, otherwise `/chat/completions` is appended (following OpenAI's `/v1` convention).

Request headers go through `providerHeaders`: it deletes 12 hop-by-hop headers including `authorization`, `x-api-key`, `host`, `content-length`, `connection`, then sets the provider's own `Bearer` token.

## Response translation

`chatCompletionsToAnthropic(chat, model)` ([chat-completions-response.ts](../src/main/claude/chat-completions-response.ts)) handles non-streaming responses:

- `reasoning_content` or `reasoning` → a `thinking` block.
- content (string or parts array) → `text` blocks.
- `tool_calls` → `tool_use` blocks, the `arguments` string parsed into the `input` object; a parse failure or empty string → `{}`; a missing id falls back to `toolu_<index>`.
- When all three block kinds are empty, an empty text block is added — the SDK needs at least one content block.
- usage's `prompt_tokens` / `completion_tokens` map to `input_tokens` / `output_tokens`.

`mapStopReason` translates finish reasons into stop reasons: `stop`→`end_turn`, `length`→`max_tokens`, `tool_calls`→`tool_use`, `content_filter`→`refusal`; unknown values fall back to `tool_use` or `end_turn` depending on whether tool_use is present. Streaming and non-streaming share the function.

Error path: `chatErrorToAnthropic(status, payload)` maps error types by status (400→`invalid_request_error`, 401-403→`authentication_error`, 404→`not_found_error`, 429→`rate_limit_error`, otherwise `api_error`), preferring the upstream `error.message` for the message, with fallback copy otherwise.

## Stream translation

`createChatCompletionsStream(model)` returns a `TransformStream` converting upstream SSE `chat.completion.chunk` frames into Anthropic's content-block event sequence. The constraint is in the file-header comment: **Anthropic blocks cannot reopen after `content_block_stop`**, while upstream tool_call arguments arrive in fragments and multiple tools may interleave. Therefore:

- reasoning delta → open a `thinking` block, emit `thinking_delta`.
- text delta → open a `text` block, emit `text_delta`.
- tool_call arguments are **cached and concatenated by index**, not emitted immediately; at `finish`, each tool gets `content_block_start` + `input_json_delta` + `content_block_stop` in order.
- On block-type switch, `closeOpenBlock` first; the `nextIndex++` index increases monotonically.
- Both `[DONE]` and stream end run `finish`: first `ensureStarted` (the upstream may end without a single data frame, in which case `message_start` must be added or the SDK cannot parse the tail events), then close blocks, emit tools, emit `message_delta` (with `mapStopReason` and output_tokens), emit `message_stop`.
- Unparseable JSON frames are skipped, never breaking the stream.

## Thinking mapping

[thinking-mapping.ts](../src/main/claude/thinking-mapping.ts) has two directions:

**Forward** (`sessionThinkingFor`, for SDK queries): a model with no associated preset speaks Claude vocabulary directly — `thinkingLevel === 'off'` returns `{ disabled: true }`, otherwise `{ enabled: true }`. With a preset, `claudeLevelFor` translates the model level into a Claude effort tier, with `none` becoming `{ disabled: true }`.

**Reverse** (`resolveRequestThinking`, for request translation): the request's `thinking.type` provides the on/off axis; `output_config.effort` gives the Claude effort tier, reverse-mapped through `modelLevelFor` into a model level. With `thinking.type === 'disabled'`, take the preset row whose `claudeLevel === 'none'` for the model level, or `'off'` without a preset. When effort is outside the set or a signal is missing, fall back to `model.thinkingLevel`, then the preset default, finally `'on'`.

`chatThinkingParams` serves chat-completions upstreams: a fully unconfigured model (no stored level, no Claude signals) returns undefined so the upstream uses its own default; otherwise the preset's `chatParams(level)`. `applyThinking` serves anthropic upstreams: it rewrites `thinking` and `output_config.effort` per the preset's `anthropicParams(level)`, preserves other `output_config` keys (like `format`), and deletes the whole `output_config` when both are empty.

## Token counting

`countPromptTokens(body)` ([token-count.ts](../src/main/claude/token-count.ts)) implements `/v1/messages/count_tokens` locally. It collects every text the model can see: system (string or block array), each message's content (including `tool_result` recursion), tool definitions' name/description/schema, `tool_choice`, `response_format`, and `input`/`prompt` strings. `tool_use` blocks contribute name and arguments together. Everything is joined and encoded once with gpt-tokenizer's `encode`.

The precision note lives in the comments: the o200k encoding deviates ±10-20% from the real server-side tokenizer, but the CLI's total context stays anchored to the real usage of the previous request; only the category breakdown is approximate. If the tokenizer throws, it falls back to a "four characters per token" heuristic, and a counting failure must never fail the CLI's context reporting. Empty input returns 1, not 0.

## Environment injected into the SDK

`settingsEnv(model)` produces the environment injected into the CLI subprocess:

```ts
ANTHROPIC_API_KEY: ''           // cleared to avoid hitting the official endpoint by mistake
ANTHROPIC_AUTH_TOKEN: authToken // the proxy's token
ANTHROPIC_BASE_URL: http://127.0.0.1:<port>
```

When the model resolves, `ANTHROPIC_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL` are both set to the same qualified model — a comment notes the CLI fills any role it needs from these two variables. When the model's `contextWindow > 0`, `CLAUDE_CODE_AUTO_COMPACT_WINDOW` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS` are also set so the auto-compact threshold matches the provider's real window.
