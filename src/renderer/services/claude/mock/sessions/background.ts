import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function backgroundLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 3)
  const t1 = ts(0, 2)
  const t2 = ts(0, 1)
  const t3 = ts(0, 0)

  lines.push(
    userText(
      'Start a background task to run the build script, use Monitor on a short command, inspect the background output, and stop it at the end.',
      { ts: t0 },
    ),
  )

  lines.push(
    assistantText('Sure, I will use Monitor on a 3-second task to demonstrate monitoring.', {
      ts: t0,
    }),
  )

  const monitorId = callId()
  lines.push(
    ...toolCallPair(
      'Monitor',
      {
        command: 'sleep 3; echo "Waited 3 seconds; moving to task two"',
        description: 'Wait 3 seconds after task one completes',
        timeout_ms: 10000,
        persistent: false,
      },
      'Monitor started (task b3b8y2eyc, timeout 10000ms). You will be notified on each event.',
      {
        id: monitorId,
        ts: t0,
        toolUseResult: { taskId: 'b3b8y2eyc', timeoutMs: 10000, persistent: false },
      },
    ),
  )

  lines.push(
    assistantText('Monitor is running (task b3b8y2eyc). Now start a background build task.', {
      ts: t1,
    }),
  )

  const buildId = callId()
  lines.push(
    ...toolCallPair(
      'Bash',
      {
        command: 'pnpm run package',
        description: 'Run the production build in the background',
        run_in_background: true,
      },
      'Continued in background with ID: bhyj3hsdq. You can check the status by reading the file.',
      {
        id: buildId,
        ts: t1,
        toolUseResult: {
          stdout:
            'Continued in background with ID: bhyj3hsdq. You can check the status by reading the file.',
          stderr: '',
          interrupted: false,
          isImage: false,
          noOutputExpected: false,
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'Background build task bhyj3hsdq is running. Use TaskOutput to wait for its result.',
      {
        ts: t2,
      },
    ),
  )

  const outputId = callId()
  lines.push(
    ...toolCallPair(
      'TaskOutput',
      { task_id: 'bhyj3hsdq', block: true, timeout: 30000 },
      '<retrieval_status>success</retrieval_status>\n\n<task_id>bhyj3hsdq</task_id>\n\n<task_type>local_bash</task_type>\n\n<status>completed</status_type>\n\n<exit_code>0</exit_code>\n\n<output>\nvite v8.0.0 building for production...\n✓ 204 modules transformed.\ndist/index.html                  0.46 kB │ gzip:  0.30 kB\ndist/assets/index-Dqwd7VPl.js   528.41 kB │ gzip: 168.32 kB\n✓ built in 458ms\n</output>',
      {
        id: outputId,
        ts: t2,
        toolUseResult: {
          retrieval_status: 'success',
          task: {
            task_id: 'bhyj3hsdq',
            task_type: 'local_bash',
            status: 'completed',
            description: 'Run the production build in the background',
            output:
              'vite v8.0.0 building for production...\n✓ 204 modules transformed.\n✓ built in 458ms\n',
            exitCode: 0,
          },
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'The build completed successfully (exit code 0). Finally, demonstrate stopping a long task with TaskStop.',
      {
        ts: t3,
      },
    ),
  )

  const longTaskId = callId()
  lines.push(
    ...toolCallPair(
      'Bash',
      {
        command: 'sleep 300; echo "Sleep ended after 300 seconds"',
        description: 'Simulate a long-running background task',
        run_in_background: true,
      },
      'Continued in background with ID: b07lc7nsh.',
      {
        id: longTaskId,
        ts: t3,
        toolUseResult: {
          stdout: 'Continued in background with ID: b07lc7nsh.',
          stderr: '',
          interrupted: false,
          isImage: false,
          noOutputExpected: false,
        },
      },
    ),
  )

  const stopId = callId()
  lines.push(
    ...toolCallPair(
      'TaskStop',
      { task_id: 'b07lc7nsh' },
      '{"message":"Successfully stopped task: b07lc7nsh (sleep 300; echo \\"Sleep ended after 300 seconds\\")","task_id":"b07lc7nsh","task_type":"local_bash","command":"sleep 300; echo \\"Sleep ended after 300 seconds\\""}',
      {
        id: stopId,
        ts: t3,
        toolUseResult: {
          message:
            'Successfully stopped task: b07lc7nsh (sleep 300; echo "Sleep ended after 300 seconds")',
          task_id: 'b07lc7nsh',
          task_type: 'local_bash',
          command: 'sleep 300; echo "Sleep ended after 300 seconds"',
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'Long task b07lc7nsh stopped successfully. The background command workflow demo is complete.',
      { ts: t3 },
    ),
  )

  return lines
}
