// @vitest-environment node
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveClaudeCodeBinary } from '../sdk-binary'
import {
  addMarketplace,
  installPlugin,
  listInstalledPlugins,
  listMarketplacePlugins,
  listMarketplaces,
  refreshMarketplace,
  removeInstalledPlugin,
  removeMarketplace,
  setPluginEnabled,
} from './plugins'

// Capture every CLI spawn at the module boundary.
const execFileMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const child = new EventEmitter()
    execFileMock(...args)
    queueMicrotask(() => child.emit('exit', 0))
    return child
  },
}))

vi.mock('../sdk-binary', () => ({
  resolveClaudeCodeBinary: vi.fn(async () => '/resolved/claude'),
}))

afterEach(() => {
  execFileMock.mockReset()
  vi.mocked(resolveClaudeCodeBinary).mockClear()
  vi.mocked(resolveClaudeCodeBinary).mockResolvedValue('/resolved/claude')
})

describe('CLI invocation', () => {
  it('spawns the resolved binary with the plugin subcommand and JSON flag', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '[]', '')
    })
    await listInstalledPlugins()
    expect(execFileMock).toHaveBeenCalledWith(
      '/resolved/claude',
      ['plugin', 'list', '--json'],
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8' },
      expect.any(Function),
    )
  })

  it('rejects when the verified user installation is unavailable without spawning a fallback', async () => {
    vi.mocked(resolveClaudeCodeBinary).mockRejectedValueOnce(new Error('Claude Code is not ready'))
    await expect(listMarketplaces()).rejects.toThrow('Claude Code is not ready')
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('surfaces stderr as the operation error', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(Object.assign(new Error('boom'), { stderr: 'CLI said no' }))
    })
    await expect(removeMarketplace('gone')).rejects.toThrow(
      'claude plugin marketplace remove gone failed: CLI said no',
    )
  })
})

describe('list operations', () => {
  it('maps installed plugins with name, marketplace, and enabled state', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(
        null,
        JSON.stringify([
          {
            id: 'code-review@claude-plugins-official',
            version: '1.0.0',
            scope: 'user',
            enabled: true,
            installPath: '/x',
            installedAt: 't',
          },
          {
            id: 'caveman@caveman',
            version: '3.2.0',
            scope: 'user',
            enabled: false,
            installPath: '/y',
            notes: ['uses a yarn lockfile'],
          },
        ]),
        '',
      )
    })
    const plugins = await listInstalledPlugins()
    expect(plugins).toEqual([
      {
        id: 'code-review@claude-plugins-official',
        name: 'code-review',
        marketplace: 'claude-plugins-official',
        version: '1.0.0',
        scope: 'user',
        installPath: '/x',
        enabled: true,
        installedAt: 't',
        notes: undefined,
      },
      {
        id: 'caveman@caveman',
        name: 'caveman',
        marketplace: 'caveman',
        version: '3.2.0',
        scope: 'user',
        installPath: '/y',
        enabled: false,
        installedAt: undefined,
        notes: ['uses a yarn lockfile'],
      },
    ])
  })

  it('maps the available catalog entries', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(
        null,
        JSON.stringify({
          installed: [],
          available: [
            {
              pluginId: 'demo@example-mp',
              name: 'demo',
              description: 'Demo plugin',
              marketplaceName: 'example-mp',
              installCount: 42,
            },
          ],
        }),
        '',
      )
    })
    const catalog = await listMarketplacePlugins()
    expect(catalog).toEqual([
      {
        pluginId: 'demo@example-mp',
        name: 'demo',
        description: 'Demo plugin',
        marketplaceName: 'example-mp',
        installCount: 42,
      },
    ])
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(['plugin', 'list', '--available', '--json'])
  })

  it('maps marketplace list entries', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(
        null,
        JSON.stringify([
          {
            name: 'example-mp',
            source: 'github',
            repo: 'example/example-mp',
            installLocation: '/mp/example-mp',
          },
          {
            name: 'local',
            source: 'directory',
            path: '/projects/local',
            installLocation: '/projects/local',
          },
        ]),
        '',
      )
    })
    expect(await listMarketplaces()).toEqual([
      {
        name: 'example-mp',
        source: { source: 'github', repo: 'example/example-mp', url: undefined, path: undefined },
        installLocation: '/mp/example-mp',
      },
      {
        name: 'local',
        source: { source: 'directory', repo: undefined, url: undefined, path: '/projects/local' },
        installLocation: '/projects/local',
      },
    ])
  })

  it('reads each marketplace description independently from its local manifest', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'clotho-marketplaces-'))
    try {
      const manifests = [
        JSON.stringify({
          description: 'Primary',
          metadata: { description: 'Secondary' },
          owner: { name: 'Alice' },
        }),
        JSON.stringify({
          description: ' ',
          metadata: { description: 'Metadata' },
          owner: { name: '  ' },
        }),
        '{invalid',
        JSON.stringify({ description: 17, metadata: { description: '' }, owner: { name: 17 } }),
      ]
      for (const [index, manifest] of manifests.entries()) {
        const dir = path.join(root, String(index), '.claude-plugin')
        await mkdir(dir, { recursive: true })
        await writeFile(path.join(dir, 'marketplace.json'), manifest)
      }
      const entries = Array.from({ length: 5 }, (_, index) => ({
        name: String(index),
        source: 'directory',
        installLocation: path.join(root, String(index)),
      }))
      execFileMock.mockImplementation((_file, _args, _options, callback) => {
        callback(null, JSON.stringify(entries), '')
      })
      const marketplaces = await listMarketplaces()
      expect(
        marketplaces.map(({ name, description, owner }) => ({ name, description, owner })),
      ).toEqual([
        { name: '0', description: 'Primary', owner: 'Alice' },
        { name: '1', description: 'Metadata', owner: undefined },
        { name: '2', description: undefined, owner: undefined },
        { name: '3', description: undefined, owner: undefined },
        { name: '4', description: undefined, owner: undefined },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('mutating operations', () => {
  it('installs by the full plugin id', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '', '')
    })
    await installPlugin('demo@example-mp')
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(['plugin', 'install', 'demo@example-mp'])
  })

  it('rejects an install without a plugin id', async () => {
    await expect(installPlugin('')).rejects.toThrow(/requires a plugin id/)
    await expect(installPlugin('  ')).rejects.toThrow(/requires a plugin id/)
  })

  it('uninstalls by id', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '', '')
    })
    await removeInstalledPlugin('demo@example-mp')
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(['plugin', 'uninstall', 'demo@example-mp'])
  })

  it('persists enable state directly without spawning the CLI or dropping other settings', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'plugin-toggles-'))
    try {
      const settingsPath = path.join(dir, 'settings.json')
      await writeFile(
        settingsPath,
        JSON.stringify({
          env: { EXAMPLE: 'keep' },
          enabledPlugins: { 'other@mp': true },
        }),
      )
      await setPluginEnabled('demo@example-mp', false, dir)
      expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual({
        env: { EXAMPLE: 'keep' },
        enabledPlugins: { 'other@mp': true, 'demo@example-mp': false },
      })
      await setPluginEnabled('demo@example-mp', true, dir)
      expect(
        JSON.parse(await readFile(settingsPath, 'utf8')).enabledPlugins['demo@example-mp'],
      ).toBe(true)
      expect(execFileMock).not.toHaveBeenCalled()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('adds and removes marketplaces by source and name', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '', '')
    })
    await addMarketplace('https://example.com/team-mp.git')
    expect(execFileMock.mock.calls[0]?.[1]).toEqual([
      'plugin',
      'marketplace',
      'add',
      'https://example.com/team-mp.git',
    ])
    await removeMarketplace('team-mp')
    expect(execFileMock.mock.calls[1]?.[1]).toEqual(['plugin', 'marketplace', 'remove', 'team-mp'])
  })

  it('refreshes one marketplace or all', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '', '')
    })
    await refreshMarketplace('team-mp')
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(['plugin', 'marketplace', 'update', 'team-mp'])
    await refreshMarketplace()
    expect(execFileMock.mock.calls[1]?.[1]).toEqual(['plugin', 'marketplace', 'update'])
  })

  it('resolves execFile through the promisified callback shape', async () => {
    // Simulate the promisify contract on a rejected spawn missing stderr.
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      const error = Object.assign(new Error('spawn failed'), { code: 1 })
      queueMicrotask(() => callback(error))
    })
    await expect(installPlugin('demo@example-mp')).rejects.toThrow('spawn failed')
  })
})
