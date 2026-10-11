import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, toolCallPair, ts, userText } from './helpers'

const NOTION_TOOL_MATCHES = [
  'mcp__notion__notion-create-pages',
  'mcp__notion__notion-duplicate-page',
  'mcp__notion__notion-fetch',
  'mcp__notion__notion-update-page',
  'mcp__notion__notion-move-pages',
  'mcp__notion__notion-restore-pages',
  'mcp__notion__notion-convert-page-to-skill',
  'mcp__notion__notion-list-favorite-pages',
]

export function toolSearchLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 2)
  const t1 = ts(0, 1)
  const t2 = ts(0, 0)

  lines.push(
    userText('Help me create a meeting-notes page in Notion; find the tools first.', {
      ts: t0,
    }),
  )

  lines.push(assistantText('Sure, I will first search for the available Notion tools.', { ts: t0 }))

  lines.push(
    ...toolCallPair('ToolSearch', { query: '+notion create page', max_results: 8 }, '', {
      ts: t0,
      toolUseResult: {
        matches: NOTION_TOOL_MATCHES,
        query: '+notion create page',
        total_deferred_tools: 119,
      },
    }),
  )

  lines.push(
    assistantText(
      'Found the Notion tools. I will use notion-create-pages to create the meeting-notes page.',
      { ts: t1 },
    ),
  )

  lines.push(
    ...toolCallPair(
      'mcp__notion__notion-create-pages',
      {
        parent: { page_id: 'demo-parent-page' },
        pages: [{ properties: { title: 'Meeting notes' } }],
      },
      'Created page "Meeting notes" (id: demo-page-1)',
      {
        ts: t1,
        toolUseResult: { id: 'demo-page-1', title: 'Meeting notes' },
      },
    ),
  )

  lines.push(assistantText('The meeting-notes page has been created in Notion.', { ts: t2 }))

  return lines
}
