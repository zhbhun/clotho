import type { TFunction } from 'i18next'
import { Plug, Wrench } from 'lucide-react'

import { agentRenderer } from './agent'
import { askUserQuestionRenderer } from './ask-user-question/renderer'
import { bashRenderer } from './bash'
import { cronCreateRenderer } from './cron-create'
import { cronDeleteRenderer } from './cron-delete'
import { cronListRenderer } from './cron-list'
import { editRenderer } from './edit'
import { enterPlanModeRenderer } from './enter-plan-mode'
import { exitPlanModeRenderer } from './exit-plan-mode'
import { globRenderer } from './glob'
import { grepRenderer } from './grep'
import { monitorRenderer } from './monitor'
import { powerShellRenderer } from './power-shell'
import { readRenderer } from './read'
import { JsonInput } from './shared/content'
import { fileToolSummary, isFileToolName } from './shared/file-path'
import type { ToolRenderer } from './shared/types'
import { skillRenderer } from './skill'
import { taskCreateRenderer } from './task-create'
import { taskGetRenderer } from './task-get'
import { taskListRenderer } from './task-list'
import { taskOutputRenderer } from './task-output'
import { taskStopRenderer } from './task-stop'
import { taskUpdateRenderer } from './task-update'
import { todoRenderer } from './todo-write/renderer'
import { webFetchRenderer } from './web-fetch'
import { webSearchRenderer } from './web-search'
import { workflowRenderer } from './workflow'
import { writeRenderer } from './write'

const RENDERERS: Record<string, ToolRenderer> = {
  Read: readRenderer,
  FileReadTool: readRenderer,
  ReadCoalesced: readRenderer,
  Write: writeRenderer,
  FileWriteTool: writeRenderer,
  Edit: editRenderer,
  FileEditTool: editRenderer,
  Grep: grepRenderer,
  GrepTool: grepRenderer,
  Glob: globRenderer,
  GlobTool: globRenderer,
  Bash: bashRenderer,
  BashTool: bashRenderer,
  PowerShell: powerShellRenderer,
  PowerShellTool: powerShellRenderer,
  TaskOutput: taskOutputRenderer,
  TaskOutputTool: taskOutputRenderer,
  task_output: taskOutputRenderer,
  TaskStop: taskStopRenderer,
  TaskStopTool: taskStopRenderer,
  task_stop: taskStopRenderer,
  Monitor: monitorRenderer,
  MonitorTool: monitorRenderer,
  WebSearch: webSearchRenderer,
  WebSearchTool: webSearchRenderer,
  WebFetch: webFetchRenderer,
  WebFetchTool: webFetchRenderer,
  TodoWrite: todoRenderer,
  TodoWriteTool: todoRenderer,
  AskUserQuestion: askUserQuestionRenderer,
  AskUserQuestionTool: askUserQuestionRenderer,
  AgentTool: agentRenderer,
  Agent: agentRenderer,
  Task: agentRenderer,
  TaskList: taskListRenderer,
  TaskListTool: taskListRenderer,
  TaskGet: taskGetRenderer,
  TaskGetTool: taskGetRenderer,
  CronCreate: cronCreateRenderer,
  CronCreateTool: cronCreateRenderer,
  CronList: cronListRenderer,
  CronListTool: cronListRenderer,
  CronDelete: cronDeleteRenderer,
  CronDeleteTool: cronDeleteRenderer,
  TaskCreate: taskCreateRenderer,
  TaskCreateTool: taskCreateRenderer,
  TaskUpdate: taskUpdateRenderer,
  TaskUpdateTool: taskUpdateRenderer,
  Skill: skillRenderer,
  SkillTool: skillRenderer,
  EnterPlanMode: enterPlanModeRenderer,
  EnterPlanModeTool: enterPlanModeRenderer,
  ExitPlanMode: exitPlanModeRenderer,
  ExitPlanModeTool: exitPlanModeRenderer,
  Workflow: workflowRenderer,
  WorkflowTool: workflowRenderer,
}

const DEFAULT_RENDERER: ToolRenderer = {
  icon: Wrench,
  label: 'tools.default.label',
  description: 'tools.default.description',
  summary: () => '',
  inputView: (input) => <JsonInput input={input} />,
}

/**
 * Untranslated tool name shown in row headings. Built-ins use their registry
 * label ("Read", "TodoWrite"); MCP tools use the "MCP" label with the
 * qualified tool name carried by the summary; other unknown tools fall back
 * to the raw Claude name.
 */
export function getToolDisplayName(
  name: string | undefined,
  renderer: ToolRenderer,
  t: TFunction,
): string {
  const isRegistered = Boolean(name && RENDERERS[name])
  const isMcp = Boolean(name?.replace(/Tool$/, '').startsWith('mcp__'))
  if (isRegistered || isMcp) {
    return (t as unknown as (key: string) => string)(renderer.label)
  }
  return name ? formatToolDisplayName(name) : ''
}

export function getToolRenderer(name?: string): ToolRenderer {
  if (!name) return DEFAULT_RENDERER
  if (RENDERERS[name]) return RENDERERS[name]

  const trimmedName = name.replace(/Tool$/, '')
  const isMcp = trimmedName.startsWith('mcp__')
  const renderer: ToolRenderer = {
    ...DEFAULT_RENDERER,
    icon: isMcp ? Plug : Wrench,
    label: isMcp ? 'tools.default.mcpLabel' : 'tools.default.label',
    description: isMcp ? 'tools.default.mcpDescription' : 'tools.default.description',
    // MCP rows render as "MCP · server:tool": the qualified tool name belongs
    // to the summary. For unknown built-ins the raw name is the identity, and
    // a summary would only repeat it.
    summary: isMcp ? () => mcpToolName(trimmedName) : () => '',
  }
  return renderer
}

export function getToolSummary({
  name,
  input,
  renderer,
  projectPath,
  result,
  t,
  toolUseResult,
}: {
  name?: string
  input: unknown
  renderer: ToolRenderer
  projectPath?: string
  result?: string
  toolUseResult?: unknown
  t: TFunction
}): string {
  if (isFileToolName(name)) return fileToolSummary(input, projectPath)
  return renderer.summary(input, result, toolUseResult, t)
}

export function formatToolDisplayName(name: string): string {
  return name.replace(/Tool$/, '')
}

/** `mcp__server__tool_name` → `server:tool_name`; `__` is the separator. */
function mcpToolName(name: string): string {
  return name.replace(/^mcp__/, '').replace(/__+/g, ':')
}
