import type { ClaudeContentPart, ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, assistantToolUse, callId, toolCallPair, ts, uid, userText } from './helpers'

export function mcpLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 3)
  const t1 = ts(0, 2)
  const t2 = ts(0, 1)
  const t3 = ts(0, 0)

  lines.push(userText('Look up the React useEffect usage documentation.', { ts: t0 }))

  lines.push(
    assistantText(
      'Sure, I will resolve the React library ID through context7, then query the useEffect documentation.',
      {
        ts: t0,
      },
    ),
  )

  const resolveId = callId()
  const resolveResult: ClaudeContentPart[] = [
    {
      type: 'text',
      text: 'Available Libraries:\n\n- Title: React\n- Context7-compatible library ID: /reactjs/react.dev\n- Description: The library for web and native user interfaces.\n- Code Snippets: 7182\n- Source Reputation: High\n- Benchmark Score: 87.64',
    },
  ]
  lines.push(
    assistantToolUse(
      'mcp__plugin_context7_context7__resolve-library-id',
      { libraryName: 'React', query: 'useEffect hook usage' },
      { id: resolveId, ts: t1 },
    ),
  )
  lines.push({
    type: 'user',
    uuid: uid('user'),
    timestamp: t1,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: resolveId, content: resolveResult }],
    },
    toolUseResult: resolveResult,
  })

  lines.push(
    assistantText(
      'React is found (library ID: /reactjs/react.dev). Now query the useEffect usage documentation.',
      {
        ts: t1,
      },
    ),
  )

  const queryId = callId()
  const queryResult: ClaudeContentPart[] = [
    {
      type: 'text',
      text: '## useEffect\n\n```jsx\nuseEffect(() => {\n  const subscription = subscribe(apiSource)\n  return () => {\n    subscription.unsubscribe()\n  }\n}, [apiSource])\n```\n\n- The cleanup function runs before the component unmounts and before each re-run.\n- The dependency array controls when the effect re-executes.',
    },
  ]
  lines.push(
    assistantToolUse(
      'mcp__plugin_context7_context7__query-docs',
      { libraryId: '/reactjs/react.dev', query: 'useEffect hook usage and cleanup' },
      { id: queryId, ts: t2 },
    ),
  )
  lines.push({
    type: 'user',
    uuid: uid('user'),
    timestamp: t2,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: queryId, content: queryResult }],
    },
    toolUseResult: queryResult,
  })

  lines.push(
    assistantText(
      'According to the React documentation, useEffect calls its cleanup function before unmounting and before each re-run; the dependency array controls when the effect re-executes. A typical pattern subscribes in the effect and unsubscribes in cleanup.',
      { ts: t2 },
    ),
  )

  lines.push(
    ...toolCallPair(
      'mcp__plugin_context7_context7__query-docs',
      { libraryId: '/invalid/nonexistent', query: 'test' },
      'Error: Library not found: /invalid/nonexistent',
      {
        isError: true,
        ts: t3,
        toolUseResult: 'Error: Library not found: /invalid/nonexistent',
      },
    ),
  )

  lines.push(
    assistantText(
      'This completes the context7 MCP documentation lookup flow; the final failed call demonstrates the MCP error branch rendering.',
      { ts: t3 },
    ),
  )

  return lines
}
