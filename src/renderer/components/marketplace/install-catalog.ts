import type { AgentMarketplacePlugin } from '../../services/claude/agent-config'

export type CatalogEntry = AgentMarketplacePlugin

export const catalogSorts = ['downloadsDesc', 'downloadsAsc', 'nameAsc', 'nameDesc'] as const
export type CatalogSort = (typeof catalogSorts)[number]

export function orderCatalog(
  entries: CatalogEntry[],
  sort: CatalogSort = 'downloadsDesc',
): CatalogEntry[] {
  return [...entries].sort((a, b) => {
    if (sort === 'downloadsAsc' || sort === 'downloadsDesc') {
      if (a.installCount == null && b.installCount != null) return 1
      if (b.installCount == null && a.installCount != null) return -1
      const difference = (a.installCount ?? 0) - (b.installCount ?? 0)
      if (difference) return sort === 'downloadsAsc' ? difference : -difference
    }
    const byName = a.name.localeCompare(b.name)
    return (
      (sort === 'nameDesc' ? -byName : byName) ||
      a.marketplaceName.localeCompare(b.marketplaceName) ||
      a.pluginId.localeCompare(b.pluginId)
    )
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
