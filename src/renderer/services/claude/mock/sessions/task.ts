import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function taskLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 2)
  const t1 = ts(0, 1)
  const t2 = ts(0, 0)

  lines.push(
    userText('Plan the setup steps for this project and track progress with a task list.', {
      ts: t0,
    }),
  )

  lines.push(
    assistantText(
      'Sure, I will break the project setup into 3 tasks so each step is easy to track.',
      { ts: t0 },
    ),
  )

  const create1Id = callId()
  lines.push(
    ...toolCallPair(
      'TaskCreate',
      {
        subject: 'Explore project context',
        description:
          'Inspect the current directory, dependency structure, and existing configuration',
        activeForm: 'Exploring project context',
      },
      'Task #1 created successfully: Explore project context',
      {
        id: create1Id,
        ts: t0,
        toolUseResult: { task: { id: '1', subject: 'Explore project context' } },
      },
    ),
  )

  const create2Id = callId()
  lines.push(
    ...toolCallPair(
      'TaskCreate',
      {
        subject: 'Initialize project structure',
        description: 'Create the src directory and configure Vite and TypeScript',
        activeForm: 'Initializing project structure',
      },
      'Task #2 created successfully: Initialize project structure',
      {
        id: create2Id,
        ts: t0,
        toolUseResult: { task: { id: '2', subject: 'Initialize project structure' } },
      },
    ),
  )

  const create3Id = callId()
  lines.push(
    ...toolCallPair(
      'TaskCreate',
      {
        subject: 'Implement core features',
        description: 'Implement the main interface and data layer',
        activeForm: 'Implementing core features',
      },
      'Task #3 created successfully: Implement core features',
      {
        id: create3Id,
        ts: t0,
        toolUseResult: { task: { id: '3', subject: 'Implement core features' } },
      },
    ),
  )

  lines.push(assistantText('The 3 tasks are ready. Now start task 1.', { ts: t1 }))

  const start1Id = callId()
  lines.push(
    ...toolCallPair(
      'TaskUpdate',
      { taskId: '1', status: 'in_progress' },
      'Updated task #1 status',
      {
        id: start1Id,
        ts: t1,
        toolUseResult: {
          success: true,
          taskId: '1',
          updatedFields: ['status'],
          statusChange: { from: 'pending', to: 'in_progress' },
        },
      },
    ),
  )

  lines.push(assistantText('Task 1 is complete. Continue with task 2.', { ts: t1 }))

  const done1Id = callId()
  lines.push(
    ...toolCallPair('TaskUpdate', { taskId: '1', status: 'completed' }, 'Updated task #1 status', {
      id: done1Id,
      ts: t1,
      toolUseResult: {
        success: true,
        taskId: '1',
        updatedFields: ['status'],
        statusChange: { from: 'in_progress', to: 'completed' },
      },
    }),
  )

  const start2Id = callId()
  lines.push(
    ...toolCallPair(
      'TaskUpdate',
      { taskId: '2', status: 'in_progress' },
      'Updated task #2 status',
      {
        id: start2Id,
        ts: t1,
        toolUseResult: {
          success: true,
          taskId: '2',
          updatedFields: ['status'],
          statusChange: { from: 'pending', to: 'in_progress' },
        },
      },
    ),
  )

  const done2Id = callId()
  lines.push(
    ...toolCallPair('TaskUpdate', { taskId: '2', status: 'completed' }, 'Updated task #2 status', {
      id: done2Id,
      ts: t2,
      toolUseResult: {
        success: true,
        taskId: '2',
        updatedFields: ['status'],
        statusChange: { from: 'in_progress', to: 'completed' },
      },
    }),
  )

  lines.push(
    assistantText(
      'Progress: tasks 1 and 2 are complete; task 3 (Implement core features) is still pending.',
      { ts: t2 },
    ),
  )

  lines.push(assistantText('Use TaskList to inspect the overall task status.', { ts: t2 }))

  const listId = callId()
  lines.push(
    ...toolCallPair(
      'TaskList',
      {},
      '#1 [completed] Explore project context\n#2 [completed] Initialize project structure\n#3 [pending] Implement core features',
      {
        id: listId,
        ts: t2,
        toolUseResult: {
          tasks: [
            { id: '1', subject: 'Explore project context', status: 'completed', blockedBy: [] },
            {
              id: '2',
              subject: 'Initialize project structure',
              status: 'completed',
              blockedBy: [],
            },
            { id: '3', subject: 'Implement core features', status: 'pending', blockedBy: [] },
          ],
        },
      },
    ),
  )

  lines.push(
    assistantText('The overall list is confirmed. Use TaskGet to inspect task 3 details.', {
      ts: t2,
    }),
  )

  const getId = callId()
  lines.push(
    ...toolCallPair(
      'TaskGet',
      { taskId: '3' },
      'Task #3: Implement core features\nStatus: pending\nDescription: Implement the main interface and data layer',
      {
        id: getId,
        ts: t2,
        toolUseResult: {
          task: {
            id: '3',
            subject: 'Implement core features',
            description: 'Implement the main interface and data layer',
            status: 'pending',
            blocks: [],
            blockedBy: [],
          },
        },
      },
    ),
  )

  lines.push(
    assistantText('Task 3 details are loaded; wait for your confirmation before implementation.', {
      ts: t2,
    }),
  )

  return lines
}
