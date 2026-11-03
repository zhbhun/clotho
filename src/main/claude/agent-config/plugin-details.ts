import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  type AgentMarketplacePlugin,
  type AgentPluginComponentInfo,
  type AgentPluginDetails,
  type AgentPluginInfo,
  type AgentPluginMcpInfo,
} from '@/shared/rpc'

import { readFrontmatter } from './frontmatter'

/**
 * Detail data for one plugin, assembled from the plugin's install-path
 * manifests (`plugin.json`, `skills/`, `agents/`, `.mcp.json`) plus the
 * installed record. A catalog entry with no local install resolves from the
 * available catalog only, with empty component lists.
 */

interface PluginManifest {
  name?: string
  displayName?: string
  description?: string
  version?: string
  author?: { name?: string } | string
  homepage?: string
  keywords?: string[]
  [extra: string]: unknown
}

interface McpServerEntry {
  command?: string
  args?: string[]
  url?: string
  [extra: string]: unknown
}

export async function getPluginDetails(
  pluginId: string,
  installed: AgentPluginInfo[],
  catalog: AgentMarketplacePlugin[],
): Promise<AgentPluginDetails> {
  const record = installed.find((entry) => entry.id === pluginId)
  const catalogEntry = catalog.find((entry) => entry.pluginId === pluginId)
  if (!record && !catalogEntry) {
    throw new Error(`Plugin not found: ${pluginId}`)
  }

  const name = pluginId.slice(0, Math.max(pluginId.lastIndexOf('@'), 0)) || pluginId
  const manifest = record ? await readPluginManifest(record.installPath) : null
  const author = typeof manifest?.author === 'string' ? manifest.author : manifest?.author?.name
  const componentLists = record
    ? await readPluginComponents(record.installPath)
    : { skills: [], mcpServers: [], subagents: [] }

  return {
    pluginId,
    name: manifest?.displayName ?? manifest?.name ?? catalogEntry?.name ?? name,
    description: manifest?.description ?? catalogEntry?.description,
    author,
    category: manifest?.keywords?.[0],
    homepage: manifest?.homepage,
    version: record?.version ?? manifest?.version,
    marketplace: record?.marketplace ?? catalogEntry?.marketplaceName,
    scope: record?.scope,
    installPath: record?.installPath,
    installedAt: record?.installedAt,
    enabled: record?.enabled,
    installed: Boolean(record),
    installCount: catalogEntry?.installCount,
    ...componentLists,
  }
}

async function readPluginManifest(installPath: string): Promise<PluginManifest | null> {
  try {
    const source = await fs.readFile(
      path.join(installPath, '.claude-plugin', 'plugin.json'),
      'utf8',
    )
    return JSON.parse(source) as PluginManifest
  } catch {
    // No manifest (the marketplace entry is then the manifest) or unreadable.
    return null
  }
}

async function readPluginComponents(installPath: string): Promise<{
  skills: AgentPluginComponentInfo[]
  mcpServers: AgentPluginMcpInfo[]
  subagents: AgentPluginComponentInfo[]
}> {
  const [skills, subagents, mcpServers] = await Promise.all([
    readPluginSkills(installPath),
    readPluginSubagents(installPath),
    readPluginMcpServers(installPath),
  ])
  return { skills, mcpServers, subagents }
}

async function readPluginSkills(installPath: string): Promise<AgentPluginComponentInfo[]> {
  const skillsDir = path.join(installPath, 'skills')
  let entries
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<AgentPluginComponentInfo | null> => {
        try {
          const source = await fs.readFile(path.join(skillsDir, entry.name, 'SKILL.md'), 'utf8')
          const frontmatter = readFrontmatter(source)
          return { name: frontmatter.name ?? entry.name, description: frontmatter.description }
        } catch {
          return null
        }
      }),
  )
  return skills.filter((skill): skill is AgentPluginComponentInfo => skill !== null)
}

async function readPluginSubagents(installPath: string): Promise<AgentPluginComponentInfo[]> {
  const agentsDir = path.join(installPath, 'agents')
  let entries
  try {
    entries = await fs.readdir(agentsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const agents = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry): Promise<AgentPluginComponentInfo | null> => {
        try {
          const source = await fs.readFile(path.join(agentsDir, entry.name), 'utf8')
          const frontmatter = readFrontmatter(source)
          return {
            name: frontmatter.name ?? entry.name.replace(/\.md$/, ''),
            description: frontmatter.description,
          }
        } catch {
          return null
        }
      }),
  )
  return agents.filter((agent): agent is AgentPluginComponentInfo => agent !== null)
}

async function readPluginMcpServers(installPath: string): Promise<AgentPluginMcpInfo[]> {
  let parsed: Record<string, McpServerEntry>
  try {
    const source = await fs.readFile(path.join(installPath, '.mcp.json'), 'utf8')
    parsed = JSON.parse(source) as Record<string, McpServerEntry>
  } catch {
    return []
  }
  return Object.entries(parsed).map(([name, entry]) => ({
    name,
    summary:
      entry.url ?? (entry.command ? [entry.command, ...(entry.args ?? [])].join(' ') : undefined),
  }))
}
