import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function todoLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 2)
  const t1 = ts(0, 1)
  const t2 = ts(0, 0)

  const successContent =
    'Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if is applicable'

  const templates = [
    {
      content: 'Analyze the existing style structure',
      activeForm: 'Analyze the existing style structure',
    },
    { content: 'Extract design tokens into CSS variables', activeForm: 'Extract design tokens' },
    {
      content: 'Migrate components to the new token system',
      activeForm: 'Migrate components to the new token system',
    },
    { content: 'Verify responsive breakpoints', activeForm: 'Verify responsive breakpoints' },
  ]

  const buildTodos = (statuses: Array<'pending' | 'in_progress' | 'completed'>) =>
    templates.map((t, i) => ({ ...t, status: statuses[i] }))

  const state0 = buildTodos(['in_progress', 'pending', 'pending', 'pending'])
  const state1 = buildTodos(['completed', 'in_progress', 'pending', 'pending'])
  const state2 = buildTodos(['completed', 'completed', 'in_progress', 'pending'])

  lines.push(
    userText("Refactor this module's styling system and track each step with a todo list.", {
      ts: t0,
    }),
  )

  lines.push(
    assistantText(
      'Sure, I will create a refactoring checklist with TodoWrite and work through it step by step.',
      { ts: t0 },
    ),
  )

  const createId = callId()
  lines.push(
    ...toolCallPair('TodoWrite', { todos: state0 }, successContent, {
      id: createId,
      ts: t0,
      toolUseResult: { oldTodos: [], newTodos: state0 },
    }),
  )

  lines.push(
    assistantText(
      'Style analysis is complete. Styles are scattered across hardcoded values, so I will extract design tokens next.',
      {
        ts: t1,
      },
    ),
  )

  const update1Id = callId()
  lines.push(
    ...toolCallPair('TodoWrite', { todos: state1 }, successContent, {
      id: update1Id,
      ts: t1,
      toolUseResult: { oldTodos: state0, newTodos: state1 },
    }),
  )

  lines.push(
    assistantText(
      'Design tokens are now CSS variables. Next, migrate components to the new token system.',
      { ts: t2 },
    ),
  )

  const update2Id = callId()
  lines.push(
    ...toolCallPair('TodoWrite', { todos: state2 }, successContent, {
      id: update2Id,
      ts: t2,
      toolUseResult: { oldTodos: state1, newTodos: state2 },
    }),
  )

  lines.push(
    assistantText(
      'Component migration is complete; responsive breakpoint verification remains. Progress: 3/4 complete, 1 todo remaining.',
      {
        ts: t2,
      },
    ),
  )

  return lines
}
