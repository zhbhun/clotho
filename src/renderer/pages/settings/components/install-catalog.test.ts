import { describe, expect, it } from 'vitest'

import type { AgentMarketplacePlugin } from '../../../services/claude/agent-config'
import { catalogSources, dedupeCatalog, installedName, orderCatalog } from './install-catalog'

const DIR = 'anthropic-plugin-directory'

const EMPTY_INSTALLED = { names: new Set<string>(), ids: new Set<string>() }

function entry(
  name: string,
  marketplaceName: string,
  installCount?: number,
): AgentMarketplacePlugin {
  return {
    pluginId: `${name}@${marketplaceName}`,
    name,
    marketplaceName,
    installCount,
    description: `${name} description`,
  }
}

describe('dedupeCatalog', () => {
  it('collapses same-name entries from multiple sources into one', () => {
    const entries = dedupeCatalog(
      [entry('superpowers', DIR), entry('superpowers', 'superpowers-marketplace')],
      { names: new Set(['superpowers']), ids: new Set(['superpowers@superpowers-marketplace']) },
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].marketplaceName).toBe('superpowers-marketplace')
  })

  it('prefers the installed entry over uninstalled ones', () => {
    const entries = dedupeCatalog([entry('x', DIR, 9999), entry('x', 'zhbhun')], {
      names: new Set(['x']),
      ids: new Set(['x@zhbhun']),
    })
    expect(entries[0].marketplaceName).toBe('zhbhun')
  })

  it('prefers the installed directory entry over an uninstalled marketplace one', () => {
    const entries = dedupeCatalog([entry('x', DIR), entry('x', 'zhbhun', 9999)], {
      names: new Set(['x']),
      ids: new Set(['x@anthropic-plugin-directory']),
    })
    expect(entries[0].marketplaceName).toBe(DIR)
  })

  it('prefers a registered marketplace over the directory when neither is installed', () => {
    const entries = dedupeCatalog(
      [entry('frontend-design', DIR), entry('frontend-design', 'claude-plugins-official')],
      EMPTY_INSTALLED,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].marketplaceName).toBe('claude-plugins-official')
  })

  it('breaks ties deterministically by marketplace name', () => {
    const entries = dedupeCatalog(
      [entry('dup', 'zzz-market'), entry('dup', 'aaa-market')],
      EMPTY_INSTALLED,
    )
    expect(entries[0].marketplaceName).toBe('aaa-market')
  })

  it('marks directory entries with the directory source', () => {
    const entries = dedupeCatalog([entry('solo', DIR)], EMPTY_INSTALLED)
    expect(entries[0].source).toBe('directory')
  })
})

describe('orderCatalog', () => {
  it('sorts by install count descending with unknown counts last', () => {
    const ordered = orderCatalog([
      { pluginId: 'a@d', name: 'a', marketplaceName: 'd', source: 'directory' },
      { pluginId: 'b@d', name: 'b', marketplaceName: 'd', installCount: 500, source: 'directory' },
      { pluginId: 'c@d', name: 'c', marketplaceName: 'd', installCount: 1200, source: 'directory' },
    ])
    expect(ordered.map((e) => e.name)).toEqual(['c', 'b', 'a'])
  })

  it('sorts equal counts alphabetically by name', () => {
    const ordered = orderCatalog([
      {
        pluginId: 'beta@d',
        name: 'beta',
        marketplaceName: 'd',
        installCount: 10,
        source: 'directory',
      },
      {
        pluginId: 'alpha@d',
        name: 'alpha',
        marketplaceName: 'd',
        installCount: 10,
        source: 'directory',
      },
    ])
    expect(ordered.map((e) => e.name)).toEqual(['alpha', 'beta'])
  })

  it('is stable across repeated calls', () => {
    const input = [
      {
        pluginId: 'b@d',
        name: 'b',
        marketplaceName: 'd',
        installCount: 1,
        source: 'directory' as const,
      },
      {
        pluginId: 'a@d',
        name: 'a',
        marketplaceName: 'd',
        installCount: 1,
        source: 'directory' as const,
      },
    ]
    expect(orderCatalog(input).map((e) => e.name)).toEqual(
      orderCatalog(structuredClone(input)).map((e) => e.name),
    )
  })
})

describe('catalogSources', () => {
  it('lists registered marketplaces sorted with directory last', () => {
    const entries = dedupeCatalog(
      [
        entry('a', DIR),
        entry('b', 'zhbhun'),
        entry('c', 'aaa-market'),
        entry('d', 'claude-plugins-official'),
      ],
      EMPTY_INSTALLED,
    )
    expect(catalogSources(entries)).toEqual([
      'aaa-market',
      'claude-plugins-official',
      'zhbhun',
      DIR,
    ])
  })
})

describe('installedName', () => {
  it('splits name from marketplace at the last @', () => {
    expect(installedName('superpowers@superpowers-marketplace')).toBe('superpowers')
    expect(installedName('weird@name@market')).toBe('weird@name')
    expect(installedName('bare')).toBe('bare')
  })
})
