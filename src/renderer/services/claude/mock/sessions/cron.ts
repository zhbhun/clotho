import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function cronLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 2)
  const t1 = ts(0, 1)
  const t2 = ts(0, 0)

  lines.push(
    userText(
      'Set up two scheduled tasks: check the build hourly, and remind me to review PR #42 at 15:23 today. List them, delete the recurring task, then confirm.',
      { ts: t0 },
    ),
  )

  lines.push(
    assistantText(
      'Sure, first create a recurring task that runs at minute 7 of every hour to avoid the top-of-hour rush. CronCreate defaults recurring to true.',
      { ts: t0 },
    ),
  )

  const createRecurringId = callId()
  lines.push(
    ...toolCallPair(
      'CronCreate',
      { cron: '7 * * * *', prompt: 'Check the build status' },
      'Scheduled recurring job c9078198 (Every hour at :07). Session-only (not written to disk, dies when Claude exits). Auto-expires after 7 days. Use CronDelete to cancel sooner.',
      {
        id: createRecurringId,
        ts: t0,
        toolUseResult: {
          id: 'c9078198',
          humanSchedule: 'Every hour at :07',
          recurring: true,
          durable: false,
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'Recurring task c9078198 is created. Now create a one-time reminder for 15:23 today with recurring set to false.',
      { ts: t1 },
    ),
  )

  const createOneshotId = callId()
  lines.push(
    ...toolCallPair(
      'CronCreate',
      { cron: '23 15 12 7 *', prompt: 'review PR #42', recurring: false },
      'Scheduled one-shot task 23540db1 (23 15 12 7 *). Session-only (not written to disk, dies when Claude exits). It will fire once then auto-delete.',
      {
        id: createOneshotId,
        ts: t1,
        toolUseResult: {
          id: '23540db1',
          humanSchedule: '23 15 12 7 *',
          recurring: false,
          durable: false,
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'Both tasks are created. Now use CronList to list all tasks in the current session.',
      { ts: t1 },
    ),
  )

  const listId1 = callId()
  lines.push(
    ...toolCallPair(
      'CronList',
      {},
      'c9078198 — Every hour at :07 (recurring) [session-only]: Check the build status\n23540db1 — 23 15 12 7 * (one-shot) [session-only]: review PR #42',
      {
        id: listId1,
        ts: t1,
        toolUseResult: {
          jobs: [
            {
              id: 'c9078198',
              cron: '7 * * * *',
              humanSchedule: 'Every hour at :07',
              prompt: 'Check the build status',
              recurring: true,
              durable: false,
            },
            {
              id: '23540db1',
              cron: '23 15 12 7 *',
              humanSchedule: '23 15 12 7 *',
              prompt: 'review PR #42',
              durable: false,
            },
          ],
        },
      },
    ),
  )

  lines.push(
    assistantText('The list confirms 2 tasks. Now delete recurring task c9078198.', { ts: t2 }),
  )

  const deleteId = callId()
  lines.push(
    ...toolCallPair('CronDelete', { id: 'c9078198' }, 'Cancelled job c9078198.', {
      id: deleteId,
      ts: t2,
      toolUseResult: { id: 'c9078198' },
    }),
  )

  lines.push(assistantText('Deleted. Use CronList again to confirm the result.', { ts: t2 }))

  const listId2 = callId()
  lines.push(
    ...toolCallPair(
      'CronList',
      {},
      '23540db1 — 23 15 12 7 * (one-shot) [session-only]: review PR #42',
      {
        id: listId2,
        ts: t2,
        toolUseResult: {
          jobs: [
            {
              id: '23540db1',
              cron: '23 15 12 7 *',
              humanSchedule: '23 15 12 7 *',
              prompt: 'review PR #42',
              durable: false,
            },
          ],
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'Done. Recurring task c9078198 is deleted; only one-time reminder 23540db1 remains and fires at 15:23 today. Both tasks are session-scoped, not persisted, and expire when Claude exits.',
      { ts: t2 },
    ),
  )

  return lines
}
