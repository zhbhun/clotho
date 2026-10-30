import { type AgentInfo, query } from '@anthropic-ai/claude-agent-sdk'

import { type AgentSubagentFields } from '@/shared/rpc'

import { getLogger } from '../../logging/runtime'
import { type SubagentConfigFile, listSubagentConfigs, subagentFieldsFrom } from './subagents'

const logger = getLogger('agent-config')

export type AvailableSubagentSource = 'builtin' | 'plugin' | 'custom'

/**
 * Renderer-facing shape for the available-subagent list; mirrors
 * `AgentSubagentConfig` with source classification from the SDK resolution.
 */
export interface AvailableSubagent extends AgentSubagentFields {
  name: string
  description: string
  source: AvailableSubagentSource
  builtin: boolean
  body: string
  /** File stem; the write target of the existing file CRUD for custom agents only. */
  file: string
}

/** Classify by name with custom-first precedence (design D3). */
export function classifyAgent(
  agent: AgentInfo,
  fileStems: ReadonlySet<string>,
): AvailableSubagentSource {
  if (fileStems.has(agent.name)) return 'custom'
  if (agent.name.includes(':')) return 'plugin'
  return 'builtin'
}

function customSubagentFrom(config: SubagentConfigFile): AvailableSubagent {
  return {
    name: config.file,
    description: config.fields.description ?? '',
    source: 'custom',
    builtin: false,
    ...subagentFieldsFrom(config.fields),
    body: config.body,
    file: config.file,
  }
}

function brokenSubagentFrom(file: string): AvailableSubagent {
  return { name: file, description: '', source: 'custom', builtin: false, body: '', file }
}

/** Resolve the SDK-reported agent set; the resolver is injectable for tests. */
export async function resolveAvailableSubagents(
  resolveAgents: () => Promise<AgentInfo[]> = resolveViaSdk,
): Promise<AvailableSubagent[]> {
  const configs = await listSubagentConfigs()
  const fileStems = new Set(configs.map((config) => config.file))
  const configByStem = new Map(
    configs
      .filter((config): config is SubagentConfigFile => !('broken' in config))
      .map((config) => [config.file, config]),
  )
  const agents = await resolveAgents()
  return agents.map((agent) => {
    const source = classifyAgent(agent, fileStems)
    const config = source === 'custom' ? configByStem.get(agent.name) : undefined
    if (!config) {
      return {
        name: agent.name,
        description: agent.description,
        model: agent.model,
        source,
        builtin: source !== 'custom',
        body: '',
        file: agent.name,
      }
    }
    return customSubagentFrom(config)
  })
}

async function resolveViaSdk(): Promise<AgentInfo[]> {
  const q = query({ prompt: '' })
  try {
    return await q.supportedAgents()
  } finally {
    q.close()
  }
}

// Module-level snapshot for the app session; a restart is the refresh path (design D2).
let cache: AvailableSubagent[] | null = null

export async function listAvailableSubagents(): Promise<AvailableSubagent[]> {
  if (!cache) {
    cache = await resolveWithFallback()
  }
  return cache
}

/**
 * On SDK failure, degrade to the file scan so the page keeps today's behavior
 * instead of going blank (design D5). The caller surfaces the load error.
 */
async function resolveWithFallback(): Promise<AvailableSubagent[]> {
  try {
    return await resolveAvailableSubagents()
  } catch (caught) {
    logger.warning(
      'agent_config.available_subagents_failed',
      'Failed to resolve supported agents',
      {
        error: caught,
      },
    )
    const configs = await listSubagentConfigs()
    return configs.map((config) =>
      'broken' in config ? brokenSubagentFrom(config.file) : customSubagentFrom(config),
    )
  }
}
