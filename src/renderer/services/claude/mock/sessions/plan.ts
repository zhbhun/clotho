import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function planLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 2)
  const t1 = ts(0, 1)
  const t2 = ts(0, 0)

  lines.push(
    userText(
      'I want to refactor the state-management layer, but plan the approach before making changes. Do not write code yet.',
      { ts: t0 },
    ),
  )

  lines.push(
    assistantText(
      'Sure, I will enter plan mode, explore the codebase carefully, and then provide a complete plan.',
      { ts: t0 },
    ),
  )

  const enterId = callId()
  lines.push(
    ...toolCallPair(
      'EnterPlanMode',
      {},
      'Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.',
      {
        id: enterId,
        ts: t0,
        toolUseResult: {
          message:
            'Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.',
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'I analyzed the existing store structure and found three opportunities: 1) state is scattered across multiple Contexts; 2) derived selectors are missing; 3) side effects are not centrally managed. I will exit plan mode and submit the plan for approval.',
      { ts: t1 },
    ),
  )

  const exitApprovedId = callId()
  lines.push(
    ...toolCallPair(
      'ExitPlanMode',
      {},
      'User has approved exiting plan mode. You can now proceed.',
      {
        id: exitApprovedId,
        ts: t1,
        toolUseResult: {
          plan: null,
          isAgent: false,
          filePath: '/Users/zhanghuabin/.claude/plans/rippling-fluttering-sun.md',
        },
      },
    ),
  )

  lines.push(
    assistantText('The plan is approved and implementation begins. Now simulate a rejected plan.', {
      ts: t2,
    }),
  )

  const enter2Id = callId()
  lines.push(
    ...toolCallPair(
      'EnterPlanMode',
      {},
      'Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.',
      {
        id: enter2Id,
        ts: t2,
        toolUseResult: {
          message:
            'Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.',
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'This time I proposed an aggressive approach that replaces everything with Zustand.',
      { ts: t2 },
    ),
  )

  const exitRejectedId = callId()
  lines.push(
    ...toolCallPair(
      'ExitPlanMode',
      {},
      'User has rejected exiting plan mode. Please revise the plan based on feedback.',
      {
        id: exitRejectedId,
        isError: true,
        ts: t2,
        toolUseResult: {
          behavior: 'denied',
          status: 'rejected',
          isAgent: false,
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'The plan was rejected. I will keep the existing Context architecture and introduce only a selector layer.',
      { ts: t2 },
    ),
  )

  return lines
}
