// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readMarketplaceSnapshotEntry } from './marketplace-snapshot'

const root = await mkdtemp(path.join(tmpdir(), 'clotho-snapshot-'))
const pluginsDir = path.join(root, 'plugins')

async function seed(options: {
  known?: Record<string, { installLocation: string }>
  snapshots: Record<string, unknown>
}) {
  await mkdir(path.join(pluginsDir, 'marketplaces'), { recursive: true })
  if (options.known) {
    await writeFile(path.join(pluginsDir, 'known_marketplaces.json'), JSON.stringify(options.known))
  }
  for (const [name, manifest] of Object.entries(options.snapshots)) {
    const dir = path.join(pluginsDir, 'marketplaces', name, '.claude-plugin')
    await mkdir(dir, { recursive: true })
    if (manifest !== null) {
      await writeFile(path.join(dir, 'marketplace.json'), JSON.stringify(manifest))
    }
  }
}

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('readMarketplaceSnapshotEntry', () => {
  it('reads listing fields for a plugin from the conventional snapshot path', async () => {
    await seed({
      snapshots: {
        official: {
          plugins: [
            {
              name: 'code-review',
              displayName: 'Code Review',
              author: { name: 'Anthropic' },
              category: 'productivity',
              homepage: 'https://example.com/review',
              version: '1.0.0',
              keywords: ['review', 'quality'],
            },
            { name: 'other' },
          ],
        },
      },
    })
    expect(await readMarketplaceSnapshotEntry('official', 'code-review', pluginsDir)).toMatchObject(
      {
        name: 'code-review',
        displayName: 'Code Review',
        author: 'Anthropic',
        category: 'productivity',
        homepage: 'https://example.com/review',
        version: '1.0.0',
        keywords: ['review', 'quality'],
      },
    )
  })

  it('resolves the snapshot through known_marketplaces installLocation', async () => {
    const custom = path.join(root, 'elsewhere', 'my-market')
    await mkdir(path.join(custom, '.claude-plugin'), { recursive: true })
    await writeFile(
      path.join(custom, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ plugins: [{ name: 'trading', author: 'zhb', version: '0.2.0' }] }),
    )
    await seed({
      known: { zhbhun: { installLocation: custom } },
      snapshots: {},
    })
    expect(await readMarketplaceSnapshotEntry('zhbhun', 'trading', pluginsDir)).toMatchObject({
      author: 'zhb',
      version: '0.2.0',
    })
  })

  it('accepts string authors and omits empty fields', async () => {
    await seed({
      snapshots: { m: { plugins: [{ name: 'p', author: 'Jane', category: '' }] } },
    })
    expect(await readMarketplaceSnapshotEntry('m', 'p', pluginsDir)).toEqual({
      name: 'p',
      author: 'Jane',
    })
  })

  it('returns undefined for an unknown plugin', async () => {
    await seed({ snapshots: { m: { plugins: [{ name: 'p' }] } } })
    expect(await readMarketplaceSnapshotEntry('m', 'absent', pluginsDir)).toBeUndefined()
  })

  it('returns undefined when the marketplace has no snapshot', async () => {
    await seed({ snapshots: {} })
    expect(await readMarketplaceSnapshotEntry('ghost', 'p', pluginsDir)).toBeUndefined()
  })

  it('returns undefined when the snapshot is invalid JSON', async () => {
    const dir = path.join(pluginsDir, 'marketplaces', 'broken', '.claude-plugin')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'marketplace.json'), '{oops')
    expect(await readMarketplaceSnapshotEntry('broken', 'p', pluginsDir)).toBeUndefined()
  })

  it('returns undefined when the snapshot has no plugins array', async () => {
    await seed({ snapshots: { flat: { name: 'flat-market' } } })
    expect(await readMarketplaceSnapshotEntry('flat', 'p', pluginsDir)).toBeUndefined()
  })

  it('rejects empty marketplace or plugin names', async () => {
    expect(await readMarketplaceSnapshotEntry('', 'p', pluginsDir)).toBeUndefined()
    expect(await readMarketplaceSnapshotEntry('m', '  ', pluginsDir)).toBeUndefined()
  })
})
