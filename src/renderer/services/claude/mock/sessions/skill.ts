import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function skillLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 1)
  const t1 = ts(0, 0)

  lines.push(
    userText(
      'I want to design a new feature module through brainstorming; call the brainstorming skill.',
      {
        ts: t0,
      },
    ),
  )

  lines.push(
    assistantText(
      'Sure, I will call the superpowers:brainstorming skill to guide us through requirements and design step by step.',
      { ts: t0 },
    ),
  )

  const brainstormId = callId()
  lines.push(
    ...toolCallPair(
      'Skill',
      {
        skill: 'superpowers:brainstorming',
        args: 'Design a conversation search feature supporting keyword, time-range, and project filters for history',
      },
      'Launching skill: superpowers:brainstorming',
      {
        id: brainstormId,
        ts: t0,
        toolUseResult: { success: true, commandName: 'superpowers:brainstorming' },
      },
    ),
  )

  lines.push(
    assistantText(
      'The brainstorming skill is running. Next, demonstrate the error case for a missing skill.',
      {
        ts: t1,
      },
    ),
  )

  const failId = callId()
  lines.push(
    ...toolCallPair(
      'Skill',
      { skill: 'nonexistent:invalid-skill', args: 'Test the error case' },
      'Error: Skill not found: nonexistent:invalid-skill',
      {
        id: failId,
        isError: true,
        ts: t1,
        toolUseResult: { success: false, commandName: 'nonexistent:invalid-skill' },
      },
    ),
  )

  lines.push(
    assistantText('That skill does not exist. The Skill tool demo is complete.', { ts: t1 }),
  )

  return lines
}
