import { type CatalogEntry, orderCatalog } from './install-catalog'
import pluginAliases from './plugin-aliases.json'
import pluginCategories from './plugin-categories.json'

const DIRECTORY = 'anthropic-plugin-directory'
const categoriesById: Readonly<Record<string, string>> = pluginCategories
const aliasesById: Readonly<Record<string, string>> = pluginAliases

function hasInstallCount(
  entry: CatalogEntry | undefined,
): entry is CatalogEntry & { installCount: number } {
  return (
    typeof entry?.installCount === 'number' &&
    Number.isFinite(entry.installCount) &&
    entry.installCount >= 0
  )
}

export const PLUGIN_CATEGORIES = [
  'app-plugins',
  'developer-tools',
  'utilities',
  'productivity',
  'creativity',
  'data-analytics',
  'security',
  'finance',
  'business',
  'education',
  'research',
  'healthcare',
  'travel',
] as const

type PluginCategory = (typeof PLUGIN_CATEGORIES)[number]

export type CatalogSection = {
  entries: CatalogEntry[]
  previewLimit: number
} & (
  | { kind: 'popular'; id: 'popular' }
  | { kind: 'category'; id: string; category: PluginCategory }
  | { kind: 'marketplace'; id: string; marketplaceName: string }
)

/**
 * Group an ordered catalog. Mapped identities (including source-verified
 * marketplace aliases) can rank in Popular; other marketplaces still keep
 * their complete contents. Counts always come from this runtime catalog.
 */
export function catalogSections(entries: CatalogEntry[]): CatalogSection[] {
  const entriesById = new Map(entries.map((entry) => [entry.pluginId, entry]))
  const recommended: CatalogEntry[] = []
  const categories = new Map<string, CatalogEntry[]>()
  const marketplaces = new Map<string, CatalogEntry[]>()
  for (const entry of entries) {
    const category = categoriesById[entry.pluginId]
    if (category) recommended.push(entry)
    if (entry.marketplaceName !== DIRECTORY) {
      const group = marketplaces.get(entry.marketplaceName) ?? []
      group.push(entry)
      marketplaces.set(entry.marketplaceName, group)
      continue
    }
    if (!category) continue
    const group = categories.get(category) ?? []
    const alias = entriesById.get(aliasesById[entry.pluginId])
    // Borrow a count only from a source-verified identity in this runtime
    // response. Keep the directory id and installation target unchanged.
    group.push(
      !hasInstallCount(entry) && hasInstallCount(alias)
        ? { ...entry, installCount: alias.installCount }
        : entry,
    )
    categories.set(category, group)
  }

  const sections: CatalogSection[] = []
  const popular = recommended.filter(hasInstallCount).slice(0, 100)
  if (popular.length) {
    sections.push({ kind: 'popular', id: 'popular', entries: popular, previewLimit: 10 })
  }
  for (const category of PLUGIN_CATEGORIES) {
    const group = categories.get(category)
    if (group?.length) {
      sections.push({
        kind: 'category',
        id: `category:${category}`,
        category,
        entries: orderCatalog(group),
        previewLimit: 10,
      })
    }
  }
  for (const marketplaceName of [...marketplaces.keys()].sort()) {
    sections.push({
      kind: 'marketplace',
      id: `marketplace:${marketplaceName}`,
      marketplaceName,
      entries: marketplaces.get(marketplaceName)!,
      previewLimit: 10,
    })
  }
  return sections
}
