import { promises as fs } from 'node:fs'
import path from 'node:path'

import { getLogger } from '../../logging/runtime'
import { claudePluginsDir } from './marketplace-snapshot'

const logger = getLogger('agent-config')

/**
 * The CLI's plugin catalog cache (`~/.claude/plugins/plugin-catalog-cache.json`,
 * derived from a GCS feed for the official marketplace): per-plugin token stats
 * plus `components` lists that let an uninstalled plugin's detail page show real
 * component sections. Local-file only; missing/unreadable/shape-mismatched
 * caches degrade to `undefined` (spec: silent skip). The whole file is parsed
 * once and memoized by mtime — repeated detail opens reuse the memo.
 */

export interface CatalogCacheComponents {
  skills: { name: string; description?: string }[]
  commands: { name: string; description?: string }[]
  agents: { name: string; description?: string }[]
  mcpServers: { name: string; summary?: string }[]
  hooks: { name: string; description?: string }[]
}

interface CacheComponentItem {
  name?: unknown
  description?: unknown
  summary?: unknown
}
interface CachePlugin {
  components?: unknown
  unique_installs?: unknown
  last_updated?: unknown
  sha?: unknown
}

interface CatalogCacheFile {
  catalog?: { plugins?: Record<string, CachePlugin> }
}

export interface CatalogCacheEntry {
  components: CatalogCacheComponents
  installCount?: number
  lastUpdated?: string
  /** Source revision the cache row was built from; matches the download-cache revision directory prefix. */
  revisionSha?: string
}

let memo: { path: string; mtimeMs: number; plugins: Record<string, CachePlugin> } | null = null

export function catalogCachePath(pluginsDir = claudePluginsDir()) {
  return path.join(pluginsDir, 'plugin-catalog-cache.json')
}

async function loadPlugins(pluginsDir: string): Promise<Record<string, CachePlugin> | undefined> {
  const filePath = catalogCachePath(pluginsDir)
  let stat
  try {
    stat = await fs.stat(filePath)
  } catch {
    return undefined
  }
  if (memo && memo.path === filePath && memo.mtimeMs === stat.mtimeMs) return memo.plugins
  let parsed: CatalogCacheFile
  try {
    parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as CatalogCacheFile
  } catch (caught) {
    logger.warning('agent_config.catalog_cache_invalid', 'Plugin catalog cache unreadable', {
      context: { filePath },
      error: caught,
    })
    return undefined
  }
  const plugins = parsed?.catalog?.plugins
  if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) return undefined
  memo = { path: filePath, mtimeMs: stat.mtimeMs, plugins }
  return plugins
}

/**
 * Catalog-cache entry for `<name>@<marketplace>`, or `undefined` when the
 * cache is absent/unreadable or the id is not listed. Component groups with
 * no entries collapse to empty arrays; the caller decides whether that is
 * worth rendering.
 */
export async function readCatalogCacheEntry(
  pluginId: string,
  pluginsDir = claudePluginsDir(),
): Promise<CatalogCacheEntry | undefined> {
  const plugins = await loadPlugins(pluginsDir)
  if (!plugins) return undefined
  const plugin = plugins[pluginId]
  if (!plugin || typeof plugin !== 'object') return undefined

  const components = (plugin.components ?? {}) as Record<string, unknown>
  const readList = (key: string): { name: string; description?: string; summary?: string }[] => {
    const list = components[key]
    if (!Array.isArray(list)) return []
    return list
      .map((item): { name: string; description?: string; summary?: string } | null => {
        // Some lists (hooks) carry plain event-name strings, others objects.
        if (typeof item === 'string') return item.trim() ? { name: item } : null
        if (typeof item !== 'object' || item === null) return null
        const entry = item as CacheComponentItem
        const name = typeof entry.name === 'string' ? entry.name : undefined
        if (!name) return null
        const description =
          typeof entry.description === 'string' && entry.description.trim()
            ? entry.description
            : undefined
        const summary =
          typeof entry.summary === 'string' && entry.summary.trim() ? entry.summary : undefined
        return {
          name,
          ...(description ? { description } : {}),
          ...(summary ? { summary } : {}),
        }
      })
      .filter((item): item is { name: string } => item !== null)
  }

  const built: CatalogCacheComponents = {
    skills: readList('skills'),
    commands: readList('commands'),
    agents: readList('agents'),
    mcpServers: readList('mcpServers'),
    hooks: readList('hooks'),
  }
  const hasAny = Object.values(built).some((list) => list.length > 0)
  if (!hasAny) return undefined

  return {
    components: built,
    ...(typeof plugin.unique_installs === 'number' ? { installCount: plugin.unique_installs } : {}),
    ...(typeof plugin.last_updated === 'string' ? { lastUpdated: plugin.last_updated } : {}),
    ...(typeof plugin.sha === 'string' && plugin.sha.trim() ? { revisionSha: plugin.sha } : {}),
  }
}

// Exported for tests that need to reset the module-level memo between files.
export function resetCatalogCacheMemoForTests() {
  memo = null
}
