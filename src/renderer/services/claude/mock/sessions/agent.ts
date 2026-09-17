import type { ClaudeJsonLine } from '@/shared/rpc'

import type { MockSubagentDef } from '../types'
import { assistantText, assistantToolUse, toolCallPair, userText, userToolResult } from './helpers'

const AGENT_ID = 'agent-mock-system-info'
const AGENT_TOOL_USE_ID = 'call_mock_system_info'
const CREATED_AT = '2026-08-05T01:51:27.790Z'
const FAILED_AGENT_ID = 'agent-mock-protected-log'
const FAILED_AGENT_TOOL_USE_ID = 'call_mock_agent_execution_failure'
const FAILED_AGENT_CREATED_AT = '2026-08-05T02:05:03.000Z'

const SYSTEM_PROMPT = `Query the system information for this macOS demo machine. Use tool calls to collect the following details and return a clear English report:

1. Operating system: name, version, and kernel version
2. Host and user: hostname and current user
3. CPU: chip type, core count, and architecture
4. Memory: total physical memory
5. Disk: root partition capacity and usage
6. Uptime and load
7. Shell and development tools: git, node, and python3

Integrate the command output into a structured English summary.`

const SYSTEM_REPORT = `# macOS System Information Report

## 1. Operating System

| Item | Value |
|---|---|
| Name | macOS |
| Version | 26.0 (Build DEMO26A) |
| Kernel | Darwin 26.0.0 (arm64) |

## 2. Host and User

| Item | Value |
|---|---|
| Hostname | \`demo-mac.local\` |
| Current user | \`demo\` |

## 3. Hardware

| Item | Value |
|---|---|
| Chip | Apple Silicon (arm64) |
| CPU | 8 cores |
| Physical memory | 16.00 GB |

## 4. Disk and Runtime

| Item | Value |
|---|---|
| Root partition | 500 GiB, 120 GiB used, 360 GiB available |
| Uptime | 3 days 4 hours |
| Load (1/5/15 minutes) | 1.25 / 1.10 / 0.95 |

## 5. Development Tools

| Tool | Version |
|---|---|
| Shell | zsh 5.x |
| git | 2.x |
| Node.js | v24.x |
| Python 3 | 3.12.x |

Summary: this is an anonymized Apple Silicon demo machine with a complete development toolchain.`

const COMMANDS = [
  {
    id: 'call_mock_os',
    command: 'uname -a; sw_vers',
    description: 'Read operating-system and kernel information',
    result:
      'Darwin demo-mac.local 26.0.0 Darwin Kernel Version 26.0.0 RELEASE_ARM64_DEMO arm64\nProductName:\tmacOS\nProductVersion:\t26.0\nBuildVersion:\tDEMO26A',
  },
  {
    id: 'call_mock_host',
    command: 'hostname; whoami',
    description: 'Read the hostname and current user',
    result: 'demo-mac.local\ndemo',
  },
  {
    id: 'call_mock_cpu',
    command: 'uname -m; sysctl -n hw.ncpu hw.physicalcpu',
    description: 'Read CPU architecture and core count',
    result: 'arm64\n8\n8',
  },
  {
    id: 'call_mock_memory',
    command: 'sysctl -n hw.memsize',
    description: 'Read total physical memory',
    result: '17179869184',
  },
  {
    id: 'call_mock_disk',
    command: 'df -h /',
    description: 'Read root-partition usage',
    result:
      'Filesystem          Size  Used Avail Capacity Mounted on\n/dev/diskXsYs1     500Gi 120Gi 360Gi    25%  /',
  },
  {
    id: 'call_mock_uptime',
    command: 'uptime',
    description: 'Read uptime and load',
    result: '10:30  up 3 days, 4:12, 1 user, load averages: 1.25 1.10 0.95',
  },
  {
    id: 'call_mock_tools',
    command: 'zsh --version; git --version; node --version; python3 --version',
    description: 'Read Shell and development-tool versions',
    result: 'zsh 5.x\ngit version 2.x\nv24.x\nPython 3.12.x',
  },
] as const

function agentTranscript(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = [
    userText(SYSTEM_PROMPT, {
      ts: CREATED_AT,
      uuid: 'mock-system-user-prompt',
    }),
    assistantText('I will collect this system information with several commands.', {
      ts: '2026-08-05T01:51:36.714Z',
      uuid: 'mock-system-assistant-intro',
    }),
  ]

  COMMANDS.forEach((entry, index) => {
    const timestamp = new Date(Date.parse('2026-08-05T01:51:36.927Z') + index * 800).toISOString()
    lines.push(
      assistantToolUse(
        'Bash',
        { command: entry.command, description: entry.description },
        {
          id: entry.id,
          ts: timestamp,
          uuid: `mock-system-bash-${index + 1}`,
        },
      ),
      userToolResult(entry.id, entry.result, {
        ts: timestamp,
        uuid: `mock-system-bash-result-${index + 1}`,
      }),
    )
  })

  lines.push(
    assistantText(SYSTEM_REPORT, {
      ts: '2026-08-05T01:52:02.999Z',
      uuid: 'mock-system-assistant-report',
    }),
  )
  return lines
}

function failedAgentTranscript(): ClaudeJsonLine[] {
  const bashToolUseId = 'call_mock_protected_log_bash'
  return [
    userText('Read the protected demo log and summarize recent anomalies.', {
      ts: FAILED_AGENT_CREATED_AT,
      uuid: 'mock-protected-log-user-prompt',
    }),
    assistantText('I will read the end of the log first.', {
      ts: '2026-08-05T02:05:04.000Z',
      uuid: 'mock-protected-log-assistant-intro',
    }),
    assistantToolUse(
      'Bash',
      {
        command: 'tail -n 20 /var/log/protected-demo.log',
        description: 'Read the protected demo log',
      },
      {
        id: bashToolUseId,
        ts: '2026-08-05T02:05:04.200Z',
        uuid: 'mock-protected-log-bash',
      },
    ),
    userToolResult(bashToolUseId, 'tail: /var/log/protected-demo.log: Operation not permitted', {
      isError: true,
      ts: '2026-08-05T02:05:04.400Z',
      uuid: 'mock-protected-log-bash-result',
    }),
    assistantText(
      'Log reading failed: the current process cannot access the protected file, so the anomaly summary cannot be completed.',
      {
        ts: '2026-08-05T02:05:05.000Z',
        uuid: 'mock-protected-log-assistant-failure',
      },
    ),
  ]
}

export function agentLines(): ClaudeJsonLine[] {
  const launchResult = [
    SYSTEM_REPORT,
    '',
    `agentId: ${AGENT_ID}`,
    '<usage>subagent_tokens: 29797',
    'tool_uses: 7',
    'duration_ms: 35223</usage>',
  ].join('\n')

  return [
    userText('Start a subagent and have it query system information.', {
      ts: '2026-08-05T01:51:22.000Z',
      uuid: 'mock-agent-root-user',
    }),
    assistantText('I will start a subagent to query system information.', {
      ts: '2026-08-05T01:51:22.367Z',
      uuid: 'mock-agent-root-intro',
    }),
    ...toolCallPair(
      'Agent',
      {
        description: 'Query system information',
        prompt: SYSTEM_PROMPT,
        subagent_type: 'general-purpose',
        run_in_background: false,
      },
      launchResult,
      {
        id: AGENT_TOOL_USE_ID,
        ts: CREATED_AT,
        useUuid: 'mock-agent-root-use',
        resultUuid: 'mock-agent-root-result',
        toolUseResult: {
          status: 'completed',
          prompt: SYSTEM_PROMPT,
          agentId: AGENT_ID,
          agentType: 'general-purpose',
          content: [{ type: 'text', text: SYSTEM_REPORT }],
          resolvedModel: 'demo-sonnet',
          totalDurationMs: 35_223,
          totalTokens: 29_797,
          totalToolUseCount: 7,
          toolStats: {
            readCount: 0,
            searchCount: 0,
            bashCount: 7,
            editFileCount: 0,
            linesAdded: 0,
            linesRemoved: 0,
            otherToolCount: 0,
          },
        },
      },
    ),
    assistantText(
      'The subagent completed the system-information query; this is an anonymized system overview sample.',
      {
        ts: '2026-08-05T01:52:12.834Z',
        uuid: 'mock-agent-root-summary',
      },
    ),
    userText('Start a security-auditor subagent to check the workspace security configuration.', {
      ts: '2026-08-05T02:00:00.000Z',
      uuid: 'mock-agent-create-failure-user',
    }),
    assistantText('I will try to start the requested security-auditor subagent.', {
      ts: '2026-08-05T02:00:01.000Z',
      uuid: 'mock-agent-create-failure-intro',
    }),
    ...toolCallPair(
      'Agent',
      {
        description: 'Run a security audit',
        prompt: 'Check the current workspace security configuration and return a risk summary.',
        subagent_type: 'security-auditor',
        run_in_background: false,
      },
      "Agent type 'security-auditor' is not registered",
      {
        id: 'call_mock_agent_create_failure',
        isError: true,
        ts: '2026-08-05T02:00:02.000Z',
        useUuid: 'mock-agent-create-failure-use',
        resultUuid: 'mock-agent-create-failure-result',
        toolUseResult: { status: 'failed' },
      },
    ),
    assistantText(
      'Creation failed: security-auditor is not registered in this environment, so no subagent session was created.',
      {
        ts: '2026-08-05T02:00:02.300Z',
        uuid: 'mock-agent-create-failure-summary',
      },
    ),
    userText('Use a general-purpose subagent to read the protected demo log instead.', {
      ts: '2026-08-05T02:05:00.000Z',
      uuid: 'mock-agent-execution-failure-user',
    }),
    assistantText('I will start a general-purpose subagent to read the log.', {
      ts: '2026-08-05T02:05:01.000Z',
      uuid: 'mock-agent-execution-failure-intro',
    }),
    ...toolCallPair(
      'Agent',
      {
        description: 'Read the protected log',
        prompt: 'Read the protected demo log and summarize recent anomalies.',
        subagent_type: 'general-purpose',
        run_in_background: false,
      },
      [
        'Agent execution failed: protected log could not be read.',
        `agentId: ${FAILED_AGENT_ID}`,
        '<usage>subagent_tokens: 1240',
        'tool_uses: 1',
        'duration_ms: 2000</usage>',
      ].join('\n'),
      {
        id: FAILED_AGENT_TOOL_USE_ID,
        isError: true,
        ts: FAILED_AGENT_CREATED_AT,
        useUuid: 'mock-agent-execution-failure-use',
        resultUuid: 'mock-agent-execution-failure-result',
        toolUseResult: {
          status: 'failed',
          prompt: 'Read the protected demo log and summarize recent anomalies.',
          agentId: FAILED_AGENT_ID,
          agentType: 'general-purpose',
          resolvedModel: 'demo-sonnet',
          totalDurationMs: 2_000,
          totalTokens: 1_240,
          totalToolUseCount: 1,
        },
      },
    ),
    assistantText(
      'The subagent was created but failed during execution because of insufficient permissions; open it to view the complete error transcript.',
      {
        ts: '2026-08-05T02:05:05.300Z',
        uuid: 'mock-agent-execution-failure-summary',
      },
    ),
  ]
}

export function agentSubagents(): MockSubagentDef[] {
  return [
    {
      meta: {
        id: AGENT_ID,
        agentType: 'general-purpose',
        description: 'Query system information',
        toolUseId: AGENT_TOOL_USE_ID,
        spawnDepth: 1,
        createdAt: CREATED_AT,
      },
      lines: agentTranscript,
    },
    {
      meta: {
        id: FAILED_AGENT_ID,
        agentType: 'general-purpose',
        description: 'Read the protected log',
        toolUseId: FAILED_AGENT_TOOL_USE_ID,
        spawnDepth: 1,
        createdAt: FAILED_AGENT_CREATED_AT,
      },
      lines: failedAgentTranscript,
    },
  ]
}
