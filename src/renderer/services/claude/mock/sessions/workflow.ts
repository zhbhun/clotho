import type { ClaudeJsonLine, ClaudeWorkflowRun } from '@/shared/rpc'

import type { MockSubagentDef } from '../types'
import { assistantText, assistantToolUse, toolCallPair, userText, userToolResult } from './helpers'

interface WorkflowAgentFixture {
  agentId: string
  durationMs: number
  failure?: string
  index: number
  label: string
  lastProgressAt: number
  lastToolSummary: string
  output: Record<string, string | number>
  phaseIndex: number
  phaseTitle: string
  prompt: string
  queuedAt: number
  startedAt: number
  tokens: number
}

const RUN_ID = 'wf_mock_math_pipeline'
const TASK_ID = 'wmockmath01'
const WORKFLOW_TOOL_USE_ID = 'call_mock_workflow'
const TASK_OUTPUT_TOOL_USE_ID = 'call_mock_workflow_output'
const SUMMARY =
  'Workflow demo: subagents generate random numbers and calculator agents perform all four operations'
const PARTIAL_RUN_ID = 'wf_mock_partial_failure'
const PARTIAL_TASK_ID = 'wmockpartial01'
const PARTIAL_WORKFLOW_TOOL_USE_ID = 'call_mock_workflow_partial'
const PARTIAL_TASK_OUTPUT_TOOL_USE_ID = 'call_mock_workflow_partial_output'
const PARTIAL_SUMMARY =
  'Workflow partial-failure demo: five subagents succeed and one structured-output validation fails'
const TRANSCRIPT_DIR =
  '/Users/demo/.claude/projects/demo-project/mock-workflow/subagents/workflows/wf_mock_math_pipeline'
const SCRIPT_PATH =
  '/Users/demo/.claude/projects/demo-project/mock-workflow/workflows/scripts/math-pipeline-demo-wf_mock_math_pipeline.js'
const PARTIAL_TRANSCRIPT_DIR =
  '/mock/.claude/projects/demo-project/mock-workflow/subagents/workflows/wf_mock_partial_failure'
const PARTIAL_SCRIPT_PATH =
  '/mock/.claude/projects/demo-project/mock-workflow/workflows/scripts/math-pipeline-partial-failure-wf_mock_partial_failure.js'

const SCRIPT = `export const meta = {
  name: 'math-pipeline-demo',
  description: 'Workflow demo: subagents generate random numbers and calculator agents perform all four operations',
  phases: [
    { title: 'Generate random numbers', detail: 'Two generators run in parallel and each produces a random integer' },
    { title: 'Calculate', detail: 'Four agents compute addition, subtraction, multiplication, and division in parallel' },
  ],
}

phase('Generate random numbers')
const numbers = await parallel([
  () => agent('Give an integer between 1 and 100', { label: 'generator-a', phase: 'Generate random numbers' }),
  () => agent('Give another integer between 1 and 100', { label: 'generator-b', phase: 'Generate random numbers' }),
])

const a = numbers[0].value
const b = numbers[1].value
log(\`Generated random numbers: a=\${a}, b=\${b}\`)

phase('Calculate')
const computations = await parallel([
  () => agent(\`Compute \${a} + \${b}\`, { label: 'compute-add', phase: 'Calculate' }),
  () => agent(\`Compute \${a} - \${b}\`, { label: 'compute-subtract', phase: 'Calculate' }),
  () => agent(\`Compute \${a} × \${b}\`, { label: 'compute-multiply', phase: 'Calculate' }),
  () => agent(\`Compute \${a} ÷ \${b}\`, { label: 'compute-divide', phase: 'Calculate' }),
])

return { a, b, computations }`

const INVALID_SCRIPT = `export const meta = {
  name: 'invalid-pipeline',
  description: 'Invalid Workflow example with missing phases',
}

return { ok: true }`

const PARTIAL_SCRIPT = `export const meta = {
  name: 'math-pipeline-partial-failure',
  description: 'Workflow partial-failure demo: the division agent returns the wrong type',
  phases: [
    { title: 'Generate random numbers', detail: 'Two generators run in parallel and each produces an integer' },
    { title: 'Calculate', detail: 'Four calculator agents run in parallel; the division agent triggers structured validation failure' },
  ],
}

const NUMBER_SCHEMA = {
  type: 'object',
  properties: { value: { type: 'number' }, note: { type: 'string' } },
  required: ['value', 'note'],
}

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    operation: { type: 'string' },
    expression: { type: 'string' },
    result: { type: 'number' },
  },
  required: ['operation', 'expression', 'result'],
}

phase('Generate random numbers')
const numbers = await parallel([
  () => agent('Return integer 84', {
    label: 'generator-a', phase: 'Generate random numbers', schema: NUMBER_SCHEMA,
  }),
  () => agent('Return integer 12', {
    label: 'generator-b', phase: 'Generate random numbers', schema: NUMBER_SCHEMA,
  }),
])

phase('Calculate')
const computations = await parallel([
  () => agent('Compute 84 + 12', {
    label: 'compute-add', phase: 'Calculate', schema: RESULT_SCHEMA,
  }),
  () => agent('Compute 84 - 12', {
    label: 'compute-subtract', phase: 'Calculate', schema: RESULT_SCHEMA,
  }),
  () => agent('Compute 84 × 12', {
    label: 'compute-multiply', phase: 'Calculate', schema: RESULT_SCHEMA,
  }),
  () => agent('Compute 84 ÷ 12; result must be a number', {
    label: 'compute-divide', phase: 'Calculate', schema: RESULT_SCHEMA,
  }),
])

return { numbers, computations }`

// These values intentionally mirror the referenced run, including both generators choosing 73
// and the high cached-context token counts reported by the provider.
const WORKFLOW_AGENTS: WorkflowAgentFixture[] = [
  {
    index: 1,
    label: 'generator-a',
    phaseIndex: 1,
    phaseTitle: 'Generate random numbers',
    agentId: 'agent-mock-generator-a',
    prompt:
      'You are a random-number generator. Use no tools; give an integer from 1 to 100, put it in value, and explain it in one sentence in note.',
    output: { value: 73, note: 'Intuitively chose 73, a prime number between 1 and 100.' },
    queuedAt: 1_785_918_376_324,
    startedAt: 1_785_918_376_331,
    lastProgressAt: 1_785_918_382_333,
    tokens: 25_805,
    durationMs: 6_002,
    lastToolSummary: 'Intuitively chose 73, a prime number between 1 and 100.',
  },
  {
    index: 2,
    label: 'generator-b',
    phaseIndex: 1,
    phaseTitle: 'Generate random numbers',
    agentId: 'agent-mock-generator-b',
    prompt:
      'You are a random-number generator. Use no tools; intuitively choose an uncommon integer from 1 to 100 and fill value and note.',
    output: { value: 73, note: 'Intuitively chose the relatively uncommon prime 73.' },
    queuedAt: 1_785_918_376_324,
    startedAt: 1_785_918_376_332,
    lastProgressAt: 1_785_918_384_992,
    tokens: 25_867,
    durationMs: 8_660,
    lastToolSummary: 'Intuitively chose the relatively uncommon prime 73.',
  },
  {
    index: 3,
    label: 'compute-add',
    phaseIndex: 2,
    phaseTitle: 'Calculate',
    agentId: 'agent-mock-add',
    prompt:
      'You are a calculator agent. Compute 73 + 73 mentally without tools. Return operation, expression, and result.',
    output: { operation: 'add', expression: '73 + 73', result: 146 },
    queuedAt: 1_785_918_384_997,
    startedAt: 1_785_918_385_006,
    lastProgressAt: 1_785_918_392_359,
    tokens: 25_831,
    durationMs: 7_353,
    lastToolSummary: 'add',
  },
  {
    index: 4,
    label: 'compute-subtract',
    phaseIndex: 2,
    phaseTitle: 'Calculate',
    agentId: 'agent-mock-subtract',
    prompt:
      'You are a calculator agent. Compute 73 - 73 mentally without tools. Return operation, expression, and result.',
    output: { operation: 'subtract', expression: '73 - 73', result: 0 },
    queuedAt: 1_785_918_384_997,
    startedAt: 1_785_918_385_006,
    lastProgressAt: 1_785_918_391_852,
    tokens: 25_816,
    durationMs: 6_846,
    lastToolSummary: 'subtract',
  },
  {
    index: 5,
    label: 'compute-multiply',
    phaseIndex: 2,
    phaseTitle: 'Calculate',
    agentId: 'agent-mock-multiply',
    prompt:
      'You are a calculator agent. Compute 73 × 73 mentally without tools. Return operation, expression, and result.',
    output: { operation: 'multiply', expression: '73 × 73', result: 5329 },
    queuedAt: 1_785_918_384_997,
    startedAt: 1_785_918_385_007,
    lastProgressAt: 1_785_918_393_828,
    tokens: 25_910,
    durationMs: 8_821,
    lastToolSummary: 'multiply',
  },
  {
    index: 6,
    label: 'compute-divide',
    phaseIndex: 2,
    phaseTitle: 'Calculate',
    agentId: 'agent-mock-divide',
    prompt:
      'You are a calculator agent. Compute 73 ÷ 73 mentally without tools. Return operation, expression, and result.',
    output: { operation: 'divide', expression: '73 ÷ 73', result: 1 },
    queuedAt: 1_785_918_384_998,
    startedAt: 1_785_918_385_007,
    lastProgressAt: 1_785_918_392_754,
    tokens: 25_823,
    durationMs: 7_747,
    lastToolSummary: 'divide',
  },
]

const PARTIAL_WORKFLOW_AGENTS: WorkflowAgentFixture[] = [
  {
    index: 1,
    label: 'generator-a',
    phaseIndex: 1,
    phaseTitle: 'Generate random numbers',
    agentId: 'agent-mock-partial-generator-a',
    prompt: 'Return integer 84 and provide value and note through StructuredOutput.',
    output: { value: 84, note: 'Returned 84 as requested by the demo.' },
    queuedAt: 1_785_918_500_000,
    startedAt: 1_785_918_500_010,
    lastProgressAt: 1_785_918_503_210,
    tokens: 1_800,
    durationMs: 3_200,
    lastToolSummary: 'Returned integer 84',
  },
  {
    index: 2,
    label: 'generator-b',
    phaseIndex: 1,
    phaseTitle: 'Generate random numbers',
    agentId: 'agent-mock-partial-generator-b',
    prompt: 'Return integer 12 and provide value and note through StructuredOutput.',
    output: { value: 12, note: 'Returned 12 as requested by the demo.' },
    queuedAt: 1_785_918_500_000,
    startedAt: 1_785_918_500_012,
    lastProgressAt: 1_785_918_503_462,
    tokens: 1_750,
    durationMs: 3_450,
    lastToolSummary: 'Returned integer 12',
  },
  {
    index: 3,
    label: 'compute-add',
    phaseIndex: 2,
    phaseTitle: 'Calculate',
    agentId: 'agent-mock-partial-add',
    prompt: 'Compute 84 + 12 and return operation, expression, and a numeric result.',
    output: { operation: 'add', expression: '84 + 12', result: 96 },
    queuedAt: 1_785_918_503_500,
    startedAt: 1_785_918_503_510,
    lastProgressAt: 1_785_918_507_310,
    tokens: 1_600,
    durationMs: 3_800,
    lastToolSummary: 'add',
  },
  {
    index: 4,
    label: 'compute-subtract',
    phaseIndex: 2,
    phaseTitle: 'Calculate',
    agentId: 'agent-mock-partial-subtract',
    prompt: 'Compute 84 - 12 and return operation, expression, and a numeric result.',
    output: { operation: 'subtract', expression: '84 - 12', result: 72 },
    queuedAt: 1_785_918_503_500,
    startedAt: 1_785_918_503_512,
    lastProgressAt: 1_785_918_507_062,
    tokens: 1_580,
    durationMs: 3_550,
    lastToolSummary: 'subtract',
  },
  {
    index: 5,
    label: 'compute-multiply',
    phaseIndex: 2,
    phaseTitle: 'Calculate',
    agentId: 'agent-mock-partial-multiply',
    prompt: 'Compute 84 × 12 and return operation, expression, and a numeric result.',
    output: { operation: 'multiply', expression: '84 × 12', result: 1008 },
    queuedAt: 1_785_918_503_500,
    startedAt: 1_785_918_503_514,
    lastProgressAt: 1_785_918_507_714,
    tokens: 1_620,
    durationMs: 4_200,
    lastToolSummary: 'multiply',
  },
  {
    index: 6,
    label: 'compute-divide',
    phaseIndex: 2,
    phaseTitle: 'Calculate',
    agentId: 'agent-mock-partial-divide',
    prompt: 'Compute 84 ÷ 12 and return operation, expression, and a numeric result.',
    output: { operation: 'divide', expression: '84 ÷ 12', result: '7' },
    queuedAt: 1_785_918_503_500,
    startedAt: 1_785_918_503_516,
    lastProgressAt: 1_785_918_508_116,
    tokens: 1_640,
    durationMs: 4_600,
    lastToolSummary: 'Structured-output validation failed: result must be a number',
    failure: 'Structured output validation failed: result must be number, received string',
  },
]

const WORKFLOW_RESULT = {
  a: 73,
  b: 73,
  computations: WORKFLOW_AGENTS.slice(2).map((agent) => ({ ...agent.output })),
  expected: { add: 146, subtract: 0, multiply: 5329, divide: 1 },
}

function workflowAgentTranscript(agent: WorkflowAgentFixture): ClaudeJsonLine[] {
  const timestamp = new Date(agent.startedAt).toISOString()
  const fixtureId = agent.agentId.replace(/^agent-mock-/, '')
  const toolUseId = `call_mock_structured_${fixtureId}`
  return [
    userText(agent.prompt, {
      ts: timestamp,
      uuid: `mock-workflow-${fixtureId}-prompt`,
    }),
    assistantToolUse(
      'StructuredOutput',
      { ...agent.output },
      {
        id: toolUseId,
        ts: new Date(agent.lastProgressAt).toISOString(),
        thinking: 'Perform the mental calculation as requested and return a structured result.',
        uuid: `mock-workflow-${fixtureId}-structured-output`,
      },
    ),
    userToolResult(toolUseId, agent.failure ?? 'Structured output provided successfully', {
      isError: Boolean(agent.failure),
      ts: new Date(agent.lastProgressAt + 2).toISOString(),
      uuid: `mock-workflow-${fixtureId}-structured-result`,
    }),
  ]
}

function workflowAgentRecord(agent: WorkflowAgentFixture) {
  return {
    index: agent.index,
    label: agent.label,
    phaseIndex: agent.phaseIndex,
    phaseTitle: agent.phaseTitle,
    agentId: agent.agentId,
    model: 'demo-sonnet',
    fallbackModel: 'demo-sonnet',
    state: agent.failure ? 'failed' : 'done',
    startedAt: agent.startedAt,
    queuedAt: agent.queuedAt,
    attempt: 1,
    lastToolName: 'StructuredOutput',
    lastToolSummary: agent.lastToolSummary,
    promptPreview: agent.prompt,
    lastProgressAt: agent.lastProgressAt,
    tokens: agent.tokens,
    toolCalls: 1,
    durationMs: agent.durationMs,
    resultPreview: JSON.stringify(agent.output),
  }
}

export function workflowRuns(): ClaudeWorkflowRun[] {
  return [
    {
      runId: RUN_ID,
      taskId: TASK_ID,
      workflowName: 'math-pipeline-demo',
      summary: SUMMARY,
      status: 'completed',
      startTime: 1_785_918_376_308,
      durationMs: 17_521,
      agentCount: 6,
      totalTokens: 155_052,
      totalToolCalls: 6,
      script: SCRIPT,
      logs: ['Generated random numbers: a=73, b=73'],
      result: {
        ...WORKFLOW_RESULT,
        computations: WORKFLOW_RESULT.computations.map((item) => ({ ...item })),
        expected: { ...WORKFLOW_RESULT.expected },
      },
      phases: [
        {
          index: 1,
          title: 'Generate random numbers',
          detail: 'Two generators run in parallel and each produces a random integer',
        },
        {
          index: 2,
          title: 'Calculate',
          detail: 'Four agents compute the four operations on these numbers in parallel',
        },
      ],
      agents: WORKFLOW_AGENTS.map(workflowAgentRecord),
    },
    {
      runId: PARTIAL_RUN_ID,
      taskId: PARTIAL_TASK_ID,
      workflowName: 'math-pipeline-partial-failure',
      summary: PARTIAL_SUMMARY,
      status: 'failed',
      startTime: 1_785_918_499_990,
      durationMs: 8_126,
      agentCount: 6,
      totalTokens: 9_990,
      totalToolCalls: 6,
      script: PARTIAL_SCRIPT,
      logs: [
        'Generated random numbers: a=84, b=12',
        'compute-divide structured-output validation failed: result must be a number',
      ],
      result: {
        a: 84,
        b: 12,
        computations: PARTIAL_WORKFLOW_AGENTS.slice(2, 5).map((agent) => ({
          ...agent.output,
        })),
        errors: [
          {
            agent: 'compute-divide',
            message: 'Structured output validation failed: result must be number, received string',
          },
        ],
      },
      phases: [
        {
          index: 1,
          title: 'Generate random numbers',
          detail: 'Two generators run in parallel and each produces an integer',
        },
        {
          index: 2,
          title: 'Calculate',
          detail:
            'Four calculator agents run in parallel; the division agent triggers structured validation failure',
        },
      ],
      agents: PARTIAL_WORKFLOW_AGENTS.map(workflowAgentRecord),
    },
  ]
}

export function workflowSubagents(): MockSubagentDef[] {
  return [...WORKFLOW_AGENTS, ...PARTIAL_WORKFLOW_AGENTS].map((agent) => ({
    listed: false,
    meta: {
      id: agent.agentId,
      agentType: 'workflow-subagent',
      description: agent.label,
      toolUseId: `workflow-agent:${agent.agentId}`,
      spawnDepth: 1,
      createdAt: new Date(agent.startedAt).toISOString(),
    },
    lines: () => workflowAgentTranscript(agent),
  }))
}

function taskOutputPayload(runId: string) {
  const run = workflowRuns().find((candidate) => candidate.runId === runId)
  if (!run) return ''
  return JSON.stringify(
    {
      summary: run.summary,
      agentCount: run.agentCount,
      logs: run.logs,
      result: run.result,
      workflowProgress: [
        ...run.phases.map((phase) => ({ type: 'workflow_phase', ...phase })),
        ...run.agents.map((agent) => ({ type: 'workflow_agent', ...agent })),
      ],
      totalTokens: run.totalTokens,
      totalToolCalls: run.totalToolCalls,
    },
    null,
    2,
  )
}

export function workflowLines(): ClaudeJsonLine[] {
  const launchedAt = '2026-08-05T08:25:53.139Z'
  const completedAt = '2026-08-05T08:26:33.900Z'
  const output = taskOutputPayload(RUN_ID)
  const partialLaunchedAt = '2026-08-05T08:35:00.000Z'
  const partialCompletedAt = '2026-08-05T08:35:09.000Z'
  const partialOutput = taskOutputPayload(PARTIAL_RUN_ID)
  const launchResult = [
    `Workflow launched in background. Task ID: ${TASK_ID}`,
    `Summary: ${SUMMARY}`,
    `Transcript dir: ${TRANSCRIPT_DIR}`,
    `Script file: ${SCRIPT_PATH}`,
    `Run ID: ${RUN_ID}`,
    'You will be notified when it completes. Use /workflows to watch live progress.',
  ].join('\n')
  const partialLaunchResult = [
    `Workflow launched in background. Task ID: ${PARTIAL_TASK_ID}`,
    `Summary: ${PARTIAL_SUMMARY}`,
    `Transcript dir: ${PARTIAL_TRANSCRIPT_DIR}`,
    `Script file: ${PARTIAL_SCRIPT_PATH}`,
    `Run ID: ${PARTIAL_RUN_ID}`,
    'You will be notified when it completes. Use /workflows to watch live progress.',
  ].join('\n')

  return [
    userText(['Run the following math demo script with Workflow:', '', SCRIPT].join('\n'), {
      ts: launchedAt,
      uuid: 'mock-workflow-root-user',
    }),
    assistantText('I will run this script directly with the Workflow tool.', {
      ts: launchedAt,
      uuid: 'mock-workflow-root-intro',
    }),
    ...toolCallPair('Workflow', { script: SCRIPT }, launchResult, {
      id: WORKFLOW_TOOL_USE_ID,
      ts: launchedAt,
      useUuid: 'mock-workflow-root-use',
      resultUuid: 'mock-workflow-root-result',
      toolUseResult: {
        status: 'async_launched',
        taskId: TASK_ID,
        taskType: 'local_workflow',
        workflowName: 'math-pipeline-demo',
        runId: RUN_ID,
        summary: SUMMARY,
        transcriptDir: TRANSCRIPT_DIR,
        scriptPath: SCRIPT_PATH,
      },
    }),
    assistantText(
      `Workflow started in the background (Task ID: ${TASK_ID}, Run ID: ${RUN_ID}). It has 6 subagents across two phases; I will wait for completion.`,
      { ts: launchedAt, uuid: 'mock-workflow-root-waiting' },
    ),
    ...toolCallPair(
      'TaskOutput',
      { task_id: TASK_ID, block: true, timeout: 240_000 },
      [
        '<retrieval_status>success</retrieval_status>',
        `<task_id>${TASK_ID}</task_id>`,
        '<task_type>local_workflow</task_type>',
        '<status>completed</status>',
        `<output>\n${output}\n</output>`,
      ].join('\n\n'),
      {
        id: TASK_OUTPUT_TOOL_USE_ID,
        ts: completedAt,
        useUuid: 'mock-workflow-output-use',
        resultUuid: 'mock-workflow-output-result',
        toolUseResult: {
          retrieval_status: 'success',
          task: {
            task_id: TASK_ID,
            task_type: 'local_workflow',
            status: 'completed',
            description: SUMMARY,
            output,
          },
        },
      },
    ),
    assistantText(
      'Finished. All 6 subagents succeeded (2 generators + 4 calculators) in about 17.5 seconds. Both random numbers were 73, and all four results matched the expected answers.',
      { ts: completedAt, uuid: 'mock-workflow-root-summary' },
    ),
    userText(
      'Run this Workflow with a missing phases configuration to verify the creation error.',
      {
        ts: '2026-08-05T08:30:00.000Z',
        uuid: 'mock-workflow-create-failure-user',
      },
    ),
    assistantText('I will try to create this Workflow.', {
      ts: '2026-08-05T08:30:01.000Z',
      uuid: 'mock-workflow-create-failure-intro',
    }),
    ...toolCallPair(
      'Workflow',
      { script: INVALID_SCRIPT },
      'Workflow script validation failed: meta.phases is required',
      {
        id: 'call_mock_workflow_create_failure',
        isError: true,
        ts: '2026-08-05T08:30:02.000Z',
        useUuid: 'mock-workflow-create-failure-use',
        resultUuid: 'mock-workflow-create-failure-result',
        toolUseResult: { status: 'failed' },
      },
    ),
    assistantText(
      'Workflow creation failed: meta.phases is required, so no run record was created.',
      {
        ts: '2026-08-05T08:30:02.300Z',
        uuid: 'mock-workflow-create-failure-summary',
      },
    ),
    userText(
      ['Run another math Workflow with a partial subagent failure:', '', PARTIAL_SCRIPT].join('\n'),
      {
        ts: partialLaunchedAt,
        uuid: 'mock-workflow-partial-user',
      },
    ),
    assistantText('I will start this Workflow with a structured-output failure branch.', {
      ts: partialLaunchedAt,
      uuid: 'mock-workflow-partial-intro',
    }),
    ...toolCallPair('Workflow', { script: PARTIAL_SCRIPT }, partialLaunchResult, {
      id: PARTIAL_WORKFLOW_TOOL_USE_ID,
      ts: partialLaunchedAt,
      useUuid: 'mock-workflow-partial-use',
      resultUuid: 'mock-workflow-partial-result',
      toolUseResult: {
        status: 'async_launched',
        taskId: PARTIAL_TASK_ID,
        taskType: 'local_workflow',
        workflowName: 'math-pipeline-partial-failure',
        runId: PARTIAL_RUN_ID,
        summary: PARTIAL_SUMMARY,
        transcriptDir: PARTIAL_TRANSCRIPT_DIR,
        scriptPath: PARTIAL_SCRIPT_PATH,
      },
    }),
    assistantText(
      `Workflow created (Task ID: ${PARTIAL_TASK_ID}, Run ID: ${PARTIAL_RUN_ID}); waiting for six subagents to finish.`,
      { ts: partialLaunchedAt, uuid: 'mock-workflow-partial-waiting' },
    ),
    ...toolCallPair(
      'TaskOutput',
      { task_id: PARTIAL_TASK_ID, block: true, timeout: 240_000 },
      [
        '<retrieval_status>success</retrieval_status>',
        `<task_id>${PARTIAL_TASK_ID}</task_id>`,
        '<task_type>local_workflow</task_type>',
        '<status>failed</status>',
        `<output>\n${partialOutput}\n</output>`,
      ].join('\n\n'),
      {
        id: PARTIAL_TASK_OUTPUT_TOOL_USE_ID,
        ts: partialCompletedAt,
        useUuid: 'mock-workflow-partial-output-use',
        resultUuid: 'mock-workflow-partial-output-result',
        toolUseResult: {
          retrieval_status: 'success',
          task: {
            task_id: PARTIAL_TASK_ID,
            task_type: 'local_workflow',
            status: 'failed',
            description: PARTIAL_SUMMARY,
            output: partialOutput,
          },
        },
      },
    ),
    assistantText(
      'Workflow finished: the first five subagents succeeded, while compute-divide failed structured-output validation because result was a string. Transcripts for all six subagents are available.',
      { ts: partialCompletedAt, uuid: 'mock-workflow-partial-summary' },
    ),
  ]
}
