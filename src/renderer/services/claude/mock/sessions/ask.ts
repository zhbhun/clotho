import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function askLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 2)
  const t1 = ts(0, 1)
  const t2 = ts(0, 0)

  lines.push(
    userText('Configure the new project stack; confirm my preferences for a few options.', {
      ts: t0,
    }),
  )

  lines.push(
    assistantText(
      'Sure, I need to confirm several technology choices. First, choose a state-management library.',
      { ts: t0 },
    ),
  )

  const singleChoiceId = callId()
  lines.push(
    ...toolCallPair(
      'AskUserQuestion',
      {
        questions: [
          {
            question: 'Which library should manage state?',
            header: 'State management',
            options: [
              { label: 'Zustand', description: 'Lightweight, simple API, no boilerplate' },
              {
                label: 'Redux Toolkit',
                description: 'Mature ecosystem, powerful DevTools, suited to large projects',
              },
              { label: 'Jotai', description: 'Atomic state with fine-grained subscriptions' },
            ],
            multiSelect: false,
          },
        ],
      },
      'Your questions have been answered: "Which library should manage state?"="Zustand". You can now continue with these answers in mind.',
      {
        id: singleChoiceId,
        ts: t0,
        toolUseResult: {
          questions: [
            {
              question: 'Which library should manage state?',
              header: 'State management',
              options: [
                { label: 'Zustand', description: 'Lightweight, simple API, no boilerplate' },
                { label: 'Redux Toolkit', description: 'Mature ecosystem with powerful DevTools' },
                { label: 'Jotai', description: 'Atomic state with fine-grained subscriptions' },
              ],
              multiSelect: false,
            },
          ],
          answers: { 'Which library should manage state?': 'Zustand' },
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'You chose Zustand. Next, confirm which toolchain features to enable (multiple selections allowed).',
      { ts: t1 },
    ),
  )

  const multiChoiceId = callId()
  lines.push(
    ...toolCallPair(
      'AskUserQuestion',
      {
        questions: [
          {
            question: 'Which developer-tool features should be enabled?',
            header: 'Toolchain',
            options: [
              { label: 'ESLint', description: 'Static analysis that catches potential issues' },
              {
                label: 'Prettier',
                description: 'Automatic formatting for a consistent code style',
              },
              { label: 'Husky + lint-staged', description: 'Git pre-commit hooks' },
              { label: 'Vitest', description: 'Unit-test framework with native Vite integration' },
            ],
            multiSelect: true,
          },
        ],
      },
      'Your questions have been answered: "Which developer-tool features should be enabled?"="ESLint, Prettier, Vitest". You can now continue with these answers in mind.',
      {
        id: multiChoiceId,
        ts: t1,
        toolUseResult: {
          questions: [
            {
              question: 'Which developer-tool features should be enabled?',
              header: 'Toolchain',
              options: [
                { label: 'ESLint', description: 'Static analysis' },
                { label: 'Prettier', description: 'Automatic formatting' },
                { label: 'Husky + lint-staged', description: 'Git pre-commit hooks' },
                { label: 'Vitest', description: 'Unit-test framework' },
              ],
              multiSelect: true,
            },
          ],
          answers: {
            'Which developer-tool features should be enabled?': 'ESLint, Prettier, Vitest',
          },
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'Confirmed: ESLint + Prettier + Vitest (Husky disabled). Finally, choose the CSS approach.',
      {
        ts: t2,
      },
    ),
  )

  const multiQuestionId = callId()
  lines.push(
    ...toolCallPair(
      'AskUserQuestion',
      {
        questions: [
          {
            question: 'Which CSS approach should we use?',
            header: 'Styling',
            options: [
              { label: 'Tailwind CSS 4', description: 'Utility-first CSS for fast development' },
              { label: 'CSS Modules', description: 'Local scope with no runtime cost' },
            ],
            multiSelect: false,
          },
          {
            question: 'Which UI component library should we use?',
            header: 'Component library',
            options: [
              { label: 'shadcn/ui', description: 'Copyable code with full control' },
              { label: 'Radix UI', description: 'Unstyled primitives' },
              { label: 'No component library', description: 'Hand-written components' },
            ],
            multiSelect: false,
          },
        ],
      },
      'Your questions have been answered: "Which CSS approach should we use?"="Tailwind CSS 4", "Which UI component library should we use?"="shadcn/ui". You can now continue with these answers in mind.',
      {
        id: multiQuestionId,
        ts: t2,
        toolUseResult: {
          questions: [
            {
              question: 'Which CSS approach should we use?',
              header: 'Styling',
              options: [
                { label: 'Tailwind CSS 4', description: 'Utility-first CSS' },
                { label: 'CSS Modules', description: 'Local scope' },
              ],
              multiSelect: false,
            },
            {
              question: 'Which UI component library should we use?',
              header: 'Component library',
              options: [
                { label: 'shadcn/ui', description: 'Copyable code' },
                { label: 'Radix UI', description: 'Unstyled primitives' },
                { label: 'No component library', description: 'Hand-written components' },
              ],
              multiSelect: false,
            },
          ],
          answers: {
            'Which CSS approach should we use?': 'Tailwind CSS 4',
            'Which UI component library should we use?': 'shadcn/ui',
          },
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'The stack is confirmed: Zustand + ESLint/Prettier/Vitest + Tailwind CSS 4 + shadcn/ui.',
      { ts: t2 },
    ),
  )

  return lines
}
