// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { enrichTaskNotification } from './task-notification'

describe('background task notifications', () => {
  it('normalizes a followed queue notification and loads its output', async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'clotho-follow-output-'))
    const outputFile = path.join(outputDirectory, 'task-1.output')
    await writeFile(outputFile, 'followed output\n', 'utf8')

    try {
      await expect(
        enrichTaskNotification({
          type: 'queue-operation',
          operation: 'enqueue',
          timestamp: '2026-08-28T08:00:00.000Z',
          content: `<task-notification>
<task-id>task-1</task-id>
<tool-use-id>bash-1</tool-use-id>
<output-file>${outputFile}</output-file>
<status>completed</status>
<summary>Background command completed (exit code 0)</summary>
</task-notification>`,
        }),
      ).resolves.toMatchObject({
        type: 'system',
        subtype: 'task_notification',
        task_id: 'task-1',
        tool_use_id: 'bash-1',
        status: 'completed',
        summary: 'Background command completed (exit code 0)',
        result: 'followed output\n',
      })
    } finally {
      await rm(outputDirectory, { recursive: true, force: true })
    }
  })
})
