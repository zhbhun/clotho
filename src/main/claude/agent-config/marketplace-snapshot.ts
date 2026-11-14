import { promises as fs } from 'node:fs'
import path from 'node:path'

import { getLogger } from '../../logging/runtime'

const logger = getLogger('agent-config')

/**
 * Marketplace manifest snapshots the Claude Code CLI keeps for every
 * registered marketplace: `<installLocation>/.claude-plugin/marketplace.json`
 * (typically `~/.claude/plugins/marketplaces/<name>/...`). Each entry carries
 * the store-listing fields the CLI's `--available` output strips (author,
 * category, homepage, displayName, version, keywords). Reads are local-file
 * only; anything missing or unreadable degrades to `undefined` so detail
 * assembly never fails on a snapshot (spec: silent skip).
 */

export interface MarketplaceSnapshotEntry {
  name: string
  displayName?: string
  description?: string
  author?: string
  category?: string
  homepage?: string
  version?: string
  keywords?: string[]
}

interface SnapshotAuthor {
  name?: string
}

interface RawSnapshotEntry {
  name?: unknown
  displayName?: unknown
  description?: unknown
  author?: unknown
  category?: unknown
  homepage?: unknown
  version?: unknown
  keywords?: unknown
  [extra: string]: unknown
}

/** Resolve the plugin home for tests: `claudeDir` defaults to `~/.claude`. */
export function claudePluginsDir(claudeDir = path.join(process.env.HOME ?? '', '.claude')) {
  return path.join(claudeDir, 'plugins')
}

async function readKnownMarketplaceLocation(
  marketplace: string,
  pluginsDir: string,
): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(path.join(pluginsDir, 'known_marketplaces.json'), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, { installLocation?: unknown } | undefined>
    const record = parsed?.[marketplace]
    const location = record?.installLocation
    if (typeof location === 'string' && location.trim()) return location
  } catch {
    // Registry missing/unreadable → fall through to the conventional path.
  }
  return undefined
}

/**
 * Entry for `pluginName` from the snapshot of `marketplace`, or `undefined`
 * when the marketplace registry, snapshot file, or entry is absent/invalid.
 */
export async function readMarketplaceSnapshotEntry(
  marketplace: string,
  pluginName: string,
  pluginsDir = claudePluginsDir(),
): Promise<MarketplaceSnapshotEntry | undefined> {
  if (!marketplace.trim() || !pluginName.trim()) return undefined
  const installLocation =
    (await readKnownMarketplaceLocation(marketplace, pluginsDir)) ??
    path.join(pluginsDir, 'marketplaces', marketplace)
  const snapshotPath = path.join(installLocation, '.claude-plugin', 'marketplace.json')

  let raw: string
  try {
    raw = await fs.readFile(snapshotPath, 'utf8')
  } catch (caught) {
    logger.warning('agent_config.snapshot_read_failed', 'Marketplace snapshot unavailable', {
      context: { marketplace, snapshotPath },
      error: caught,
    })
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    logger.warning('agent_config.snapshot_parse_failed', 'Marketplace snapshot is not valid JSON', {
      context: { marketplace, snapshotPath },
    })
    return undefined
  }
  const plugins = (parsed as { plugins?: unknown })?.plugins
  if (!Array.isArray(plugins)) return undefined
  const entry = plugins.find(
    (candidate): candidate is RawSnapshotEntry =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as RawSnapshotEntry).name === pluginName,
  )
  return entry ? toSnapshotEntry(entry) : undefined
}

function toSnapshotEntry(entry: RawSnapshotEntry): MarketplaceSnapshotEntry | undefined {
  const readString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value : undefined
  const author =
    readString(entry.author) ??
    (typeof entry.author === 'object' && entry.author !== null
      ? readString((entry.author as SnapshotAuthor).name)
      : undefined)
  const keywords = Array.isArray(entry.keywords)
    ? entry.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
    : undefined
  const result: MarketplaceSnapshotEntry = {
    name: entry.name as string,
    ...(readString(entry.displayName) ? { displayName: readString(entry.displayName) } : {}),
    ...(readString(entry.description) ? { description: readString(entry.description) } : {}),
    ...(author ? { author } : {}),
    ...(readString(entry.category) ? { category: readString(entry.category) } : {}),
    ...(readString(entry.homepage) ? { homepage: readString(entry.homepage) } : {}),
    ...(readString(entry.version) ? { version: readString(entry.version) } : {}),
    ...(keywords && keywords.length > 0 ? { keywords } : {}),
  }
  return result
}
