import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ClaudeBackgroundTask } from '../../conversation/types'
import { HeightCollapsible } from './content'
import type { ToolRenderer } from './types'
import { pickString } from './utils'

export function commandRenderer(
  label: string,
  description: string,
  icon: LucideIcon,
  prompt?: string,
): ToolRenderer {
  return {
    icon,
    label,
    description,
    summary: (input) => pickString(input, ['description', 'command', 'script']),
    inputView: (input) => (
      <CommandInput command={pickString(input, ['command', 'script'])} prompt={prompt} />
    ),
    bodyItemView: ({ input, result, backgroundTask }) =>
      isBackgroundCommand(input) || backgroundTask ? (
        <BackgroundTaskTranscript
          command={pickString(input, ['command', 'script'])}
          prompt={prompt ?? '$'}
          task={backgroundTask}
        />
      ) : (
        <TerminalTranscript
          command={pickString(input, ['command', 'script'])}
          output={result}
          prompt={prompt}
        />
      ),
  }
}

function isBackgroundCommand(input: unknown): boolean {
  return Boolean((input as { run_in_background?: unknown } | undefined)?.run_in_background)
}

function CommandInput({ command, prompt = '$' }: { command: string; prompt?: string }) {
  if (!command) return null
  return (
    <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-foreground-subtlest">
      <span className="text-foreground-subtlest">{prompt} </span>
      {command}
    </pre>
  )
}

export function BackgroundTaskTranscript({
  command,
  task,
  prompt,
}: {
  command: string
  task?: ClaudeBackgroundTask
  prompt?: string
}) {
  const { t } = useTranslation()
  const commandLine = command ? (prompt ? `${prompt} ${command}` : command) : ''
  const detail = (() => {
    if (!task) return ''
    if (task.status === 'running') {
      return `${t('tools.command.runningInBackground')} · ${task.taskId}`
    }
    if (task.status === 'completed') {
      if (task.output?.trim()) return task.output
      return task.exitCode === undefined
        ? t('tools.command.completed')
        : t('tools.command.completedWithExitCode', { exitCode: task.exitCode })
    }
    if (task.status === 'failed') {
      return task.output?.trim() || task.summary || t('tools.command.failed')
    }
    return [task.output?.trim(), t('tools.command.stopped')].filter(Boolean).join('\n')
  })()
  const transcript = [commandLine, detail].filter(Boolean).join('\n')
  if (!transcript) return null
  return <HeightCollapsible text={transcript} mono edgeOverlay />
}

function TerminalTranscript({
  command,
  output,
  prompt = '$',
}: {
  command: string
  output?: string
  prompt?: string
}) {
  const transcript = [command ? `${prompt} ${command}` : '', output ?? '']
    .filter(Boolean)
    .join('\n')
  if (!transcript) return null
  return <HeightCollapsible text={transcript} mono edgeOverlay />
}
