import { describe, expect, it } from 'vitest'

import { PLUGIN_CATEGORIES, catalogSections } from './catalog-sections'
import { type CatalogEntry, orderCatalog, searchCatalog } from './install-catalog'
import pluginCategories from './plugin-categories.json'

const DIRECTORY = 'anthropic-plugin-directory'

function entry(name: string, marketplaceName = DIRECTORY, installCount?: number): CatalogEntry {
  return { pluginId: `${name}@${marketplaceName}`, name, marketplaceName, installCount }
}

describe('catalogSections', () => {
  it('ranks the runtime counts of recommended entries, caps Popular at 100, and omits unknown counts', () => {
    const ids = Object.keys(pluginCategories)
      .filter((id) => id.endsWith(`@${DIRECTORY}`))
      .slice(0, 112)
    const entries = ids.map((id, index) => entry(id.split('@')[0], DIRECTORY, index))
    entries[111].installCount = undefined
    const popular = catalogSections(orderCatalog(entries)).find(
      (section) => section.kind === 'popular',
    )!

    expect(popular.previewLimit).toBe(10)
    expect(popular.entries).toHaveLength(100)
    expect(popular.entries[0].pluginId).toBe(ids[110])
    expect(popular.entries.some((item) => item.pluginId === ids[111])).toBe(false)

    entries[0].installCount = 10000
    const refreshed = catalogSections(orderCatalog(entries)).find(
      (section) => section.kind === 'popular',
    )!
    expect(refreshed.entries[0].pluginId).toBe(ids[0])
  })

  it('only recommends mapped directory plugins but preserves complete custom marketplaces and search', () => {
    const entries = orderCatalog([
      entry('superpowers', DIRECTORY, 100),
      entry('frontend-design', DIRECTORY, 100000),
      entry('context7', DIRECTORY, 90000),
      entry('api-drift-detector-typescript-contract-checker', DIRECTORY, 80000),
      entry('new-unclassified-plugin', DIRECTORY, 70000),
      entry('frontend-design', 'personal', 60000),
      entry('context7', 'personal', 50000),
    ])
    const sections = catalogSections(entries)
    const popular = sections.find((section) => section.kind === 'popular')!
    const category = sections.find((section) => section.id === 'category:developer-tools')!
    const personal = sections.find((section) => section.id === 'marketplace:personal')!

    expect(popular.entries.map((item) => item.name)).toEqual(['superpowers'])
    expect(category.entries.map((item) => item.name)).toEqual(['superpowers'])
    expect(category.previewLimit).toBe(10)
    expect(personal.entries.map((item) => item.name)).toEqual(['frontend-design', 'context7'])
    expect(personal.previewLimit).toBe(10)
    expect(searchCatalog(entries, 'frontend-design')).toHaveLength(2)
    expect(searchCatalog(entries, 'new-unclassified')).toHaveLength(1)
  })

  it('keeps group identities separate from marketplace names and omits empty groups', () => {
    const sections = catalogSections(
      orderCatalog([
        entry('superpowers'),
        entry('only-skill', 'developer-tools'),
        entry('only-mcp', 'popular'),
      ]),
    )
    expect(sections.map((section) => section.id)).toEqual([
      'category:developer-tools',
      'marketplace:developer-tools',
      'marketplace:popular',
    ])
  })

  it('ranks source-verified aliases using their own runtime count without guessing from names', () => {
    const entries = orderCatalog([
      entry('superpowers'),
      entry('superpowers', 'claude-plugins-official', 2000),
      entry('superpowers', 'unverified-same-name', 90000),
      entry('frontend-design', 'claude-plugins-official', 100000),
    ])
    const sections = catalogSections(entries)
    const popular = sections.find((section) => section.kind === 'popular')!
    expect(popular.entries.map((item) => item.pluginId)).toEqual([
      'superpowers@claude-plugins-official',
    ])
    expect(popular.entries[0].installCount).toBe(2000)
    expect(
      entries.find((item) => item.pluginId === `superpowers@${DIRECTORY}`)?.installCount,
    ).toBeUndefined()
    expect(
      sections.find((section) => section.id === 'marketplace:claude-plugins-official')!.entries,
    ).toHaveLength(2)
  })

  it('ships only recognized purpose categories without snapshot display fields', () => {
    expect(
      Object.values(pluginCategories).every((category) =>
        (PLUGIN_CATEGORIES as readonly string[]).includes(category),
      ),
    ).toBe(true)
  })

  it('ranks categories by source-verified runtime counts while preserving their directory identities', () => {
    const entries = orderCatalog([
      entry('superpowers'),
      entry('feature-dev'),
      entry('vercel'),
      entry('superpowers', 'claude-plugins-official', 1000),
      entry('feature-dev', 'claude-plugins-official', 5000),
      entry('vercel', 'unverified-same-name', 90000),
    ])
    const category = catalogSections(entries).find(
      (section) => section.id === 'category:developer-tools',
    )!
    expect(category.entries.map((item) => [item.pluginId, item.installCount])).toEqual([
      [`feature-dev@${DIRECTORY}`, 5000],
      [`superpowers@${DIRECTORY}`, 1000],
      [`vercel@${DIRECTORY}`, undefined],
    ])
    expect(
      entries.find((item) => item.pluginId === `feature-dev@${DIRECTORY}`)?.installCount,
    ).toBeUndefined()
    expect(
      catalogSections(entries).find((section) => section.kind === 'popular')!.entries,
    ).toHaveLength(2)

    const refreshed = entries.map((item) =>
      item.pluginId === 'superpowers@claude-plugins-official'
        ? { ...item, installCount: 10000 }
        : item,
    )
    expect(
      catalogSections(orderCatalog(refreshed)).find((section) => section.id === category.id)!
        .entries[0].pluginId,
    ).toBe(`superpowers@${DIRECTORY}`)
  })

  it('prefers the directory own count, accepts a real zero, and leaves missing or invalid alias counts unknown', () => {
    const entries = orderCatalog([
      entry('superpowers', DIRECTORY, 50),
      entry('superpowers', 'claude-plugins-official', 10000),
      entry('feature-dev'),
      entry('feature-dev', 'claude-plugins-official', 0),
      entry('vercel'),
      entry('vercel', 'claude-plugins-official', -1),
      entry('supabase'),
    ])
    const category = catalogSections(entries).find(
      (section) => section.id === 'category:developer-tools',
    )!
    expect(category.entries.map((item) => [item.name, item.installCount])).toEqual([
      ['superpowers', 50],
      ['feature-dev', 0],
      ['supabase', undefined],
      ['vercel', undefined],
    ])
  })
})
