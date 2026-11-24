import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { claudeRuntime } from '../runtime'
import { trackClaudeProcess } from '../runtime/processes'
import { resolveClaudeCodeBinary } from '../sdk-binary'

const CLI_TIMEOUT_MS = 30_000
const CLI_MAX_BUFFER = 10 * 1024 * 1024

/**
 * Plugin management over the Claude Code CLI's own `plugin` subcommands: the
 * CLI resolves installs, marketplaces, and enable state (`enabledPlugins` in
 * `~/.claude/settings.json`) and owns every file under `~/.claude/plugins/`.
 * Clotho only invokes the CLI and reads its JSON output.
 */

export interface InstalledPlugin {
  /** `<plugin>@<marketplace>`. */
  id: string
  name: string
  marketplace: string
  version: string
  scope: string
  installPath: string
  enabled: boolean
  installedAt?: string
  /** CLI-reported install warnings (e.g. dependencies it refused to install). */
  notes?: string[]
}

export interface MarketplacePlugin {
  pluginId: string
  name: string
  description?: string
  marketplaceName: string
  installCount?: number
  version?: string
}

export interface MarketplaceInfo {
  name: string
  description?: string
  owner?: string
  source: { source: string; repo?: string; url?: string; path?: string }
  installLocation: string
}

/** Raw shapes from `claude plugin list --json` / `--available --json`. */
interface CliInstalledPlugin {
  id: string
  version: string
  scope: string
  enabled: boolean
  installPath: string
  installedAt?: string
  notes?: string[]
  [extra: string]: unknown
}

interface CliAvailablePlugin {
  pluginId?: string
  name: string
  description?: string
  marketplaceName: string
  installCount?: number
  version?: string
  [extra: string]: unknown
}

interface CliMarketplace {
  name: string
  source: string
  repo?: string
  url?: string
  path?: string
  installLocation: string
  [extra: string]: unknown
}

/**
 * Promise wrapper over execFile (hand-rolled instead of `promisify` so the
 * resolve shape is exactly `{ stdout, stderr }` regardless of the callee).
 */
function run(
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; encoding: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
    trackClaudeProcess(child)
    child.on('error', (error) => claudeRuntime.invalidate(error))
  })
}

async function runPluginCommand(args: string[]): Promise<string> {
  try {
    const { stdout } = await run(await resolveClaudeCodeBinary(), ['plugin', ...args], {
      timeout: CLI_TIMEOUT_MS,
      maxBuffer: CLI_MAX_BUFFER,
      encoding: 'utf-8',
    })
    return stdout
  } catch (caught) {
    const error = caught as { stderr?: string; message?: string }
    const detail = error.stderr?.trim() || error.message || 'unknown error'
    throw new Error(`claude plugin ${args.join(' ')} failed: ${detail}`)
  }
}

async function runPluginCommandJson<T>(args: string[]): Promise<T> {
  const stdout = await runPluginCommand([...args, '--json'])
  try {
    return JSON.parse(stdout) as T
  } catch {
    throw new Error(`claude plugin ${args.join(' ')} printed invalid JSON`)
  }
}

function splitPluginId(id: string): { name: string; marketplace: string } {
  const at = id.lastIndexOf('@')
  return at > 0
    ? { name: id.slice(0, at), marketplace: id.slice(at + 1) }
    : { name: id, marketplace: '' }
}

export async function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  const installed = await runPluginCommandJson<CliInstalledPlugin[]>(['list'])
  return installed.map((entry) => ({
    ...splitPluginId(entry.id),
    id: entry.id,
    version: entry.version,
    scope: entry.scope,
    installPath: entry.installPath,
    enabled: entry.enabled,
    installedAt: entry.installedAt,
    notes: entry.notes,
  }))
}

export async function listMarketplacePlugins(): Promise<MarketplacePlugin[]> {
  const catalog = await runPluginCommandJson<{
    installed?: unknown
    available?: CliAvailablePlugin[]
  }>(['list', '--available'])
  return (catalog.available ?? []).map((entry) => ({
    pluginId: entry.pluginId ?? `${entry.name}@${entry.marketplaceName}`,
    name: entry.name,
    description: entry.description,
    marketplaceName: entry.marketplaceName,
    installCount: entry.installCount,
    ...(entry.version ? { version: entry.version } : {}),
  }))
}

async function readMarketplaceMetadata(
  installLocation: string,
): Promise<{ description?: string; owner?: string }> {
  if (!installLocation) return {}
  try {
    const raw = await fs.readFile(
      path.join(installLocation, '.claude-plugin', 'marketplace.json'),
      'utf8',
    )
    const manifest = JSON.parse(raw) as {
      description?: unknown
      metadata?: { description?: unknown }
      owner?: { name?: unknown }
    }
    const description = [manifest?.description, manifest?.metadata?.description].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    )
    const owner = manifest?.owner?.name
    return {
      ...(description ? { description } : {}),
      ...(typeof owner === 'string' && owner.trim() ? { owner } : {}),
    }
  } catch {
    return {}
  }
}

export async function listMarketplaces(): Promise<MarketplaceInfo[]> {
  const marketplaces = await runPluginCommandJson<CliMarketplace[]>(['marketplace', 'list'])
  return Promise.all(
    marketplaces.map(async (entry) => {
      const metadata = await readMarketplaceMetadata(entry.installLocation)
      return {
        name: entry.name,
        ...metadata,
        source: { source: entry.source, repo: entry.repo, url: entry.url, path: entry.path },
        installLocation: entry.installLocation,
      }
    }),
  )
}

export async function installPlugin(pluginId: string): Promise<void> {
  if (!pluginId.trim()) throw new Error('Installing a plugin requires a plugin id')
  await runPluginCommand(['install', pluginId])
}

export async function removeInstalledPlugin(id: string): Promise<void> {
  if (!id.trim()) throw new Error('Uninstalling a plugin requires a plugin id')
  await runPluginCommand(['uninstall', id])
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  if (!id.trim()) throw new Error('Toggling a plugin requires a plugin id')
  await runPluginCommand([enabled ? 'enable' : 'disable', id])
}

export async function addMarketplace(source: string): Promise<void> {
  if (!source.trim()) throw new Error('Adding a marketplace requires a source')
  await runPluginCommand(['marketplace', 'add', source])
}

export async function removeMarketplace(name: string): Promise<void> {
  if (!name.trim()) throw new Error('Removing a marketplace requires a name')
  await runPluginCommand(['marketplace', 'remove', name])
}

export async function refreshMarketplace(name?: string): Promise<void> {
  await runPluginCommand(
    name?.trim() ? ['marketplace', 'update', name.trim()] : ['marketplace', 'update'],
  )
}
