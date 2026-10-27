import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import { readJsonFile, writeJsonAtomic } from './fs-safe'

const execFileAsync = promisify(execFile)

/**
 * Plugin management over the CLI's own files (design D6): installed plugins
 * from `~/.claude/plugins/installed_plugins.json`, marketplaces from
 * `known_marketplaces.json` + `marketplaces/` git clones. Clotho-scoped
 * enable state lives in Clotho's settings, never in the CLI's files.
 */
export interface InstalledPlugin {
  /** `<plugin>@<marketplace>`. */
  id: string
  name: string
  marketplace: string
  version: string
  installPath: string
  installedAt?: string
}

export interface MarketplacePlugin {
  name: string
  description?: string
  source?: string
}

export interface MarketplaceInfo {
  name: string
  source: { source: string; repo?: string; url?: string }
  installLocation: string
  plugins: MarketplacePlugin[]
}

export interface PluginInstallEntry {
  scope: string
  installPath: string
  version: string
  installedAt: string
  lastUpdated?: string
  gitCommitSha?: string
  [extra: string]: unknown
}

type InstalledPluginsFile = { version?: number; plugins?: Record<string, PluginInstallEntry[]> }
type KnownMarketplacesFile = Record<
  string,
  { source: MarketplaceInfo['source']; installLocation: string; lastUpdated?: string }
>

export function pluginsDir(claudeDir = path.join(process.env.HOME ?? '', '.claude')) {
  return path.join(claudeDir, 'plugins')
}

export function installedPluginsPath(claudeDir?: string) {
  return path.join(pluginsDir(claudeDir), 'installed_plugins.json')
}

export function knownMarketplacesPath(claudeDir?: string) {
  return path.join(pluginsDir(claudeDir), 'known_marketplaces.json')
}

export async function listInstalledPlugins(claudeDir?: string): Promise<InstalledPlugin[]> {
  const read = await readJsonFile<InstalledPluginsFile>(installedPluginsPath(claudeDir))
  if (!read.ok) return []
  return Object.entries(read.value.plugins ?? {}).flatMap(([id, entries]) => {
    const entry = entries.find((candidate) => candidate.scope === 'user') ?? entries[0]
    if (!entry) return []
    const at = id.lastIndexOf('@')
    return [
      {
        id,
        name: at > 0 ? id.slice(0, at) : id,
        marketplace: at > 0 ? id.slice(at + 1) : '',
        version: entry.version,
        installPath: entry.installPath,
        installedAt: entry.installedAt,
      },
    ]
  })
}

export async function listMarketplaces(claudeDir?: string): Promise<MarketplaceInfo[]> {
  const read = await readJsonFile<KnownMarketplacesFile>(knownMarketplacesPath(claudeDir))
  if (!read.ok) return []
  return Promise.all(
    Object.entries(read.value).map(async ([name, entry]) => ({
      name,
      source: entry.source,
      installLocation: entry.installLocation,
      plugins: await readMarketplacePlugins(entry.installLocation),
    })),
  )
}

async function readMarketplacePlugins(installLocation: string): Promise<MarketplacePlugin[]> {
  const manifestPath = path.join(installLocation, '.claude-plugin', 'marketplace.json')
  const read = await readJsonFile<{ plugins?: MarketplacePlugin[] }>(manifestPath)
  return read.ok ? (read.value.plugins ?? []) : []
}

export async function removeInstalledPlugin(id: string, claudeDir?: string): Promise<void> {
  const read = await readJsonFile<InstalledPluginsFile>(installedPluginsPath(claudeDir))
  const entry = read.ok
    ? ((read.value.plugins?.[id] ?? []).find((candidate) => candidate.scope === 'user') ??
      read.value.plugins?.[id]?.[0])
    : undefined
  if (!entry) throw new Error(`Unknown installed plugin: ${id}`)
  await fs.rm(entry.installPath, { recursive: true, force: true })
  await writeJsonAtomic<InstalledPluginsFile>(installedPluginsPath(claudeDir), (current) => {
    const plugins = { ...(current.plugins ?? {}) }
    delete plugins[id]
    return { ...current, plugins }
  })
}

function marketplaceNameFromSource(source: string): string {
  const withoutGit = source.replace(/\.git$/, '')
  const lastSegment = withoutGit.split('/').pop() ?? withoutGit
  if (!lastSegment || !/^[\w.-]+$/.test(lastSegment)) {
    throw new Error(`Cannot derive a marketplace name from: ${source}`)
  }
  return lastSegment
}

export async function addMarketplace(gitUrl: string, claudeDir?: string): Promise<string> {
  if (!/^https?:\/\/|^[^@]+@[^:]+:/.test(gitUrl)) {
    throw new Error(`Not a git URL: ${gitUrl}`)
  }
  const name = marketplaceNameFromSource(gitUrl)
  const installLocation = path.join(pluginsDir(claudeDir), 'marketplaces', name)
  await fs.mkdir(path.dirname(installLocation), { recursive: true })
  await execFileAsync('git', ['clone', '--depth', '1', gitUrl, installLocation])
  await writeJsonAtomic<KnownMarketplacesFile>(knownMarketplacesPath(claudeDir), (current) => ({
    ...current,
    [name]: {
      source: { source: 'git', url: gitUrl },
      installLocation,
      lastUpdated: new Date().toISOString(),
    },
  }))
  return name
}

export async function removeMarketplace(name: string, claudeDir?: string): Promise<void> {
  const read = await readJsonFile<KnownMarketplacesFile>(knownMarketplacesPath(claudeDir))
  const entry = read.ok ? read.value[name] : undefined
  if (!entry) throw new Error(`Unknown marketplace: ${name}`)
  await fs.rm(entry.installLocation, { recursive: true, force: true })
  await writeJsonAtomic<KnownMarketplacesFile>(knownMarketplacesPath(claudeDir), (current) => {
    const next = { ...current }
    delete next[name]
    return next
  })
}

/**
 * Install = copy from the marketplace checkout into the plugins cache and
 * record a v2-shaped `installed_plugins.json` entry. A file copy never
 * executes plugin content; plugin code only runs inside sessions.
 */
export async function installPlugin(
  marketplace: string,
  pluginName: string,
  claudeDir?: string,
): Promise<void> {
  const read = await readJsonFile<KnownMarketplacesFile>(knownMarketplacesPath(claudeDir))
  const marketplaceEntry = read.ok ? read.value[marketplace] : undefined
  if (!marketplaceEntry) throw new Error(`Unknown marketplace: ${marketplace}`)
  const plugins = await readMarketplacePlugins(marketplaceEntry.installLocation)
  const manifest = plugins.find((plugin) => plugin.name === pluginName)
  if (!manifest) throw new Error(`${pluginName} is not in marketplace ${marketplace}`)

  const pluginId = `${pluginName}@${marketplace}`
  const cacheRoot = path.join(
    pluginsDir(claudeDir),
    'cache',
    marketplace,
    pluginName,
    manifest.source ?? 'local',
  )
  await fs.rm(cacheRoot, { recursive: true, force: true })
  await fs.mkdir(path.dirname(cacheRoot), { recursive: true })
  await fs.cp(path.join(marketplaceEntry.installLocation, pluginNameToPath(manifest)), cacheRoot, {
    recursive: true,
  })

  const now = new Date().toISOString()
  await writeJsonAtomic<InstalledPluginsFile>(installedPluginsPath(claudeDir), (current) => ({
    ...current,
    version: current.version ?? 2,
    plugins: {
      ...(current.plugins ?? {}),
      [pluginId]: [
        {
          scope: 'user',
          installPath: cacheRoot,
          version: manifest.source ?? 'local',
          installedAt: now,
          lastUpdated: now,
        },
      ],
    },
  }))
}

/** Marketplace manifests may point at `plugins/<name>` or a `source` path. */
function pluginNameToPath(manifest: MarketplacePlugin): string {
  if (!manifest.source || manifest.source === 'local') return manifest.name
  // A relative source path inside the checkout (e.g. "plugins/foo" or "./foo").
  return manifest.source.replace(/^\.\//, '')
}
