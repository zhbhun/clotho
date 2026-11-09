import type { AgentMarketplacePlugin } from '../../../services/claude/agent-config'

/**
 * Catalog pipeline for the unified Marketplace list.
 *
 * The CLI's `marketplace list --json` omits its built-in directory marketplace,
 * while every `plugin list --available --json` entry carries
 * `marketplaceName: "anthropic-plugin-directory"`. There is no structural
 * signal for it, so entries are recognized by this name.
 */
export const DIRECTORY_MARKETPLACE = 'anthropic-plugin-directory'

/** Where a catalog entry comes from. */
export type CatalogSource = 'directory' | 'marketplace'

/** A deduplicated catalog entry ready for rendering. */
export interface CatalogEntry {
  pluginId: string
  name: string
  description?: string
  marketplaceName: string
  installCount?: number
  source: CatalogSource
}

/** Names of installed plugins, extracted from `<name>@<marketplace>` ids. */
export type InstalledNames = Set<string>

export function isDirectoryMarketplace(name: string): boolean {
  return name === DIRECTORY_MARKETPLACE
}

/**
 * Names of installed plugins, extracted from `<name>@<marketplace>` ids, plus
 * the verbatim installed plugin ids. Names drive installed-badge matching (the
 * spec matches installs by plugin name); ids pick the dedup winner, so menu
 * actions always target the id the CLI actually installed.
 */
export interface InstalledState {
  names: Set<string>
  /** Verbatim `<name>@<marketplace>` install records. */
  ids: Set<string>
}

/**
 * Deduplicate catalog entries by plugin name (the part before `@`).
 * Precedence: the exact installed record > same-name installed entries >
 * user-registered marketplace > built-in directory; ties break by marketplace
 * name then plugin id, so the winner is stable.
 */
export function dedupeCatalog(
  catalog: AgentMarketplacePlugin[],
  installed: InstalledState,
): CatalogEntry[] {
  const byName = new Map<string, CatalogEntry>()
  for (const entry of catalog) {
    const candidate: CatalogEntry = {
      pluginId: entry.pluginId,
      name: entry.name,
      description: entry.description,
      marketplaceName: entry.marketplaceName,
      installCount: entry.installCount,
      source: isDirectoryMarketplace(entry.marketplaceName) ? 'directory' : 'marketplace',
    }
    const current = byName.get(entry.name)
    if (!current || betterOf(candidate, current, installed).pluginId === candidate.pluginId) {
      byName.set(entry.name, candidate)
    }
  }
  return [...byName.values()]
}

function rank(entry: CatalogEntry, installed: InstalledState): number {
  // An exact install-record match wins over everything, so the shown entry's
  // pluginId is the id the CLI installed. Same-name installs from another
  // source (the badge still lights) rank above uninstalled entries.
  if (installed.ids.has(entry.pluginId)) return entry.source === 'marketplace' ? 4 : 3
  if (installed.names.has(entry.name)) return entry.source === 'marketplace' ? 2 : 1
  return entry.source === 'marketplace' ? 1 : 0
}

function betterOf(a: CatalogEntry, b: CatalogEntry, installed: InstalledState): CatalogEntry {
  const ra = rank(a, installed)
  const rb = rank(b, installed)
  if (ra !== rb) return ra > rb ? a : b
  if (a.marketplaceName !== b.marketplaceName) {
    return a.marketplaceName <= b.marketplaceName ? a : b
  }
  return a.pluginId <= b.pluginId ? a : b
}

/**
 * Order catalog entries deterministically: install count descending (entries
 * without a known count last), then alphabetical by name, tiebreak by
 * marketplace then plugin id so React keys and row order stay stable.
 */
export function orderCatalog(entries: CatalogEntry[]): CatalogEntry[] {
  return [...entries].sort((a, b) => {
    const ca = a.installCount ?? -1
    const cb = b.installCount ?? -1
    if (ca !== cb) return cb - ca
    if (a.name !== b.name) return a.name < b.name ? -1 : 1
    if (a.marketplaceName !== b.marketplaceName) {
      return a.marketplaceName < b.marketplaceName ? -1 : 1
    }
    return a.pluginId < b.pluginId ? -1 : 1
  })
}

/**
 * Distinct sources in the deduplicated catalog for the filter dropdown,
 * plain alphabetical — the built-in directory sorts in like any marketplace.
 */
export function catalogSources(entries: CatalogEntry[]): string[] {
  return [...new Set(entries.map((e) => e.marketplaceName))].sort((a, b) => (a < b ? -1 : 1))
}

/** Extract the plugin name from an installed `name@marketplace` id. */
export function installedName(id: string): string {
  const at = id.lastIndexOf('@')
  return at > 0 ? id.slice(0, at) : id
}
