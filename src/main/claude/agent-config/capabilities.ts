import type { Settings } from '@anthropic-ai/claude-agent-sdk'

import { readJsonFile, writeJsonAtomic } from './fs-safe'
import { type McpServerEntry, listMcpServers } from './mcp-servers'
import { claudeSettingsPath } from './paths'

function mcpState(server: McpServerEntry, settings: Settings) {
  const rules = settings.deniedMcpServers ?? []
  let blockedBy: 'url' | 'command' | undefined
  for (const rule of rules) {
    if (rule.serverUrl && server.type !== 'stdio' && server.url) {
      const pattern = rule.serverUrl
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')
      if (new RegExp(`^${pattern}$`).test(server.url)) blockedBy = 'url'
    }
    if (rule.serverCommand && server.type === 'stdio') {
      const command = [server.command, ...(server.args ?? [])]
      if (
        rule.serverCommand.length === command.length &&
        rule.serverCommand.every((arg, index) => arg === command[index])
      )
        blockedBy = 'command'
    }
  }
  return {
    disabled: Boolean(blockedBy) || rules.some((rule) => rule.serverName === server.name),
    ...(blockedBy ? { blockedBy } : {}),
  }
}

function capabilityToggles(settings: Settings) {
  return {
    disabledSkills: Object.entries(settings.skillOverrides ?? {})
      .filter(([, state]) => state === 'off')
      .map(([name]) => name),
    disabledMcpServers: (settings.deniedMcpServers ?? []).flatMap((entry) =>
      entry.serverName ? [entry.serverName] : [],
    ),
  }
}

async function readCapabilitySettings(claudeDir?: string) {
  const filePath = claudeSettingsPath(claudeDir)
  const read = await readJsonFile<Settings>(filePath)
  if (!read.ok && read.reason !== 'missing') {
    throw new Error(`Cannot read ${filePath}: managed file failed to parse`)
  }
  return read.ok ? read.value : {}
}

export async function getCapabilityToggles(claudeDir?: string) {
  return capabilityToggles(await readCapabilitySettings(claudeDir))
}

export async function getMcpServerStates(servers: McpServerEntry[], claudeDir?: string) {
  const settings = await readCapabilitySettings(claudeDir)
  return servers.map((server) => ({ ...server, ...mcpState(server, settings) }))
}

export async function setCapabilityToggle(
  kind: 'skill' | 'mcp',
  name: string,
  enabled: boolean,
  claudeDir?: string,
) {
  if (!name.trim()) throw new Error('A capability requires a name')
  const server =
    kind === 'mcp' && enabled
      ? (await listMcpServers(claudeDir)).servers.find((server) => server.name === name)
      : undefined
  const next = await writeJsonAtomic<Settings>(claudeSettingsPath(claudeDir), (current) => {
    if (kind === 'skill') {
      return {
        ...current,
        skillOverrides: { ...current.skillOverrides, [name]: enabled ? 'on' : 'off' },
      }
    }
    if (server && mcpState(server, current).blockedBy) {
      throw new Error(
        'Cannot enable an MCP server blocked by a URL or command deny rule in Claude settings',
      )
    }
    const denied = (current.deniedMcpServers ?? []).filter((entry) => entry.serverName !== name)
    if (!enabled) denied.push({ serverName: name })
    return { ...current, deniedMcpServers: denied }
  })
  return capabilityToggles(next)
}
