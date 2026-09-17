import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function bashLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 2)
  const t1 = ts(0, 1)
  const t2 = ts(0, 0)

  lines.push(
    userText(
      'List the files in the current directory, check whether node is available, then list node_modules.',
      {
        ts: t0,
      },
    ),
  )

  lines.push(
    assistantText('Sure, I will list the files in the current directory first.', { ts: t0 }),
  )

  const lsId = callId()
  const lsOutput = `total 1208
drwxr-xr-x   11 zhanghuabin  staff     352 Jul  2 17:38 .
drwxr-xr-x   42 zhanghuabin  staff    1344 Jul  2 09:55 ..
-rw-r--r--@   1 zhanghuabin  staff     612 Jul  2 10:14 .eslintrc.json
-rw-r--r--@   1 zhanghuabin  staff    6099 Jul  2 10:14 debounce.js
drwxr-xr-x@   4 zhanghuabin  staff     128 Jul  2 10:14 dist
-rw-r--r--@   1 zhanghuabin  staff   545946 Jul  2 10:13 lodash.js
drwxr-xr-x@   8 zhanghuabin  staff     256 Jul  2 10:14 node_modules
-rw-r--r--@   1 zhanghuabin  staff      48 Jul  2 10:14 package.json`
  lines.push(
    ...toolCallPair(
      'Bash',
      { command: 'ls -la', description: 'List all files and folders in the current directory' },
      lsOutput,
      {
        id: lsId,
        ts: t0,
        toolUseResult: {
          stdout: lsOutput,
          stderr: '',
          interrupted: false,
          isImage: false,
          noOutputExpected: false,
        },
      },
    ),
  )

  lines.push(
    assistantText('The directory contents are listed. Next, check whether node is available.', {
      ts: t1,
    }),
  )

  const nodeFailId = callId()
  const failContent = 'Exit code 127\nzsh: command not found: node'
  lines.push(
    ...toolCallPair(
      'Bash',
      { command: 'node --version', description: 'Check whether node is installed' },
      failContent,
      {
        id: nodeFailId,
        isError: true,
        ts: t1,
        toolUseResult: {
          stdout: '',
          stderr: 'zsh: command not found: node',
          interrupted: false,
          exitCode: 127,
          isImage: false,
          noOutputExpected: false,
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'node is not installed (exit code 127). I will use pnpm to verify the environment and inspect node_modules.',
      { ts: t2 },
    ),
  )

  const pnpmId = callId()
  const pnpmOutput = '9.15.0'
  lines.push(
    ...toolCallPair('Bash', { command: 'pnpm --version' }, pnpmOutput, {
      id: pnpmId,
      ts: t2,
      toolUseResult: {
        stdout: pnpmOutput,
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
      },
    }),
  )

  lines.push(
    assistantText(
      'pnpm 9.15.0 is available. Here is the complete node_modules listing; the long output will be collapsed.',
      {
        ts: t2,
      },
    ),
  )

  const longId = callId()
  const longEntries = Array.from({ length: 120 }, (_, i) => {
    const names = [
      'vite',
      'react',
      'react-dom',
      'typescript',
      'tailwindcss',
      '@anthropic-ai/claude-agent-sdk',
      'electron',
      'zustand',
      'lucide-react',
      '@radix-ui/react-dialog',
    ]
    return `drwxr-xr-x   3 zhanghuabin  staff     96 Jul  2 10:14 ${names[i % names.length]}${i >= names.length ? `-${Math.floor(i / names.length)}` : ''}`
  })
  const longOutput = `total ${longEntries.length * 3}\n${longEntries.join('\n')}`
  lines.push(
    ...toolCallPair(
      'Bash',
      { command: 'ls -1 node_modules', description: 'List all packages under node_modules' },
      longOutput,
      {
        id: longId,
        ts: t2,
        toolUseResult: {
          stdout: longOutput,
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
      'node_modules contains 120 packages. Environment summary: node is not installed, pnpm 9.15.0 is available, and dependencies are installed.',
      {
        ts: t2,
      },
    ),
  )

  return lines
}
