// @vitest-environment node
import { describe, expect, test } from 'vitest'

import { sanitizeLogContext, sanitizeWebviewLogBatch, serializeLogError } from './sanitize'

describe('log sanitization', () => {
  test('removes sensitive fields and normalizes user-home paths recursively', () => {
    const context = sanitizeLogContext(
      {
        apiKey: 'sk-secret',
        authToken: 'private-auth-token',
        durationMs: 42,
        model: 'private-model-id',
        nested: {
          authorization: 'Bearer secret',
          defaultModelId: 'private-default-model-id',
          externalPath: '/Volumes/work/private-project/src/index.ts',
          filePath: '/Users/alice/Projects/private/src/index.ts',
        },
        prompt: 'private question',
        systemPrompt: 'private system prompt',
        toolInputPreview: 'private tool input',
      },
      { homeDir: '/Users/alice' },
    )

    expect(context).toEqual({
      durationMs: 42,
      nested: {
        externalPath: '$PATH',
        filePath: '$HOME/Projects/private/src/index.ts',
      },
    })
  })

  test('bounds cyclic, deeply nested, and oversized context values', () => {
    const source: Record<string, unknown> = {
      child: { grandchild: { value: true } },
      long: '123456789',
    }
    source.self = source

    const context = sanitizeLogContext(source, {
      homeDir: '',
      maxDepth: 2,
      maxProperties: 10,
      maxStringLength: 5,
    })

    expect(context).toEqual({
      child: { grandchild: '[Truncated]' },
      long: '12345…',
      self: '[Circular]',
    })
  })

  test('applies the property budget across the entire context tree', () => {
    const context = sanitizeLogContext(
      {
        first: { one: 1, two: 2, three: 3 },
        second: { one: 1, two: 2 },
      },
      { homeDir: '', maxProperties: 3 },
    )

    expect(context).toEqual({ first: { one: 1, two: 2 } })
  })

  test('keeps only allowlisted error names in log context', () => {
    const context = sanitizeLogContext(
      {
        errorName: 'TypeError',
        nested: { errorName: 'private-model-id' },
      },
      { homeDir: '' },
    )

    expect(context).toEqual({ errorName: 'TypeError', nested: {} })
  })

  test('normalizes absolute paths containing spaces and UNC paths', () => {
    const context = sanitizeLogContext(
      {
        externalPath: '/Volumes/Private Project/src/index.ts',
        homePath: '/Users/alice/My Project/src/index.ts',
        homePrefixPath: '/Users/alice-backup/Secret Project/src/index.ts',
        message: 'Failed at /Volumes/Private Project/src/index.ts',
        uncPath: '\\\\server\\share\\Private Project\\src\\index.ts',
        windowsPath: 'C:\\Private Project\\src\\index.ts',
      },
      { homeDir: '/Users/alice' },
    )

    expect(context).toEqual({
      externalPath: '$PATH',
      homePath: '$HOME/My Project/src/index.ts',
      homePrefixPath: '$PATH',
      message: 'Failed at $PATH',
      uncPath: '$PATH',
      windowsPath: '$PATH',
    })
  })

  test('serializes allowlisted error details without persisting arbitrary text or paths', () => {
    const cause = Object.assign(new Error('secret prompt for private-model-id'), {
      code: 'EIO',
    })
    cause.stack =
      'Error: secret prompt for private-model-id\n    at private-model-id (/Volumes/private/project/data.ts:4:2)'
    const caught = Object.assign(
      new Error('token sk-private and model private-model-id', { cause }),
      {
        code: 'PRIVATE_MODEL_ID',
        componentStack: '\n    at private-model-id (/Users/alice/app/settings.tsx:10:2)',
        name: 'private-model-id',
      },
    )

    const error = serializeLogError(caught, { homeDir: '/Users/alice' })

    expect(error).toMatchObject({
      name: 'Error',
      message: 'Error details omitted',
      componentStack: '\n    at private ($HOME/app/settings.tsx:10:2)',
      cause: {
        name: 'Error',
        message: 'Error details omitted',
        code: 'EIO',
        stack: '\n    at private ($PATH)',
      },
    })
    expect(JSON.stringify(error)).not.toMatch(
      /private-model-id|secret prompt|sk-private|\/Volumes\/private|\/Users\/alice/,
    )
    expect(error).not.toHaveProperty('code')
  })

  test('keeps framework diagnostics that identify a render loop', () => {
    const error = serializeLogError(
      new Error(
        'Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentDidUpdate.',
      ),
      { homeDir: '/Users/alice' },
    )

    expect(error.message).toBe(
      'Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentDidUpdate.',
    )
  })

  test('keeps safe missing-property diagnostics for render failures', () => {
    const error = serializeLogError(
      new TypeError("Cannot read properties of undefined (reading 'map')"),
      { homeDir: '/Users/alice' },
    )

    expect(error.message).toBe("Cannot read properties of undefined (reading 'map')")
  })

  test('keeps Safari missing-object diagnostics for render failures', () => {
    const error = serializeLogError(
      new TypeError("undefined is not an object (evaluating 'prompt.trim')"),
      { homeDir: '/Users/alice' },
    )

    expect(error.message).toBe("undefined is not an object (evaluating 'prompt.trim')")
  })

  test('retains sanitized component locations from the Vite webview', () => {
    const error = serializeLogError(
      Object.assign(new Error("Cannot read properties of undefined (reading 'map')"), {
        componentStack:
          '\n    at SessionAreaContent (http://localhost:3366/pages/workbench/session/index.tsx:277:38)',
      }),
      { homeDir: '/Users/alice' },
    )

    expect(error.componentStack).toBe(
      '\n    at SessionAreaContent ($WEBVIEW/pages/workbench/session/index.tsx:277:38)',
    )
  })

  test('accepts only bounded webview records from the logging contract', () => {
    const result = sanitizeWebviewLogBatch(
      [
        {
          level: 'fatal',
          logger: 'clotho.webview.app',
          event: 'render.failed',
          message: 'secret prompt and private-model-id',
          context: { boundary: 'application', token: 'secret' },
          error: { name: 'TypeError', message: 'broken' },
        },
        {
          level: 'info',
          logger: 'third-party',
          event: 'app.clicked',
          message: 'Untrusted category',
        },
        {
          level: 'verbose',
          logger: 'clotho.webview',
          event: 'invalid.level',
          message: 'Untrusted level',
        },
      ],
      { homeDir: '/Users/alice', maxBatchSize: 2 },
    )

    expect(result).toEqual({
      dropped: 2,
      entries: [
        {
          level: 'error',
          logger: 'clotho.webview.render',
          event: 'render.failed',
          message: 'Webview rendering failed',
          context: { boundary: 'application' },
          error: { name: 'TypeError', message: 'Error details omitted' },
        },
      ],
    })
  })

  test('allows only typed context values for trusted webview events', () => {
    const result = sanitizeWebviewLogBatch(
      [
        {
          level: 'warning',
          logger: 'clotho.webview.logging',
          event: 'logging.records_dropped',
          message: 'untrusted',
          context: { count: 'private-model-id' },
        },
        {
          level: 'warning',
          logger: 'clotho.webview.persistence',
          event: 'persistence.flush_failed',
          message: 'untrusted',
          context: { errorName: 'TypeError', target: 'settings' },
        },
        {
          level: 'error',
          logger: 'clotho.webview.render',
          event: 'render.failed',
          message: 'untrusted',
          context: { boundary: 'private-model-id' },
        },
        {
          level: 'error',
          logger: 'clotho.webview.shortcut',
          event: 'shortcut.failed',
          message: 'untrusted',
          context: { commandId: 'private-model-id' },
        },
        {
          level: 'error',
          logger: 'clotho.webview.app',
          event: 'webview.unhandled_error',
          message: 'untrusted',
          context: { column: 4, line: 'private-model-id' },
        },
      ],
      { homeDir: '/Users/alice', maxBatchSize: 10 },
    )

    expect(result.entries.map((entry) => entry.context)).toEqual([
      undefined,
      { errorName: 'TypeError', target: 'settings' },
      undefined,
      undefined,
      { column: 4 },
    ])
    expect(JSON.stringify(result)).not.toContain('private-model-id')
  })

  test('records query stream failures with safe diagnostic context', () => {
    const result = sanitizeWebviewLogBatch(
      [
        {
          level: 'error',
          logger: 'clotho.webview.query',
          event: 'query.stream_failed',
          message: 'untrusted',
          context: { phase: 'persisted', prompt: 'private prompt' },
          error: {
            name: 'Error',
            message: 'Maximum update depth exceeded. React nested update loop.',
            stack:
              'Error: Maximum update depth exceeded. React nested update loop.\n    at SessionAreaContent (http://localhost:3366/pages/workbench/session/index.tsx:277:38)',
            componentStack:
              '\n    at SessionAreaContent (http://localhost:3366/pages/workbench/session/index.tsx:277:38)',
          },
        },
      ],
      { homeDir: '/Users/alice' },
    )

    expect(result.entries).toEqual([
      {
        level: 'error',
        logger: 'clotho.webview.query',
        event: 'query.stream_failed',
        message: 'Claude query stream failed',
        context: { phase: 'persisted' },
        error: {
          name: 'Error',
          message: 'Maximum update depth exceeded. React nested update loop.',
          stack: '\n    at SessionAreaContent ($WEBVIEW/pages/workbench/session/index.tsx:277:38)',
          componentStack:
            '\n    at SessionAreaContent ($WEBVIEW/pages/workbench/session/index.tsx:277:38)',
        },
      },
    ])
  })
})
