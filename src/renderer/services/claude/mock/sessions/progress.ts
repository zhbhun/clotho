import type { ClaudeJsonLine, ClaudeWorkflowRun } from '@/shared/rpc'

import type { MockSubagentDef } from '../types'
import { assistantText, assistantToolUse, toolCallPair, ts, userText } from './helpers'

const RESEARCH_AGENT_ID = 'agent-mock-progress-research'
const RESEARCH_TOOL_USE_ID = 'call_mock_progress_research'
const PERF_AGENT_ID = 'agent-mock-progress-perf'
const PERF_TOOL_USE_ID = 'call_mock_progress_perf'
const WORKFLOW_TOOL_USE_ID = 'call_mock_progress_workflow'
const RUN_ID = 'wf_mock_progress'
const TASK_ID = 'wmockprogress01'

const RESEARCH_PROMPT =
  'Survey how the current module organizes styles and propose a token-based structure. Return a short report.'
const PERF_PROMPT =
  'Profile the build, find the slowest steps, and return a summary with the top three bottlenecks.'

const WORKFLOW_SCRIPT = `export const meta = {
  name: 'progress-math-pipeline',
  description: 'Progress demo: two generator agents produce integers for a later summary',
  phases: [
    { title: 'Generate', detail: 'Two generators run in parallel and each produces an integer' },
  ],
}

phase('Generate')
const numbers = await parallel([
  () => agent('Return integer 73', { label: 'generator-a', phase: 'Generate' }),
  () => agent('Return integer 41', { label: 'generator-b', phase: 'Generate' }),
])

return { numbers }`

const TODOS = [
  {
    content: 'Map the refactor scope and dependencies',
    activeForm: 'Mapping the refactor scope',
    status: 'completed',
  },
  {
    content: 'Dispatch research subagents',
    activeForm: 'Dispatching research subagents',
    status: 'in_progress',
  },
  {
    content: 'Run the math Workflow pipeline',
    activeForm: 'Running the math Workflow pipeline',
    status: 'in_progress',
  },
  {
    content: 'Collect results and write the summary',
    activeForm: 'Collecting results',
    status: 'pending',
  },
]

function researchTranscript(): ClaudeJsonLine[] {
  return [
    userText(RESEARCH_PROMPT, { ts: ts(0, 0), uuid: 'mock-progress-research-prompt' }),
    assistantText('I am surveying the style modules now and will report findings shortly.', {
      ts: ts(0, 0),
      uuid: 'mock-progress-research-intro',
    }),
  ]
}

function perfTranscript(): ClaudeJsonLine[] {
  return [
    userText(PERF_PROMPT, { ts: ts(0, 0), uuid: 'mock-progress-perf-prompt' }),
    assistantText('I am profiling the build steps and will summarize the bottlenecks.', {
      ts: ts(0, 0),
      uuid: 'mock-progress-perf-intro',
    }),
  ]
}

export function progressLines(): ClaudeJsonLine[] {
  const t0 = ts(0, 0)
  const t1 = ts(0, 0)
  const launchResult = [
    'Workflow launched in background. Task ID: wmockprogress01',
    'Summary: Progress demo with two generator agents',
    `Run ID: ${RUN_ID}`,
    'You will be notified when it completes.',
  ].join('\n')

  return [
    userText(
      'Track this refactor with a todo list, dispatch two research subagents in parallel, and start the math Workflow at the same time.',
      { ts: t0, uuid: 'mock-progress-root-user' },
    ),
    assistantText(
      'I will track the steps with TodoWrite, dispatch two research subagents, and launch the math Workflow.',
      { ts: t0, uuid: 'mock-progress-root-intro' },
    ),
    ...toolCallPair('TodoWrite', { todos: TODOS }, 'Todos have been modified successfully.', {
      id: 'call_mock_progress_todo',
      ts: t0,
      useUuid: 'mock-progress-todo-use',
      resultUuid: 'mock-progress-todo-result',
      toolUseResult: { oldTodos: [], newTodos: TODOS },
    }),
    assistantText(
      'Both research subagents are running in the background; I will launch the math Workflow meanwhile.',
      { ts: t1, uuid: 'mock-progress-root-agents' },
    ),
    assistantToolUse(
      'Agent',
      {
        description: 'Research styling solutions',
        prompt: RESEARCH_PROMPT,
        subagent_type: 'general-purpose',
        run_in_background: false,
      },
      { id: RESEARCH_TOOL_USE_ID, ts: t1, uuid: 'mock-progress-research-use' },
    ),
    assistantToolUse(
      'Agent',
      {
        description: 'Investigate build performance',
        prompt: PERF_PROMPT,
        subagent_type: 'general-purpose',
        run_in_background: false,
      },
      { id: PERF_TOOL_USE_ID, ts: t1, uuid: 'mock-progress-perf-use' },
    ),
    ...toolCallPair('Workflow', { script: WORKFLOW_SCRIPT }, launchResult, {
      id: WORKFLOW_TOOL_USE_ID,
      ts: t1,
      useUuid: 'mock-progress-workflow-use',
      resultUuid: 'mock-progress-workflow-result',
      toolUseResult: {
        status: 'async_launched',
        taskId: TASK_ID,
        taskType: 'local_workflow',
        workflowName: 'progress-math-pipeline',
        runId: RUN_ID,
        summary: 'Progress demo with two generator agents',
      },
    }),
    assistantText(
      'Everything is in flight: one todo done, two research subagents running, and the Workflow has one agent finished with one still generating. I will report back as results arrive.',
      { ts: t1, uuid: 'mock-progress-root-summary' },
    ),
  ]
}

export function progressWorkflowRuns(): ClaudeWorkflowRun[] {
  const startTime = Date.parse('2026-07-11T08:58:00.000Z')
  return [
    {
      runId: RUN_ID,
      taskId: TASK_ID,
      workflowName: 'progress-math-pipeline',
      summary: 'Progress demo with two generator agents',
      status: 'running',
      startTime,
      agentCount: 2,
      totalTokens: 25_500,
      totalToolCalls: 1,
      script: WORKFLOW_SCRIPT,
      logs: [],
      phases: [
        {
          index: 1,
          title: 'Generate',
          detail: 'Two generators run in parallel and each produces an integer',
        },
      ],
      agents: [
        {
          index: 1,
          label: 'generator-a',
          phaseIndex: 1,
          phaseTitle: 'Generate',
          agentId: 'agent-mock-progress-generator-a',
          model: 'demo-sonnet',
          fallbackModel: 'demo-sonnet',
          state: 'done',
          startedAt: startTime + 10,
          queuedAt: startTime,
          attempt: 1,
          lastToolName: 'StructuredOutput',
          lastToolSummary: 'Chose 73, a prime between 1 and 100.',
          promptPreview: 'Return integer 73',
          lastProgressAt: startTime + 6_100,
          tokens: 13_050,
          toolCalls: 1,
          durationMs: 6_100,
          resultPreview: '{"value":73,"note":"Chose the prime 73."}',
        },
        {
          index: 2,
          label: 'generator-b',
          phaseIndex: 1,
          phaseTitle: 'Generate',
          agentId: 'agent-mock-progress-generator-b',
          model: 'demo-sonnet',
          fallbackModel: 'demo-sonnet',
          state: 'running',
          startedAt: startTime + 12,
          queuedAt: startTime,
          attempt: 1,
          lastToolName: 'StructuredOutput',
          lastToolSummary: 'Waiting for the model response',
          promptPreview: 'Return integer 41',
          lastProgressAt: startTime + 5_400,
          tokens: 12_450,
          toolCalls: 0,
        },
      ],
    },
  ]
}

export function progressSubagents(): MockSubagentDef[] {
  return [
    {
      meta: {
        id: RESEARCH_AGENT_ID,
        agentType: 'general-purpose',
        description: 'Research styling solutions',
        toolUseId: RESEARCH_TOOL_USE_ID,
        spawnDepth: 1,
        createdAt: ts(0, 0),
      },
      lines: researchTranscript,
    },
    {
      meta: {
        id: PERF_AGENT_ID,
        agentType: 'general-purpose',
        description: 'Investigate build performance',
        toolUseId: PERF_TOOL_USE_ID,
        spawnDepth: 1,
        createdAt: ts(0, 0),
      },
      lines: perfTranscript,
    },
  ]
}
