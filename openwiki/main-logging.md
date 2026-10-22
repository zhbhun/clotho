---
type: "Infrastructure"
title: "Main Logging"
description: "logtape configuration, file rotation, the redaction pipeline, and how RPC and renderer logs converge into the main process."
tags: ["logging", "logtape", "redaction", "sanitize"]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-22T15:07:00.145Z
sources:
  - id: openwiki-source-7d7bacf529f74f39a1f97132
    resource: repo://src/main/logging/logger.ts
  - id: openwiki-source-0adaf8e2d8ecec386f45a6c3
    resource: repo://src/main/logging/runtime.ts
  - id: openwiki-source-bcf5fe964e123d1f0cd519f6
    resource: repo://src/main/logging/sanitize-context.ts
  - id: openwiki-source-0dba038b38de5dc88a18fd80
    resource: repo://src/main/logging/sanitize-error.ts
  - id: openwiki-source-dc8c6cafb1c004deddcf0210
    resource: repo://src/main/logging/sanitize-webview.ts
generated: { by: "claude-code", at: "2026-10-22T15:07:00.145Z" }
---

# Main Logging

Logging uses [logtape](https://logtape.org/) writing JSON Lines files. The core principle is written in [logger.ts](../src/main/logging/logger.ts)'s comments: a logging failure must never change application outcomes — every write is wrapped in try/catch and any exception is silently swallowed.

## Destination selection

`getLoggingDestinations(environment, channel)` picks the sinks:

- `NODE_ENV === 'test'` → `['memory']`, an in-memory array capped at 1000 entries (shifted beyond).
- dev channel → `['file', 'console']`.
- Everything else → `['file']`.

`getLogFilePath(rootDir, channel)` decides the file location:

| channel | path |
| --- | --- |
| `dev` | `<clothoDir>/logs/clotho.dev.jsonl` |
| `stable` | `<clothoDir>/logs/clotho.jsonl` |
| `canary` | `<clothoDir>/logs/canary/clotho.jsonl` |

`clothoDir()` is `~/.clotho`.

## configure

`configureLogTape` builds the file sink: `getRotatingFileSink`, 5 MiB per file, 5 retained, 8 KiB buffer, 1s flush interval, non-blocking. The sink is wrapped in `redactByField({ fieldPatterns: REDACT_FIELDS, maxDepth: 5, maxProperties: 100 })` — a second redaction layer on top of the app-side sanitize pipeline. The dev channel adds an equally redacted console sink.

Log level: `CLOTHO_LOG_LEVEL` forces an override; otherwise dev uses `debug`, others `info`. logtape's own logger gets a warning in dev and stays silent on other channels.

When `initializeLogging` fails (outside tests) it falls back to a pure console sink so a logging-init failure cannot stall startup. Finally `activeLogger = createAppLogger({...})` is created.

## App-side sanitize pipeline

Logs are already washed by `createAppLogger` before reaching a sink. `AppLogProperties` fixes the fields: `schemaVersion: 1`, `event`, `process` (`main` or `webview`), `runId`, `appVersion`, `channel`, plus optional `context` and `error`.

### sanitize-context

`sanitizeLogContext` recursively cleans any context value. Caps: depth 5, 100 properties, 2000-char strings, 12000-char stacks, 3 cause levels.

- **Strings**: home directory replaced with `$HOME`; four path shapes (UNC `\\`, `//`, POSIX `/`, Windows `C:\`) uniformly replaced with `$PATH`; overlong values truncated with `…`.
- **Sensitive fields**: field names lowercased with `-`/`_` stripped; a hit in the `SENSITIVE_FIELDS` set or any `SENSITIVE_FIELD_FRAGMENTS` substring drops the entire field. The list includes `apikey`, `authorization`, `content`, `credential`, `model`, `password`, `privatekey`, `prompt`, `secret`, `token`, `toolinput`, `tooloutput`. So `model`, `modelId`, and `prompt` never reach a log at all.
- **errorName special case**: only names in the `SAFE_ERROR_NAMES` whitelist survive (`Error` and standard subclasses, `AbortError`, `AggregateError`, `DOMException`, `SystemError`); otherwise the field is dropped.
- **Structure protection**: circular references marked `[Circular]`, over-deep marked `[Truncated]`, non-plain objects (class instances etc.) folded to `[ClassName]`.

### sanitize-error

`serializeLogError` serializes errors:

- `name` runs the same whitelist; non-whitelisted becomes `Error`.
- `message` defaults to `Error details omitted` — the original survives only when it matches `SAFE_ERROR_MESSAGE_PATTERNS` (React's "Maximum update depth exceeded", "Invalid hook call", minified React errors, "Cannot read properties of undefined..." — messages that carry no user data).
- `code` is recorded only inside the `SAFE_ERROR_CODES` whitelist (`ENOENT`, `EACCES`, `ECONNRESET`, standard errnos).
- `stack` and `componentStack`: only frames starting with `at ` survive, and paths within frames are likewise replaced with `$HOME` / `$PATH` / `$WEBVIEW`; localhost/127.0.0.1 URLs become `$WEBVIEW`; each frame reduces to `at <function> (<location>)`.
- `cause` recurses up to 3 levels; cycles marked `[Circular cause]`.

### sanitize-webview

Renderer logs are not free-form; they are whitelist-driven. `WEBVIEW_EVENT_POLICIES` fixes `level`, `logger`, and `message` for every allowed event — the three fields coming from the renderer are overwritten by the policy values, preventing forgery. Each policy may define `sanitizeContext`, whitelisting fields one by one with `boundedInteger` / `enumValue` / `compactContext`.

Admission requires: a legal `level`, a `logger` matching `/^clotho\.webview(?:\.[a-z][a-z0-9_-]*)*$/`, an `event` matching `^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$`, an existing policy, and a non-empty string `message`. Any miss counts `dropped += 1`.

Batch cap of 50: entries beyond it count as dropped directly, only the first 50 processed. With drops, an `rpc.invalid_log_batch` warning is appended. A non-array batch counts `dropped: 1`.

## RPC and renderer entries

**RPC entry**: `wrapRequestHandlers` (see [Main Bootstrap](./main-bootstrap.md)) wraps every handler and calls `onError` on failure. Bootstrap's `onError` also prints to console when `CLOTHO_DEBUG=1`, then uniformly logs `rpc.failed` with context carrying only `method` and the error's serialized name.

**Renderer entry**: `recordWebviewLogBatch(payload)` takes the `entries` array from the payload, hands it to `sanitizeWebviewLogBatch`, and writes each entry with `process: 'webview'`. A batch that fails to parse as a whole logs one `rpc.invalid_log_batch`.

## Shutdown ordering

`shutdownLogging` first clears `isConfigured` and `activeLogger`, then disposes logtape — this order guarantees no new writes land on an already-disposed sink during dispose.

In [Main Bootstrap](./main-bootstrap.md)'s quit flow, `shutdownLogging()` runs after stopping the proxy, flushing window state, and closing session queries have all completed, and its result does not block `app.exit(0)`. The fatal handler instead gives the flush at most 1 second via `Promise.race`, exiting on timeout regardless.
