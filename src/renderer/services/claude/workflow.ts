export interface ClaudeWorkflowLaunch {
  runId?: string
  taskId?: string
  workflowName?: string
  summary?: string
  script?: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringField(value: unknown, key: string): string | undefined {
  const field = record(value)[key]
  return typeof field === 'string' && field.trim() ? field.trim() : undefined
}

function resultLine(result: string | undefined, label: string): string | undefined {
  const match = result?.match(new RegExp(`^${label}:\\s*(.+)$`, 'im'))
  return match?.[1]?.trim() || undefined
}

function resultToken(result: string | undefined, label: string): string | undefined {
  const match = result?.match(new RegExp(`(?:^|\\s)${label}:\\s*(\\S+)`, 'i'))
  return match?.[1]?.trim() || undefined
}

function workflowNameFromScript(script: string | undefined): string | undefined {
  return script?.match(/\bname\s*:\s*['"`]([^'"`]+)['"`]/)?.[1]?.trim() || undefined
}

function workflowNameFromPath(path: string | undefined, runId: string | undefined) {
  if (!path) return undefined
  const filename = path.split('/').at(-1) ?? path
  const suffix = runId ? `-${runId}.js` : undefined
  if (suffix && filename.endsWith(suffix)) return filename.slice(0, -suffix.length) || undefined
  return filename.replace(/\.js$/, '') || undefined
}

export function parseWorkflowLaunch({
  input,
  result,
  toolUseResult,
}: {
  input?: unknown
  result?: string
  toolUseResult?: unknown
}): ClaudeWorkflowLaunch {
  const runId = stringField(toolUseResult, 'runId') ?? resultLine(result, 'Run ID')
  const script = stringField(input, 'script')
  const scriptPath =
    stringField(input, 'scriptPath') ?? resultLine(result, 'Script file') ?? undefined
  return {
    runId,
    taskId: stringField(toolUseResult, 'taskId') ?? resultToken(result, 'Task ID'),
    workflowName:
      stringField(toolUseResult, 'workflowName') ??
      workflowNameFromScript(script) ??
      workflowNameFromPath(scriptPath, runId),
    summary: stringField(toolUseResult, 'summary') ?? resultLine(result, 'Summary'),
    script,
  }
}
