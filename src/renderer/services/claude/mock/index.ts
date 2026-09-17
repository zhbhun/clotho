import type {
  ClaudeJsonLine,
  ClaudeProject,
  ClaudeSession,
  ClaudeSubagent,
  ClaudeWorkflowRun,
} from '@/shared/rpc'

import { MOCK_PROJECT_ID } from './project'
import { agentLines, agentSubagents } from './sessions/agent'
import { askLines } from './sessions/ask'
import { backgroundLines } from './sessions/background'
import { bashLines } from './sessions/bash'
import { cronLines } from './sessions/cron'
import { fileLines } from './sessions/file'
import { mcpLines } from './sessions/mcp'
import { notebookLines } from './sessions/notebook'
import { planLines } from './sessions/plan'
import { reviewLines } from './sessions/review'
import { skillLines } from './sessions/skill'
import { taskLines } from './sessions/task'
import { todoLines } from './sessions/todo'
import { webLines } from './sessions/web'
import { workflowLines, workflowRuns, workflowSubagents } from './sessions/workflow'
import type { MockSubagentDef } from './types'

export { MOCK_PROJECT_ID } from './project'

export const MOCK_PROJECT: ClaudeProject = {
  id: MOCK_PROJECT_ID,
  path: '/mock/tools-preview',
  sessions: [],
  created_at: new Date('2026-07-11T09:00:00.000Z').getTime(),
}

export interface MockSessionDef {
  meta: Omit<ClaudeSession, 'project_id' | 'project_path'>
  lines: () => ClaudeJsonLine[]
  subagents?: () => MockSubagentDef[]
  workflowRuns?: () => ClaudeWorkflowRun[]
}

const BASE_TIME = new Date('2026-07-11T09:00:00.000Z').getTime()
const hour = 60 * 60 * 1000

export const MOCK_SESSIONS: MockSessionDef[] = [
  {
    meta: {
      id: 'mock-bash',
      title: 'Bash · Command line',
      created_at: BASE_TIME - 3 * hour,
      first_prompt:
        'List the files in the current directory, then check whether node is available.',
    },
    lines: () => bashLines(),
  },
  {
    meta: {
      id: 'mock-file',
      title: 'File · Read/write/edit',
      created_at: BASE_TIME - 2 * hour,
      first_prompt:
        'Read the first few lines of src/index.ts, then inspect the neighboring config.ts.',
    },
    lines: () => fileLines(),
  },
  {
    meta: {
      id: 'mock-task',
      title: 'Task · Task list',
      created_at: BASE_TIME - 1.5 * hour,
      first_prompt: 'Plan the setup steps for this project and track progress with a task list.',
    },
    lines: () => taskLines(),
  },
  {
    meta: {
      id: 'mock-todo',
      title: 'TodoWrite · Checklist',
      created_at: BASE_TIME - hour,
      first_prompt: "Refactor this module's styling system and track each step with a todo list.",
    },
    lines: () => todoLines(),
  },
  {
    meta: {
      id: 'mock-agent',
      title: 'Agent · Subagent',
      created_at: BASE_TIME - 0.5 * hour,
      first_prompt: 'Start a subagent and have it query system information.',
    },
    lines: () => agentLines(),
    subagents: () => agentSubagents(),
  },
  {
    meta: {
      id: 'mock-web',
      title: 'Web · Web search',
      created_at: BASE_TIME - 0.25 * hour,
      first_prompt:
        "Look up Vite 8's new features, then fetch the official documentation for details.",
    },
    lines: () => webLines(),
  },
  {
    meta: {
      id: 'mock-mcp',
      title: 'MCP · Plugin',
      created_at: BASE_TIME - 0.25 * hour,
      first_prompt: 'Look up the React useEffect usage documentation.',
    },
    lines: () => mcpLines(),
  },
  {
    meta: {
      id: 'mock-notebook',
      title: 'Notebook · Jupyter',
      created_at: BASE_TIME - 0.2 * hour,
      first_prompt: 'Demonstrate three NotebookEdit operations: replace, insert, and delete cells.',
    },
    lines: () => notebookLines(),
  },
  {
    meta: {
      id: 'mock-ask',
      title: 'Ask · User questions',
      created_at: BASE_TIME - 0.125 * hour,
      first_prompt: 'Configure the new project stack; confirm my preferences for a few options.',
    },
    lines: () => askLines(),
  },
  {
    meta: {
      id: 'mock-skill',
      title: 'Skill · Skill',
      created_at: BASE_TIME - 0.0625 * hour,
      first_prompt: 'Use a brainstorming process to design a new feature module.',
    },
    lines: () => skillLines(),
  },
  {
    meta: {
      id: 'mock-plan',
      title: 'Plan · Plan mode',
      created_at: BASE_TIME - 0.03125 * hour,
      first_prompt:
        'I want to refactor the state-management layer; plan the approach before making changes.',
    },
    lines: () => planLines(),
  },
  {
    meta: {
      id: 'mock-cron',
      title: 'Cron · Scheduled tasks',
      created_at: BASE_TIME - 0.02 * hour,
      first_prompt:
        'Set up two scheduled tasks: periodically check the build and send a one-time PR review reminder.',
    },
    lines: () => cronLines(),
  },
  {
    meta: {
      id: 'mock-review',
      title: 'Review · Code review',
      created_at: BASE_TIME - 0.015 * hour,
      first_prompt: 'Review src/auth/handler.ts and submit findings with ReportFindings.',
    },
    lines: () => reviewLines(),
  },
  {
    meta: {
      id: 'mock-workflow',
      title: 'Workflow · Multi-agent orchestration',
      created_at: BASE_TIME - 0.01 * hour,
      first_prompt:
        'Run a math demo with Workflow: generate two random integers in parallel, then calculate all four operations in parallel.',
    },
    lines: () => workflowLines(),
    subagents: () => workflowSubagents(),
    workflowRuns: () => workflowRuns(),
  },
  {
    meta: {
      id: 'mock-background',
      title: 'Background · Background task',
      created_at: BASE_TIME,
      first_prompt: 'Start a background task to run the build script and monitor it with Monitor.',
    },
    lines: () => backgroundLines(),
  },
]

export function findMockSession(sessionId: string): MockSessionDef | undefined {
  return MOCK_SESSIONS.find((s) => s.meta.id === sessionId)
}

export function findMockWorkflowRuns(sessionId: string, runIds: string[]): ClaudeWorkflowRun[] {
  const requested = new Set(runIds)
  return (findMockSession(sessionId)?.workflowRuns?.() ?? []).filter((run) =>
    requested.has(run.runId),
  )
}

export function listMockSubagents(sessionId: string): ClaudeSubagent[] {
  return (findMockSession(sessionId)?.subagents?.() ?? [])
    .filter((subagent) => subagent.listed !== false)
    .map((subagent) => ({ ...subagent.meta }))
}

export function getMockSubagentMessages(sessionId: string, agentId: string): ClaudeJsonLine[] {
  return (
    findMockSession(sessionId)
      ?.subagents?.()
      .find((subagent) => subagent.meta.id === agentId)
      ?.lines() ?? []
  )
}
