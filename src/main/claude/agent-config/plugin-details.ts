import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  type AgentMarketplacePlugin,
  type AgentPluginComponentInfo,
  type AgentPluginDetails,
  type AgentPluginInfo,
  type AgentPluginMcpInfo,
} from '@/shared/rpc'

import { readCatalogCacheEntry } from './catalog-cache'
import { readFrontmatter } from './frontmatter'
import {
  type MarketplaceSnapshotEntry,
  claudePluginsDir,
  readMarketplaceSnapshotEntry,
} from './marketplace-snapshot'
import { resolveDownloadedPluginPath } from './plugin-download-cache'

/**
 * Detail data for one plugin, joined from local sources in increasing
 * precedence — marketplace snapshot manifest → CLI catalog cache → download
 * cache (uninstalled only) → install-path manifests (`plugin.json`, `skills/`,
 * `commands/`, `agents/`, `.mcp.json`) → installed record (later sources win).
 * The snapshot and cache give uninstalled catalog entries their listing fields
 * and component lists; all reads are local-file only and degrade silently
 * (spec: silent skip).
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

/** Mutable detail accumulator: local sources fill, installed data wins. */
interface DetailDraft {
  displayName?: string
  description?: string
  author?: string
  category?: string
  homepage?: string
  version?: string
  installCount?: number
  components: {
    skills: AgentPluginComponentInfo[]
    commands: AgentPluginComponentInfo[]
    mcpServers: AgentPluginMcpInfo[]
    subagents: AgentPluginComponentInfo[]
    hooks: AgentPluginComponentInfo[]
  }
}

function splitPluginId(pluginId: string): { name: string; marketplace: string } {
  const at = pluginId.lastIndexOf('@')
  return at > 0
    ? { name: pluginId.slice(0, at), marketplace: pluginId.slice(at + 1) }
    : { name: pluginId, marketplace: '' }
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

  const { name, marketplace } = splitPluginId(pluginId)
  const draft: DetailDraft = {
    components: {
      skills: [],
      commands: [],
      mcpServers: [],
      subagents: [],
      hooks: [],
    },
  }

  // 1. Marketplace snapshot: listing fields for any catalog/installed plugin
  //    whose marketplace keeps a local manifest.
  const snapshot = await readMarketplaceSnapshotEntry(record?.marketplace ?? marketplace, name)
  if (snapshot) applySnapshot(draft, snapshot)

  // 2. CLI catalog cache: component lists + install stats (official market).
  const cache = await readCatalogCacheEntry(pluginId).catch(() => undefined)
  if (cache) {
    applyCatalogCache(draft, cache)
  }

  // 2b. Download cache: the CLI keeps fetched sources for uninstalled plugins;
  //     their manifests carry real component descriptions. The catalog cache's
  //     source sha pins the revision when it names one.
  const downloadedPath = record
    ? undefined
    : await resolveDownloadedPluginPath(
        marketplace,
        name,
        claudePluginsDir(),
        cache?.revisionSha,
      ).catch(() => undefined)
  const downloadedManifest = downloadedPath ? await readPluginManifest(downloadedPath) : null
  if (downloadedManifest) applyManifest(draft, downloadedManifest)
  if (downloadedPath) {
    const downloadedComponents = await readPluginComponents(downloadedPath)
    overrideComponents(draft.components, downloadedComponents)
  }

  // 3. Install-path manifests (authoritative for components when installed).
  const manifest = record ? await readPluginManifest(record.installPath) : null
  if (manifest) applyManifest(draft, manifest)
  if (record) {
    draft.components = await readPluginComponents(record.installPath)
    if (record.version) draft.version = record.version
    if (catalogEntry?.installCount !== undefined) {
      draft.installCount = catalogEntry.installCount
    }
  } else if (catalogEntry?.version && !draft.version) {
    draft.version = catalogEntry.version
  }

  return {
    pluginId,
    name,
    displayName: draft.displayName,
    description: draft.description ?? catalogEntry?.description,
    author: draft.author,
    category: draft.category,
    homepage: draft.homepage,
    version: draft.version,
    marketplace: record?.marketplace ?? catalogEntry?.marketplaceName,
    scope: record?.scope,
    installPath: record?.installPath,
    installedAt: record?.installedAt,
    enabled: record?.enabled,
    installed: Boolean(record),
    installCount: draft.installCount,
    ...draft.components,
  }
}

function applySnapshot(draft: DetailDraft, snapshot: MarketplaceSnapshotEntry) {
  draft.displayName ??= snapshot.displayName
  draft.description ??= snapshot.description
  draft.author ??= snapshot.author
  draft.category ??= snapshot.category ?? snapshot.keywords?.[0]
  draft.homepage ??= snapshot.homepage
  draft.version ??= snapshot.version
}

function applyCatalogCache(
  draft: DetailDraft,
  cache: Awaited<ReturnType<typeof readCatalogCacheEntry>> & NonNullable<unknown>,
) {
  mergeComponents(draft.components, {
    skills: cache.components.skills,
    commands: cache.components.commands,
    mcpServers: cache.components.mcpServers.map((server) => ({
      name: server.name,
      ...(server.summary ? { summary: server.summary } : {}),
    })),
    subagents: cache.components.agents,
    hooks: cache.components.hooks,
  })
  draft.installCount ??= cache.installCount
}

/** Fill empty component groups from a weaker source, keeping filled ones. */
function mergeComponents(
  target: DetailDraft['components'],
  source: Partial<DetailDraft['components']>,
) {
  if (!target.skills.length) target.skills = source.skills ?? []
  if (!target.commands.length) target.commands = source.commands ?? []
  if (!target.subagents.length) target.subagents = source.subagents ?? []
  if (!target.mcpServers.length) target.mcpServers = source.mcpServers ?? []
  if (!target.hooks.length) target.hooks = source.hooks ?? []
}

/**
 * Component groups from real downloaded sources: same-name entries replace
 * their catalog-cache stubs (real frontmatter descriptions beat name-only
 * listings); groups the source lacks are left untouched.
 */
function overrideComponents(target: DetailDraft['components'], source: DetailDraft['components']) {
  for (const key of ['skills', 'commands', 'mcpServers', 'subagents', 'hooks'] as const) {
    if (source[key].length === 0) continue
    const byName = new Map(target[key].map((item) => [item.name, item]))
    for (const item of source[key]) byName.set(item.name, { ...byName.get(item.name), ...item })
    target[key] = [...byName.values()]
  }
}

function applyManifest(draft: DetailDraft, manifest: PluginManifest) {
  draft.displayName ??= manifest.displayName
  draft.description ??= manifest.description
  draft.author ??= typeof manifest.author === 'string' ? manifest.author : manifest.author?.name
  draft.homepage ??= manifest.homepage
  draft.version ??= manifest.version
  // Category: the manifest's first keyword when the snapshot lacks a slug.
  draft.category ??= manifest.keywords?.[0]
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

async function readPluginComponents(installPath: string): Promise<DetailDraft['components']> {
  const [skills, subagents, commands, mcpServers, hooks] = await Promise.all([
    readPluginSkills(installPath),
    readPluginSubagents(installPath),
    readPluginCommands(installPath),
    readPluginMcpServers(installPath),
    readPluginHooks(installPath),
  ])
  return { skills, commands, mcpServers, subagents, hooks }
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

async function readPluginCommands(installPath: string): Promise<AgentPluginComponentInfo[]> {
  const commandsDir = path.join(installPath, 'commands')
  let entries
  try {
    entries = await fs.readdir(commandsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const commands = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry): Promise<AgentPluginComponentInfo | null> => {
        try {
          const source = await fs.readFile(path.join(commandsDir, entry.name), 'utf8')
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
  return commands.filter((command): command is AgentPluginComponentInfo => command !== null)
}

/**
 * Hook manifest from `hooks.json`: one row per event (`{ hooks: { Event:
 * [{ matcher?, hooks: […] }] } }`, legacy flat `{ Event: […] }` also
 * accepted). The description carries the matchers so the row shows when the
 * hook fires, not just the event name.
 */
async function readPluginHooks(installPath: string): Promise<AgentPluginComponentInfo[]> {
  const hooksPath = path.join(installPath, 'hooks', 'hooks.json')
  try {
    const source = await fs.readFile(hooksPath, 'utf8')
    const parsed = JSON.parse(source) as {
      hooks?: Record<string, unknown>
      [event: string]: unknown
    }
    const events = parsed.hooks && typeof parsed.hooks === 'object' ? parsed.hooks : parsed
    return Object.entries(events)
      .filter(([, spec]) => typeof spec === 'object' && spec !== null)
      .map(([event, spec]) => {
        const matchers = (Array.isArray(spec) ? spec : [spec])
          .map((entry): string | undefined => {
            if (typeof entry !== 'object' || entry === null) return undefined
            const matcher = (entry as HookEntry).matcher
            return typeof matcher === 'string' && matcher.trim() ? matcher : undefined
          })
          .filter((matcher): matcher is string => Boolean(matcher))
        return {
          name: event,
          ...(matchers.length > 0 ? { description: matchers.join(', ') } : {}),
        }
      })
  } catch {
    return []
  }
}

interface HookEntry {
  matcher?: unknown
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
