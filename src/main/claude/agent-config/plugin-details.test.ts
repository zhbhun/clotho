// @vitest-environment node
import { mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentMarketplacePlugin, AgentPluginInfo } from '@/shared/rpc'

// Snapshot/cache read the CLI plugin home at $HOME/.claude/plugins; point
// HOME at per-test roots so each case controls what detail assembly sees.
const snapshotDir = path.join(tmpdir(), 'clotho-details-snapshot')
const cacheDir = path.join(tmpdir(), 'clotho-details-cache')

function useHome(root: string) {
  process.env.HOME = root
}

afterEach(async () => {
  vi.resetModules()
  await rm(snapshotDir, { recursive: true, force: true })
  await rm(cacheDir, { recursive: true, force: true })
})

const installedRecord: AgentPluginInfo = {
  id: 'trading@zhbhun',
  name: 'trading',
  marketplace: 'zhbhun',
  version: '0.2.0',
  scope: 'user',
  installPath: '/nonexistent/installs/trading',
  enabled: true,
}

const catalogEntry: AgentMarketplacePlugin = {
  pluginId: 'stripe@claude-plugins-official',
  name: 'stripe',
  description: 'Stripe development plugin',
  marketplaceName: 'claude-plugins-official',
}

async function seedSnapshot(marketplace: string, plugins: unknown[], installLocation?: string) {
  const location = installLocation ?? path.join(snapshotDir, marketDirectory(marketplace))
  await mkdir(path.join(location, '.claude-plugin'), { recursive: true })
  await writeFile(
    path.join(location, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: marketplace, plugins }),
  )
  if (installLocation) {
    const known = path.join(snapshotDir, '.claude', 'plugins', 'known_marketplaces.json')
    await mkdir(path.dirname(known), { recursive: true })
    await writeFile(known, JSON.stringify({ [marketplace]: { installLocation } }))
  }
}

function marketDirectory(marketplace: string) {
  return path.join('.claude', 'plugins', 'marketplaces', marketplace)
}

async function seedCache(plugins: Record<string, unknown>) {
  const cachePath = path.join(cacheDir, '.claude', 'plugins', 'plugin-catalog-cache.json')
  await mkdir(path.dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify({ catalog: { plugins } }))
}

async function loadFresh() {
  const module = await import('./plugin-details')
  return module.getPluginDetails
}

describe('getPluginDetails local-source enrichment', () => {
  it('fills snapshot listing fields for an uninstalled catalog entry', async () => {
    useHome(snapshotDir)
    await seedSnapshot('zhbhun', [
      {
        name: 'trading',
        author: 'zhb',
        category: 'finance',
        homepage: 'https://t.dev',
        version: '0.2.0',
      },
    ])
    const getPluginDetails = await loadFresh()
    const details = await getPluginDetails(
      'trading@zhbhun',
      [],
      [{ ...catalogEntry, pluginId: 'trading@zhbhun', name: 'trading', marketplaceName: 'zhbhun' }],
    )
    expect(details.author).toBe('zhb')
    expect(details.category).toBe('finance')
    expect(details.homepage).toBe('https://t.dev')
    expect(details.version).toBe('0.2.0')
    expect(details.installed).toBe(false)
    expect(details.skills).toEqual([])
  })

  it('fills catalog-cache component lists for an uninstalled entry', async () => {
    useHome(cacheDir)
    await seedCache({
      'stripe@claude-plugins-official': {
        components: {
          skills: [{ name: 'stripe-pay', description: 'Payment flows' }],
          commands: [{ name: 'test-cards' }],
          agents: [{ name: 'researcher' }],
          mcpServers: [{ name: 'stripe' }],
          hooks: [{ name: 'SessionStart' }],
        },
        unique_installs: 87174,
      },
    })
    const getPluginDetails = await loadFresh()
    const details = await getPluginDetails('stripe@claude-plugins-official', [], [catalogEntry])
    expect(details.skills).toEqual([{ name: 'stripe-pay', description: 'Payment flows' }])
    expect(details.commands).toEqual([{ name: 'test-cards' }])
    expect(details.subagents).toEqual([{ name: 'researcher' }])
    expect(details.mcpServers).toEqual([{ name: 'stripe' }])
    expect(details.hooks).toEqual([{ name: 'SessionStart' }])
    expect(details.installCount).toBe(87174)
  })

  it('installed manifests win over cache components', async () => {
    useHome(cacheDir)
    // Install path with its own skill list.
    const installPath = path.join(cacheDir, 'installs', 'stripe')
    await mkdir(path.join(installPath, 'skills', 'local-skill'), { recursive: true })
    await writeFile(
      path.join(installPath, 'skills', 'local-skill', 'SKILL.md'),
      '---\nname: local-skill\ndescription: Installed skill\n---\n\nbody',
    )
    await seedCache({
      'stripe@claude-plugins-official': {
        components: { skills: [{ name: 'cache-skill' }] },
      },
    })
    const record = { ...installedRecord, id: 'stripe@claude-plugins-official', installPath }
    const getPluginDetails = await loadFresh()
    const details = await getPluginDetails(record.id, [record], [catalogEntry])
    expect(details.skills).toEqual([{ name: 'local-skill', description: 'Installed skill' }])
    expect(details.installed).toBe(true)
    expect(details.version).toBe(record.version)
  })

  it('fills component descriptions from the download cache for uninstalled entries', async () => {
    useHome(cacheDir)
    // The CLI kept fetched sources for a since-uninstalled plugin.
    const sourcePath = path.join(
      cacheDir,
      '.claude',
      'plugins',
      'cache',
      'claude-plugins-official',
      'superpowers',
      'bb92a7774141',
    )
    await mkdir(path.join(sourcePath, 'skills', 'brainstorming'), { recursive: true })
    await writeFile(
      path.join(sourcePath, 'skills', 'brainstorming', 'SKILL.md'),
      '---\nname: brainstorming\ndescription: Creative work primer\n---\n\nbody',
    )
    await seedCache({
      'superpowers@claude-plugins-official': {
        components: { skills: [{ name: 'brainstorming' }] },
      },
    })
    const entry = {
      ...catalogEntry,
      pluginId: 'superpowers@claude-plugins-official',
      name: 'superpowers',
      marketplaceName: 'claude-plugins-official',
    }
    const getPluginDetails = await loadFresh()
    const details = await getPluginDetails(entry.pluginId, [], [entry])
    expect(details.skills).toEqual([{ name: 'brainstorming', description: 'Creative work primer' }])
    expect(details.installed).toBe(false)
  })

  it('prefers the catalog-cache sha revision over a newer download-cache entry', async () => {
    useHome(cacheDir)
    const pluginCache = path.join(
      cacheDir,
      '.claude',
      'plugins',
      'cache',
      'claude-plugins-official',
      'superpowers',
    )
    // Old revision matches the cache sha; a newer-stamped one does not.
    const seeded = [
      ['bb92a7774141', 'Pinned skill', 1000],
      ['deadbeefcafe', 'Stray skill', 2000],
    ] as const
    for (const [revision, description, mtime] of seeded) {
      const skillDir = path.join(pluginCache, revision, 'skills', 'pinned-skill')
      await mkdir(skillDir, { recursive: true })
      await writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: pinned-skill\ndescription: ${description}\n---\n\nbody`,
      )
      const at = new Date(mtime)
      await utimes(path.join(skillDir, 'SKILL.md'), at, at)
    }
    await seedCache({
      'superpowers@claude-plugins-official': {
        components: { skills: [{ name: 'pinned-skill' }] },
        sha: 'bb92a77741419a4ab5f06e711a283343f1ada0c3',
      },
    })
    const entry = {
      ...catalogEntry,
      pluginId: 'superpowers@claude-plugins-official',
      name: 'superpowers',
      marketplaceName: 'claude-plugins-official',
    }
    const getPluginDetails = await loadFresh()
    const details = await getPluginDetails(entry.pluginId, [], [entry])
    expect(details.skills).toEqual([{ name: 'pinned-skill', description: 'Pinned skill' }])
  })

  it('missing snapshot and cache still produce catalog-only detail', async () => {
    useHome(path.join(snapshotDir, 'empty'))
    const getPluginDetails = await loadFresh()
    const details = await getPluginDetails('stripe@claude-plugins-official', [], [catalogEntry])
    expect(details.installed).toBe(false)
    expect(details.description).toBe('Stripe development plugin')
    expect(details.author).toBeUndefined()
    expect(details.skills).toEqual([])
  })

  it('throws when the plugin is neither installed nor catalogued', async () => {
    useHome(cacheDir)
    const getPluginDetails = await loadFresh()
    await expect(getPluginDetails('ghost@nowhere', [], [])).rejects.toThrow(
      'Plugin not found: ghost@nowhere',
    )
  })
})
