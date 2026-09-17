import { useTranslation } from 'react-i18next'

import { HeightCollapsible } from './content'

interface ParsedTaskOutput {
  retrievalStatus?: string
  taskId?: string
  taskType?: string
  status?: string
  exitCode?: string
  output?: string
}

function xmlField(text: string | undefined, tag: string): string {
  if (!text) return ''
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function parseTaskOutput(result?: string): ParsedTaskOutput {
  return {
    retrievalStatus: xmlField(result, 'retrieval_status') || undefined,
    taskId: xmlField(result, 'task_id') || undefined,
    taskType: xmlField(result, 'task_type') || undefined,
    status: xmlField(result, 'status') || undefined,
    exitCode: xmlField(result, 'exit_code') || undefined,
    output: xmlField(result, 'output') || undefined,
  }
}

export function TaskOutputTranscript({ taskId, result }: { taskId: string; result?: string }) {
  const { t } = useTranslation()
  const parsed = parseTaskOutput(result)
  const displayTaskId = parsed.taskId || taskId
  const details = [
    parsed.status ? t('tools.taskOutput.status', { value: parsed.status }) : '',
    parsed.exitCode ? t('tools.taskOutput.exit', { value: parsed.exitCode }) : '',
    parsed.taskType ? parsed.taskType : '',
  ].filter(Boolean)

  if (parsed.output) {
    return <HeightCollapsible text={parsed.output} mono edgeOverlay />
  }

  if (details.length || displayTaskId || parsed.retrievalStatus) {
    return (
      <div className="font-mono text-xs leading-relaxed text-foreground-subtlest">
        {displayTaskId ? <div>{t('tools.taskOutput.task', { value: displayTaskId })}</div> : null}
        {details.length ? <div>{details.join(' · ')}</div> : null}
        {parsed.retrievalStatus ? (
          <div>{t('tools.taskOutput.retrieval', { value: parsed.retrievalStatus })}</div>
        ) : null}
      </div>
    )
  }

  return result ? <HeightCollapsible text={result} mono edgeOverlay /> : null
}
