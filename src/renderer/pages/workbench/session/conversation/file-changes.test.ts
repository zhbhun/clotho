import { describe, expect, it } from 'vitest'

import { summarizeTurnFileChanges } from './file-changes'
import type { ConversationTimelineItem } from './types'

type ToolItem = Extract<ConversationTimelineItem, { kind: 'tool' }>

function editToolItem(id: string, extra: Partial<ToolItem> = {}): ConversationTimelineItem {
  return {
    id,
    kind: 'tool',
    use: {
      type: 'tool_use',
      name: 'Edit',
      toolUseId: `${id}-use`,
      input: { file_path: '/repo/src/a.ts', old_string: 'old', new_string: 'new' },
    },
    ...extra,
  }
}

describe('summarizeTurnFileChanges', () => {
  it('counts hunk lines from structuredPatch', () => {
    const changes = summarizeTurnFileChanges([
      editToolItem('t1', {
        result: {
          type: 'tool_result',
          toolUseId: 't1-use',
          toolUseResult: {
            filePath: '/repo/src/a.ts',
            structuredPatch: [
              {
                oldStart: 1,
                oldLines: 2,
                newStart: 1,
                newLines: 3,
                lines: [' ctx', '-gone', '+here', '+there'],
              },
            ],
          },
        },
      }),
    ])

    expect(changes).toEqual([{ path: '/repo/src/a.ts', additions: 2, deletions: 1 }])
  })

  it('treats a Write create as all additions from its content', () => {
    const changes = summarizeTurnFileChanges([
      {
        id: 't1',
        kind: 'tool',
        use: {
          type: 'tool_use',
          name: 'Write',
          toolUseId: 't1-use',
          input: { file_path: '/repo/README.md', content: '# Title\n\nBody' },
        },
        result: {
          type: 'tool_result',
          toolUseId: 't1-use',
          toolUseResult: {
            type: 'create',
            filePath: '/repo/README.md',
            content: '# Title\n\nBody',
            structuredPatch: [],
            originalFile: null,
          },
        },
      },
    ])

    expect(changes).toEqual([{ path: '/repo/README.md', additions: 3, deletions: 0 }])
  })

  it('merges repeated edits to one file by summing churn in first-touch order', () => {
    const changes = summarizeTurnFileChanges([
      editToolItem('t1', {
        result: {
          type: 'tool_result',
          toolUseId: 't1-use',
          toolUseResult: {
            filePath: '/repo/src/a.ts',
            structuredPatch: [
              { oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-x', '+y', '+z'] },
            ],
          },
        },
      }),
      {
        id: 't2',
        kind: 'tool',
        use: {
          type: 'tool_use',
          name: 'Write',
          toolUseId: 't2-use',
          input: { file_path: '/repo/b.ts' },
        },
        result: {
          type: 'tool_result',
          toolUseId: 't2-use',
          toolUseResult: {
            type: 'create',
            filePath: '/repo/b.ts',
            structuredPatch: [],
            originalFile: null,
            userModified: false,
          },
        },
      },
      editToolItem('t3', {
        use: {
          type: 'tool_use',
          name: 'Edit',
          toolUseId: 't3-use',
          input: { file_path: '/repo/src/a.ts', old_string: 'p', new_string: 'q' },
        },
        result: {
          type: 'tool_result',
          toolUseId: 't3-use',
          toolUseResult: {
            filePath: '/repo/src/a.ts',
            structuredPatch: [
              { oldStart: 9, oldLines: 2, newStart: 9, newLines: 1, lines: ['-r', '-s', '+t'] },
            ],
          },
        },
      }),
    ])

    expect(changes).toEqual([
      { path: '/repo/src/a.ts', additions: 3, deletions: 3 },
      { path: '/repo/b.ts', additions: 0, deletions: 0 },
    ])
  })

  it('includes subagent children and skips non-edit tools', () => {
    const changes = summarizeTurnFileChanges([
      {
        id: 't1',
        kind: 'tool',
        use: {
          type: 'tool_use',
          name: 'Agent',
          toolUseId: 't1-use',
          input: {},
        },
        children: [
          editToolItem('c1', {
            use: {
              type: 'tool_use',
              name: 'Edit',
              toolUseId: 'c1-use',
              input: { file_path: '/repo/src/child.ts', old_string: 'a', new_string: 'b' },
            },
            result: {
              type: 'tool_result',
              toolUseId: 'c1-use',
              toolUseResult: {
                filePath: '/repo/src/child.ts',
                structuredPatch: [
                  { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] },
                ],
              },
            },
          }),
        ],
      },
      editToolItem('t2', {
        result: {
          type: 'tool_result',
          toolUseId: 't2-use',
          content: 'something',
          toolUseResult: 'The file /repo/src/a.ts has been updated successfully.',
        },
      }),
    ])

    expect(changes).toEqual([
      { path: '/repo/src/child.ts', additions: 1, deletions: 1 },
      { path: '/repo/src/a.ts', additions: 1, deletions: 1 },
    ])
  })

  it('returns empty without edit tools or file paths', () => {
    expect(summarizeTurnFileChanges([{ id: 'x1', kind: 'text', text: 'Hi' }])).toEqual([])
    expect(
      summarizeTurnFileChanges([
        {
          id: 't1',
          kind: 'tool',
          use: { type: 'tool_use', name: 'Edit', toolUseId: 't1-use', input: {} },
        },
      ]),
    ).toEqual([])
  })
})
