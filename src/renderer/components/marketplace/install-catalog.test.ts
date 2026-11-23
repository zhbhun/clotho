import { describe, expect, it } from 'vitest'

import type { AgentMarketplacePlugin } from '../../services/claude/agent-config'
import { catalogSources, orderCatalog, searchCatalog } from './install-catalog'

const DIR = 'anthropic-plugin-directory'

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

describe('orderCatalog', () => {
  it('sorts by install count descending with unknown counts last', () => {
    const ordered = orderCatalog([
      { pluginId: 'a@d', name: 'a', marketplaceName: 'd' },
      { pluginId: 'b@d', name: 'b', marketplaceName: 'd', installCount: 500 },
      { pluginId: 'c@d', name: 'c', marketplaceName: 'd', installCount: 1200 },
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
      },
      {
        pluginId: 'alpha@d',
        name: 'alpha',
        marketplaceName: 'd',
        installCount: 10,
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
      },
      {
        pluginId: 'a@d',
        name: 'a',
        marketplaceName: 'd',
        installCount: 1,
      },
    ]
    expect(orderCatalog(input).map((e) => e.name)).toEqual(
      orderCatalog(structuredClone(input)).map((e) => e.name),
    )
  })
})

describe('catalogSources', () => {
  it('lists distinct sources in plain alphabetical order', () => {
    const entries = [
      entry('a', DIR),
      entry('b', 'zhbhun'),
      entry('c', 'aaa-market'),
      entry('d', 'claude-plugins-official'),
    ]
    expect(catalogSources(entries)).toEqual([
      'aaa-market',
      DIR,
      'claude-plugins-official',
      'zhbhun',
    ])
  })
})

describe('searchCatalog', () => {
  it('ranks shorter prefixes above more popular longer ones and preserves popularity for ties', () => {
    const entries = orderCatalog([
      entry('superpower-builder', DIR, 9000),
      entry('superpowers', DIR),
      entry('superpowers', 'official', 1000),
      entry('superpower', 'other', 0),
      entry('my-superpower', 'other', 99999),
    ])

    expect(searchCatalog(entries, 'superpower').map((item) => item.pluginId)).toEqual([
      'superpower@other',
      'superpowers@official',
      `superpowers@${DIR}`,
      `superpower-builder@${DIR}`,
      'my-superpower@other',
    ])
  })

  it('ranks name matches before other matches while retaining popularity within each group', () => {
    const entries = orderCatalog([
      { ...entry('unrelated', 'superpowers-market', 9000), description: 'Other' },
      { ...entry('related', 'other', 8000), description: 'Uses superpowers' },
      entry('my-superpowers', 'other', 7000),
      entry('superpowers-extra', 'other', 6000),
      entry('superpowers', DIR),
      entry('superpowers', 'official', 1000),
      entry('not-matched', 'other', 9999),
    ])

    expect(searchCatalog(entries, '  SUPERPOWERS  ').map((item) => item.pluginId)).toEqual([
      'superpowers@official',
      `superpowers@${DIR}`,
      'superpowers-extra@other',
      'my-superpowers@other',
      'unrelated@superpowers-market',
      'related@other',
    ])
    expect(searchCatalog(entries, '  ')).toEqual(entries)
  })
})
