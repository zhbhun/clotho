import { pickString, recordValue } from '../tools/shared/utils'
import type { ConversationTimelineItem } from './types'
import { EDIT_TOOL_NAMES } from './work-runs'

/** One file's churn inside a turn: project-relative display path plus diff line counts. */
export interface TurnFileChange {
  path: string
  additions: number
  deletions: number
}

/**
 * Summarize the files a turn's Edit/Write calls touched, including subagent
 * children. Same-file calls merge into one entry with summed churn, ordered by
 * first touch.
 */
export function summarizeTurnFileChanges(items: ConversationTimelineItem[]): TurnFileChange[] {
  const byPath = new Map<string, TurnFileChange>()

  const visit = (timelineItems: ConversationTimelineItem[]) => {
    for (const item of timelineItems) {
      if (item.kind !== 'tool') continue
      const change = fileChangeOfTool(item)
      if (change) {
        const existing = byPath.get(change.path)
        if (existing) {
          existing.additions += change.additions
          existing.deletions += change.deletions
        } else {
          byPath.set(change.path, change)
        }
      }
      if (item.children) visit(item.children)
    }
  }

  visit(items)
  return [...byPath.values()]
}

function fileChangeOfTool(
  item: Extract<ConversationTimelineItem, { kind: 'tool' }>,
): TurnFileChange | undefined {
  const name = item.use?.name ?? ''
  if (!EDIT_TOOL_NAMES.has(name)) return undefined

  const input = recordValue(item.use?.input)
  const result = recordValue(item.result?.toolUseResult)
  const path =
    pickString(input, ['file_path', 'path']) || pickString(result, ['filePath', 'file_path'])
  if (!path) return undefined

  const patch = Array.isArray(result.structuredPatch) ? result.structuredPatch : []
  let additions = 0
  let deletions = 0
  for (const hunk of patch) {
    const lines = recordValue(hunk).lines
    if (!Array.isArray(lines)) continue
    for (const line of lines) {
      if (typeof line !== 'string') continue
      if (line.startsWith('+')) additions += 1
      else if (line.startsWith('-')) deletions += 1
    }
  }

  if (!patch.length) {
    // New files carry no patch hunks; their content is the addition. Edits
    // without a patch fall back to the replaced strings' line churn.
    if (result.type === 'create' || name === 'Write' || name === 'FileWriteTool') {
      const content = pickString(result, ['content']) || pickString(input, ['content'])
      additions = lineCount(content)
    } else {
      additions = lineCount(pickString(result, ['newString']) || pickString(input, ['new_string']))
      deletions = lineCount(pickString(result, ['oldString']) || pickString(input, ['old_string']))
    }
  }

  return { path, additions, deletions }
}

function lineCount(text: string): number {
  if (!text) return 0
  return text.split('\n').length
}
