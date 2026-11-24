import { getLogger } from '../../logging/runtime'
import { type JsonReadResult, readJsonFile, writeJsonAtomic } from './fs-safe'
import { claudeJsonPath } from './paths'

const logger = getLogger('agent-config')

/** Claude Code user-scoped MCP server entries (subset the UI edits). */
export interface McpServerConfig {
  type: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  /** Unknown extra fields from the CLI are preserved on round-trip. */
  [extra: string]: unknown
}

/** The server config plus its key in `mcpServers`. */
export type McpServerEntry = McpServerConfig & { name: string }

type ClaudeJsonFile = { mcpServers?: Record<string, McpServerConfig> } & Record<string, unknown>

export async function listMcpServers(
  claudeDir?: string,
): Promise<{ servers: McpServerEntry[]; read: JsonReadResult<ClaudeJsonFile> }> {
  const read = await readJsonFile<ClaudeJsonFile>(claudeJsonPath(claudeDir))
  if (!read.ok) return { servers: [], read }
  const servers = Object.entries(read.value.mcpServers ?? {}).map(([name, config]) => ({
    name,
    ...config,
  }))
  return { servers, read }
}

const SERVER_TYPES = new Set(['stdio', 'http', 'sse'])

export function validateMcpServer(input: McpServerConfig): string | null {
  if (!SERVER_TYPES.has(input.type)) return `Unknown MCP server type: ${String(input.type)}`
  if (input.type === 'stdio') {
    if (typeof input.command !== 'string' || !input.command.trim()) {
      return 'A stdio MCP server requires a command'
    }
  } else {
    if (typeof input.url !== 'string' || !input.url.trim()) {
      return `A ${input.type} MCP server requires a url`
    }
  }
  return null
}

export async function saveMcpServer(
  name: string,
  config: McpServerConfig,
  claudeDir?: string,
): Promise<void> {
  const problem = validateMcpServer(config)
  if (problem) throw new Error(problem)
  if (!name.trim()) throw new Error('An MCP server requires a name')
  // Fresh read at save time; unrelated CLI fields survive (design D3).
  await writeJsonAtomic<ClaudeJsonFile>(claudeJsonPath(claudeDir), (current) => ({
    ...current,
    mcpServers: { ...(current.mcpServers ?? {}), [name]: config },
  }))
}

export async function deleteMcpServer(name: string, claudeDir?: string): Promise<void> {
  await writeJsonAtomic<ClaudeJsonFile>(claudeJsonPath(claudeDir), (current) => {
    const remaining = { ...(current.mcpServers ?? {}) }
    delete remaining[name]
    return { ...current, mcpServers: remaining }
  })
}

export function logSkippedServer(name: string, reason: string) {
  logger.warning('agent_config.mcp_server_skipped', 'Skipped an invalid MCP server entry', {
    context: { name, reason },
  })
}
