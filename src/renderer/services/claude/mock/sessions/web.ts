import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function webLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 2)
  const t1 = ts(0, 1)
  const t2 = ts(0, 0)

  lines.push(
    userText("Look up Vite 8's new features, then fetch the official documentation for details.", {
      ts: t0,
    }),
  )

  lines.push(assistantText('Sure, I will search for information about Vite 8 first.', { ts: t0 }))

  const searchId = callId()
  const searchContent = `Web search results for query: "Vite 8 release new features"

1. **Vite 8 Release Guide** — https://vite.dev/blog/vite-8
   The Environment API is now stable, Rolldown bundler integration improved.

2. **What's new in Vite 8** — https://vite.dev/guide/migration
   Migration guide covering breaking changes from Vite 7.

REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.`
  lines.push(
    ...toolCallPair('WebSearch', { query: 'Vite 8 release new features' }, searchContent, {
      id: searchId,
      ts: t0,
      toolUseResult: {
        query: 'Vite 8 release new features',
        results: [
          { title: 'Vite 8 Release Guide', url: 'https://vite.dev/blog/vite-8' },
          { title: "What's new in Vite 8", url: 'https://vite.dev/guide/migration' },
        ],
        durationSeconds: 1.85,
        searchCount: 2,
      },
    }),
  )

  lines.push(
    assistantText(
      'The search returned relevant results. Next, fetch the official blog page for details.',
      { ts: t1 },
    ),
  )

  const fetchId = callId()
  const fetchContent =
    'According to the Vite 8 official blog, key features include:\n\n1. **Stable Environment API** — a unified build-environment interface\n2. **Rolldown integration** — a Rust-based bundler with faster builds\n3. **CSS code-splitting improvements** — finer-grained chunk control\n4. **Node.js 20+ requirement** — a newer minimum runtime'
  lines.push(
    ...toolCallPair(
      'WebFetch',
      {
        url: 'https://vite.dev/blog/vite-8',
        prompt: 'Extract Vite 8 major new features and improvements',
      },
      fetchContent,
      {
        id: fetchId,
        ts: t1,
        toolUseResult: {
          bytes: 89234,
          code: 200,
          codeText: 'OK',
          result: fetchContent,
          durationMs: 3120,
          url: 'https://vite.dev/blog/vite-8',
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'The page was fetched successfully. I will search for Vite 8 deprecated features next.',
      { ts: t2 },
    ),
  )

  const emptySearchId = callId()
  const emptySearchContent =
    'Web search results for query: "Vite 8 deprecated features list xyz"\n\n\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.'
  lines.push(
    ...toolCallPair(
      'WebSearch',
      { query: 'Vite 8 deprecated features list xyz' },
      emptySearchContent,
      {
        id: emptySearchId,
        ts: t2,
        toolUseResult: {
          query: 'Vite 8 deprecated features list xyz',
          results: [],
          durationSeconds: 1.12,
          searchCount: 0,
        },
      },
    ),
  )

  const failFetchId = callId()
  const failFetchContent = 'Error: HTTP 404 Not Found — page does not exist'
  lines.push(
    ...toolCallPair(
      'WebFetch',
      { url: 'https://vite.dev/nonexistent-page', prompt: 'Extract the page content' },
      failFetchContent,
      {
        id: failFetchId,
        isError: true,
        ts: t2,
        toolUseResult: {
          bytes: 0,
          code: 404,
          codeText: 'Not Found',
          result: '',
          durationMs: 450,
          url: 'https://vite.dev/nonexistent-page',
        },
      },
    ),
  )

  lines.push(
    assistantText(
      "Vite 8's core features are summarized: stable Environment API, Rolldown integration, CSS code-splitting improvements, and the Node.js 20+ requirement. The deprecated-feature search returned no results, and the missing page returned 404.",
      { ts: t2 },
    ),
  )

  return lines
}
