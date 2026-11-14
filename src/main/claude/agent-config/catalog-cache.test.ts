// @vitest-environment node
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readCatalogCacheEntry, resetCatalogCacheMemoForTests } from './catalog-cache'

const root = await mkdtemp(path.join(tmpdir(), 'clotho-catalog-'))
const pluginsDir = path.join(root, 'plugins')
const cachePath = path.join(pluginsDir, 'plugin-catalog-cache.json')

async function seed(cache: unknown) {
  await mkdir(pluginsDir, { recursive: true })
  await writeFile(cachePath, JSON.stringify(cache))
}

afterEach(async () => {
  resetCatalogCacheMemoForTests()
  await rm(root, { recursive: true, force: true })
})

describe('readCatalogCacheEntry', () => {
  it('maps component lists and install stats for a listed plugin', async () => {
    await seed({
      catalog: {
        plugins: {
          'stripe@claude-plugins-official': {
            components: {
              skills: [{ name: 'stripe-pay', description: 'Payment flows' }, { name: 'docs' }],
              commands: [{ name: 'test-cards' }],
              agents: [{ name: 'researcher', description: 'Company research' }],
              mcpServers: [{ name: 'stripe' }],
              hooks: [{ name: 'SessionStart' }],
              lspServers: [{ name: 'ignored' }],
            },
            unique_installs: 87174,
            last_updated: '2026-10-21T07:42:41.091Z',
          },
        },
      },
    })
    expect(await readCatalogCacheEntry('stripe@claude-plugins-official', pluginsDir)).toEqual({
      components: {
        skills: [{ name: 'stripe-pay', description: 'Payment flows' }, { name: 'docs' }],
        commands: [{ name: 'test-cards' }],
        agents: [{ name: 'researcher', description: 'Company research' }],
        mcpServers: [{ name: 'stripe' }],
        hooks: [{ name: 'SessionStart' }],
      },
      installCount: 87174,
      lastUpdated: '2026-10-21T07:42:41.091Z',
    })
  })

  it('returns undefined for a plugin absent from the cache', async () => {
    await seed({ catalog: { plugins: {} } })
    expect(await readCatalogCacheEntry('x@y', pluginsDir)).toBeUndefined()
  })

  it('returns undefined when every component list is empty', async () => {
    await seed({
      catalog: { plugins: { 'x@y': { components: { skills: [], commands: [] } } } },
    })
    expect(await readCatalogCacheEntry('x@y', pluginsDir)).toBeUndefined()
  })

  it('drops items without names', async () => {
    await seed({
      catalog: {
        plugins: {
          'x@y': { components: { skills: [{ description: 'noname' }, { name: 'ok' }] } },
        },
      },
    })
    const entry = await readCatalogCacheEntry('x@y', pluginsDir)
    expect(entry?.components.skills).toEqual([{ name: 'ok' }])
  })

  it('accepts plain-string hook event names', async () => {
    await seed({
      catalog: {
        plugins: { 'x@y': { components: { hooks: ['SessionStart', '', { name: 'PreToolUse' }] } } },
      },
    })
    const entry = await readCatalogCacheEntry('x@y', pluginsDir)
    expect(entry?.components.hooks).toEqual([{ name: 'SessionStart' }, { name: 'PreToolUse' }])
  })

  it('returns undefined when the cache file is missing', async () => {
    expect(await readCatalogCacheEntry('x@y', pluginsDir)).toBeUndefined()
  })

  it('returns undefined when the cache is invalid JSON', async () => {
    await mkdir(pluginsDir, { recursive: true })
    await writeFile(cachePath, '{nope')
    expect(await readCatalogCacheEntry('x@y', pluginsDir)).toBeUndefined()
  })

  it('returns undefined when the cache shape is unexpected', async () => {
    await seed({ catalog: { plugins: [] } })
    expect(await readCatalogCacheEntry('x@y', pluginsDir)).toBeUndefined()
  })

  it('memoizes by mtime and picks up rewritten content', async () => {
    await seed({ catalog: { plugins: { 'x@y': { components: { skills: [{ name: 'a' }] } } } } })
    expect((await readCatalogCacheEntry('x@y', pluginsDir))?.components.skills).toEqual([
      { name: 'a' },
    ])
    await seed({ catalog: { plugins: { 'x@y': { components: { skills: [{ name: 'b' }] } } } } })
    // Same-size content may keep the mtime; force a change.
    const later = new Date(Date.now() + 5000)
    await utimes(cachePath, later, later)
    expect((await readCatalogCacheEntry('x@y', pluginsDir))?.components.skills).toEqual([
      { name: 'b' },
    ])
  })
})
