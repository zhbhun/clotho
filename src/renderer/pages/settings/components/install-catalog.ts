import type { AgentMarketplacePlugin } from '../../../services/claude/agent-config'

export type CatalogEntry = AgentMarketplacePlugin

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

/** Filter a preordered catalog, ranking shorter prefix matches ahead of longer ones. */
export function searchCatalog(entries: CatalogEntry[], search: string): CatalogEntry[] {
  const query = search.trim().toLowerCase()
  if (!query) return entries

  const exact: CatalogEntry[] = []
  const prefix: CatalogEntry[] = []
  const substring: CatalogEntry[] = []
  const other: CatalogEntry[] = []
  for (const entry of entries) {
    const name = entry.name.toLowerCase()
    if (name === query) exact.push(entry)
    else if (name.startsWith(query)) prefix.push(entry)
    else if (name.includes(query)) substring.push(entry)
    else if (
      (entry.description ?? '').toLowerCase().includes(query) ||
      entry.marketplaceName.toLowerCase().includes(query)
    ) {
      other.push(entry)
    }
  }
  prefix.sort((a, b) => a.name.length - b.name.length)
  return [...exact, ...prefix, ...substring, ...other]
}

/**
 * Distinct sources in the full catalog for the filter dropdown,
 * plain alphabetical — the built-in directory sorts in like any marketplace.
 */
export function catalogSources(
  entries: Pick<AgentMarketplacePlugin, 'marketplaceName'>[],
): string[] {
  return [...new Set(entries.map((e) => e.marketplaceName))].sort((a, b) => (a < b ? -1 : 1))
}
