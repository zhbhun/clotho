import { promises as fs } from 'node:fs'

import type { ClaudeJsonLine } from '@/shared/rpc'

function decodeXmlText(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function xmlTextField(content: string, tag: string) {
  const match = content.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return decodeXmlText(match?.[1]?.trim() ?? '')
}

function normalizeQueuedNotification(entry: ClaudeJsonLine): ClaudeJsonLine | null {
  if (entry.type !== 'queue-operation' || entry.operation !== 'enqueue') return null
  const content = typeof entry.content === 'string' ? entry.content.trim() : ''
  if (!content.startsWith('<task-notification>')) return null

  return {
    ...entry,
    type: 'system',
    subtype: 'task_notification',
    task_id: xmlTextField(content, 'task-id'),
    tool_use_id: xmlTextField(content, 'tool-use-id'),
    output_file: xmlTextField(content, 'output-file'),
    status: xmlTextField(content, 'status'),
    summary: xmlTextField(content, 'summary'),
    result: xmlTextField(content, 'result') || undefined,
  }
}

function taskNotificationEntry(entry: ClaudeJsonLine) {
  if (entry.type === 'system' && entry.subtype === 'task_notification') return entry
  return normalizeQueuedNotification(entry)
}

/**
 * Normalize terminal task notifications and attach the task's output file contents.
 * Claude commonly emits only output_file for background Bash/Monitor completion.
 */
export async function enrichTaskNotification(entry: ClaudeJsonLine): Promise<ClaudeJsonLine> {
  const notification = taskNotificationEntry(entry)
  if (!notification) return entry
  if (typeof notification.result === 'string' && notification.result.trim()) return notification

  const outputFile =
    typeof notification.output_file === 'string' ? notification.output_file.trim() : ''
  if (!outputFile) return notification

  try {
    return { ...notification, result: await fs.readFile(outputFile, 'utf8') }
  } catch {
    return notification
  }
}
