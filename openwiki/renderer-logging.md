---
type: "Reference"
title: "Renderer Logging"
description: "The renderer-process side of logging: the local logger, the development console sink, batched sends to the main process, and error capture."
tags: ["renderer", "logging", "ipc"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-a8cddaab10d931e0ac1d8817
    resource: repo://src/main/bootstrap.ts
  - id: openwiki-source-7d7bacf529f74f39a1f97132
    resource: repo://src/main/logging/logger.ts
  - id: openwiki-source-dc8c6cafb1c004deddcf0210
    resource: repo://src/main/logging/sanitize-webview.ts
  - id: openwiki-source-39e18faf4fe62278d38ba627
    resource: repo://src/renderer/main.tsx
  - id: openwiki-source-14016b4f260f0506d4cb1c9f
    resource: repo://src/renderer/services/logging/development-console.ts
  - id: openwiki-source-48108dbc3b9cc7122e8445c0
    resource: repo://src/renderer/services/logging/index.ts
  - id: openwiki-source-f21979d6dd5134214ae58e99
    resource: repo://src/renderer/services/logging/logger.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Renderer Logging

[src/renderer/services/logging/](../src/renderer/services/logging/) is the renderer's only logging path. It batches logs over IPC to the main process (see [Main Logging](./main-logging.md)), with a separate development copy written to the browser console.

## logger

[logger.ts](../src/renderer/services/logging/logger.ts)'s `createWebviewLogger(options)` is a **queue-plus-batched-send** logger. Defaults: 500ms flush interval, 50 per batch cap, 200 queue cap.

`enqueue` behavior, tiered:

- **error and fatal send immediately** (`immediate`, `unshift` to the queue head), skipping the flush interval — crashes must land on disk fast.
- When the queue exceeds its cap, **debug and info drop first**; with no low-priority entries found, non-immediate entries drop from the head and immediate entries from the tail, accumulating a `dropped` count.
- A full batch (50) flushes immediately.

`flush` prepends the dropped count as one `logging.records_dropped` warning **at the batch head**, then slices out at most 50 entries for `sendBatch`. A send throw calls `onSendError` and reschedules — note the entries **do not dequeue**, so the next flush retries. An `onSendError` that itself throws is caught too: the comment notes "reporting a log-transport failure must itself be wrapped".

Every logger write runs inside `safely`: any exception is silently swallowed, because "logging must never change the application's outcome".

`serializeError` recursively serializes error objects: name / message / code / stack, a `cause` chain up to 3 levels deep, `WeakSet` against circular references (cycles marked `[Circular cause]`). Non-object values degrade to `{ name: 'Error', message: String(caught) }`. `getLogger(category)` produces loggers named `clotho.webview.<category>`.

## Assembly and sending

[index.ts](../src/renderer/services/logging/index.ts) wires the logger to the desktop client:

```ts
export const webviewLogging = createWebviewLogger({
  onSendError() { if (import.meta.env.DEV) console.warn('Unable to send webview logs to Clotho') },
  sendBatch(entries) {
    if (!isDesktopRuntime()) { writeDevelopmentConsole(entries); return }
    sendMessageToDesktop('appLogBatch', { entries })
  },
})
```

On the desktop runtime it goes through `sendMessageToDesktop('appLogBatch', …)` — the renderer's only channel using `send` (not `invoke`): logs are high-frequency, returnless, and loss-tolerant (see [Preload Bridge](./preload.md)). Non-desktop runtimes (tests, pure browser) switch to `writeDevelopmentConsole`.

On the main-process side, `bootstrap.ts` receives batches with `ipcMain.on('clotho:message:appLogBatch')`, forwards to `recordWebviewLogBatch`, and ultimately writes them filtered through `sanitizeWebviewLogBatch`.

## Development console

[development-console.ts](../src/renderer/services/logging/development-console.ts) activates only in DEV and **admits only nine whitelisted events**: `logging.records_dropped`, `persistence.flush_failed`, `render.failed`, `query.stream_failed`, `shortcut.failed`, `webview.started`, `webview.startup_failed`, `webview.unhandled_error`, `webview.unhandled_rejection`. Everything else drops.

Each event's `POLICIES` fixes a level and message — the console always shows this fixed copy, never the renderer's original text. Events with `hasError` additionally print a **redacted** error object:

- The error name keeps its original only inside `SAFE_ERROR_NAMES` (11 standard error types), otherwise everything shows as `Error`.
- The error message shows verbatim only when matching `SAFE_ERROR_MESSAGE_PATTERNS` (truncated to 500 chars) — a whitelist: React's update depth, hook calls, minified error numbers, and a few property-read failures that reveal no internal structure. Everything else reads `Error details omitted`.

This is a **whitelist, not a blacklist**: showing less is preferable to leaking user data or internal state to the console.

## Correspondence with main-process redaction

The main process's [sanitize-webview.ts](../src/main/logging/sanitize-webview.ts) carries a structurally identical `WEBVIEW_EVENT_POLICIES` — the same nine events, the same event names, logger names, levels, and copy. Renderer messages are **rewritten by policy** before reaching disk: level, logger, and message all follow the main process's policy table, regardless of what the renderer sent.

Two validations: the logger name must match `^clotho\.webview(?:\.[a-z][a-z0-9_-]*)*$`, the event name must match `^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$` (at least two dot segments). Either failing, an event absent from the policy table, or an empty message drops the entry into `dropped`.

For admitted entries, `context` does not pass through as-is: each policy's `sanitizeContext` picks only allowed fields and constrains each — `logging.records_dropped` keeps only `count` within 1..1_000_000; `webview.unhandled_error` keeps only `line` and `column` within 0..10_000_000; `query.stream_failed` keeps only `phase` among five enum values; `render.failed` keeps only `agent-reply` or `application`. Missing fields are deleted outright by `compactContext`, never left undefined.

Batches beyond 50 truncate the same way into `dropped`. The final drop count lands as an `rpc.invalid_log_batch` warning in the main process's own log, so loss is visible on that side.

The renderer's `persistence.flush_failed` additionally carries a `target` enum (`sessions` / `settings`) and `errorName` on the main-process side — emitted by the renderer's pagehide flush chain (see [Renderer Bootstrap](./renderer-bootstrap.md)).

## Error capture

`installWebviewErrorLogging(target = window)` installs two global listeners, logging under category `app` (i.e. `clotho.webview.app`):

- **The `error` event** → `webview.unhandled_error`, context carrying `line` and `column`, error from `event.error`, falling back to `new Error(event.message || 'Unknown webview error')` when absent.
- **The `unhandledrejection` event** → `webview.unhandled_rejection`, error directly `event.reason`.

It returns an unload function and installs in `src/renderer/main.tsx`'s first module-top batch (before React mounts), so uncaught errors during startup are recorded too (see [Renderer Bootstrap](./renderer-bootstrap.md)). React's ErrorBoundary is a separate path: `componentDidCatch` logs `render.failed` with `componentStack`, which is why `serializeError` supports the `componentStack` parameter.
