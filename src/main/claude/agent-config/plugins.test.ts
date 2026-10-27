// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  addMarketplace,
  installPlugin,
  installedPluginsPath,
  knownMarketplacesPath,
  listInstalledPlugins,
  listMarketplaces,
  pluginsDir,
  removeInstalledPlugin,
  removeMarketplace,
} from './plugins'

// Stub `git clone` at the module boundary: the callback form of execFile.
vi.mock('node:child_process', () => ({
  execFile: (_file: string, args: string[], callback: (error: Error | null) => void) => {
    queueMicrotask(async () => {
      await mkdir(args[3], { recursive: true })
      callback(null)
    })
  },
}))

let tempDir: string

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

async function makePluginHome() {
  tempDir = await mkdtemp(path.join(tmpdir(), 'plugins-'))
  return tempDir
}

async function seedMarketplace(claudeDir: string) {
  const checkout = path.join(pluginsDir(claudeDir), 'marketplaces', 'example-mp')
  await mkdir(path.join(checkout, 'my-plugin'), { recursive: true })
  await writeFile(path.join(checkout, 'my-plugin', 'SKILL.md'), 'test', 'utf8')
  await mkdir(path.join(checkout, '.claude-plugin'), { recursive: true })
  await writeFile(
    path.join(checkout, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ plugins: [{ name: 'my-plugin', description: 'Demo' }] }),
    'utf8',
  )
  await writeFile(
    knownMarketplacesPath(claudeDir),
    JSON.stringify({
      'example-mp': {
        source: { source: 'git', url: 'https://example.com/example-mp.git' },
        installLocation: checkout,
      },
    }),
    'utf8',
  )
  return checkout
}

describe('listInstalledPlugins', () => {
  it('lists v2 entries with name and marketplace split from the id', async () => {
    const claudeDir = await makePluginHome()
    await mkdir(path.join(pluginsDir(claudeDir)), { recursive: true })
    await writeFile(
      installedPluginsPath(claudeDir),
      JSON.stringify({
        version: 2,
        plugins: {
          'code-review@claude-plugins-official': [
            { scope: 'user', installPath: '/x', version: '1.0.0', installedAt: 't' },
          ],
        },
      }),
      'utf8',
    )
    const plugins = await listInstalledPlugins(claudeDir)
    expect(plugins).toEqual([
      {
        id: 'code-review@claude-plugins-official',
        name: 'code-review',
        marketplace: 'claude-plugins-official',
        version: '1.0.0',
        installPath: '/x',
        installedAt: 't',
      },
    ])
  })

  it('returns empty when the file is missing', async () => {
    const claudeDir = await makePluginHome()
    await expect(listInstalledPlugins(claudeDir)).resolves.toEqual([])
  })
})

describe('listMarketplaces', () => {
  it('reads known marketplaces and their plugin manifests', async () => {
    const claudeDir = await makePluginHome()
    await seedMarketplace(claudeDir)
    const marketplaces = await listMarketplaces(claudeDir)
    expect(marketplaces).toHaveLength(1)
    expect(marketplaces[0].name).toBe('example-mp')
    expect(marketplaces[0].plugins).toEqual([{ name: 'my-plugin', description: 'Demo' }])
  })
})

describe('installPlugin', () => {
  it('copies from the checkout into cache and records a v2 entry', async () => {
    const claudeDir = await makePluginHome()
    await seedMarketplace(claudeDir)
    await installPlugin('example-mp', 'my-plugin', claudeDir)
    const saved = JSON.parse(await readFile(installedPluginsPath(claudeDir), 'utf8'))
    expect(saved.version).toBe(2)
    const entry = saved.plugins['my-plugin@example-mp'][0]
    expect(entry.scope).toBe('user')
    expect(entry.installPath).toContain(path.join('cache', 'example-mp', 'my-plugin'))
  })

  it('throws for a plugin the marketplace does not have', async () => {
    const claudeDir = await makePluginHome()
    await seedMarketplace(claudeDir)
    await expect(installPlugin('example-mp', 'nope', claudeDir)).rejects.toThrow(
      /not in marketplace/,
    )
  })
})

describe('removeInstalledPlugin', () => {
  it('deletes the install path and the record', async () => {
    const claudeDir = await makePluginHome()
    const installPath = path.join(tempDir, 'cache', 'p')
    await mkdir(path.join(pluginsDir(claudeDir)), { recursive: true })
    await writeFile(
      installedPluginsPath(claudeDir),
      JSON.stringify({
        version: 2,
        plugins: { 'p@mp': [{ scope: 'user', installPath, version: '1', installedAt: 't' }] },
      }),
      'utf8',
    )
    await removeInstalledPlugin('p@mp', claudeDir)
    const saved = JSON.parse(await readFile(installedPluginsPath(claudeDir), 'utf8'))
    expect(saved.plugins['p@mp']).toBeUndefined()
  })
})

describe('addMarketplace / removeMarketplace', () => {
  it('clones via git and records the marketplace, then removes both', async () => {
    const claudeDir = await makePluginHome()
    const name = await addMarketplace('https://example.com/team-mp.git', claudeDir)
    expect(name).toBe('team-mp')
    // The stubbed clone produced the checkout directory.
    const saved = JSON.parse(await readFile(knownMarketplacesPath(claudeDir), 'utf8'))
    expect(saved['team-mp'].source.url).toBe('https://example.com/team-mp.git')
    expect(saved['team-mp'].installLocation).toContain(path.join('marketplaces', 'team-mp'))

    await removeMarketplace('team-mp', claudeDir)
    const after = JSON.parse(await readFile(knownMarketplacesPath(claudeDir), 'utf8'))
    expect(after['team-mp']).toBeUndefined()
  })

  it('rejects non-git input', async () => {
    const claudeDir = await makePluginHome()
    await expect(addMarketplace('not a url', claudeDir)).rejects.toThrow(/Not a git URL/)
  })

  it('rejects a git url with no usable name segment', async () => {
    const claudeDir = await makePluginHome()
    await expect(addMarketplace('https://example.com/', claudeDir)).rejects.toThrow(
      /marketplace name/,
    )
  })
})
