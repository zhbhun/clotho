import type { ClaudeAttachment } from '@/shared/rpc'

export function draftTitleFromPrompt(
  prompt: string | null | undefined,
  attachments: ClaudeAttachment[] = [],
) {
  const normalizedPrompt = typeof prompt === 'string' ? prompt : ''
  return (
    normalizedPrompt
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ??
    attachments[0]?.name ??
    ''
  )
}
