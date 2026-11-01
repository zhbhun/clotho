// @vitest-environment node
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
  execFile: execFileMock,
}))

vi.mock('../sdk-binary', () => ({
  resolveClaudeCodeBinary: vi.fn(() => '/resolved/claude'),
}))

afterEach(() => {
  execFileMock.mockReset()
  vi.mocked(resolveClaudeCodeBinary).mockClear()
  vi.mocked(resolveClaudeCodeBinary).mockReturnValue('/resolved/claude')
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

  it('falls back to `claude` on PATH when the packaged binary is absent', async () => {
    vi.mocked(resolveClaudeCodeBinary).mockReturnValue(undefined)
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '[]', '')
    })
    await listMarketplaces()
    expect(execFileMock.mock.calls[0]?.[0]).toBe('claude')
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
        ]),
        '',
      )
    })
    expect(await listMarketplaces()).toEqual([
      {
        name: 'example-mp',
        source: { source: 'github', repo: 'example/example-mp', url: undefined },
        installLocation: '/mp/example-mp',
      },
    ])
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

  it('enables and disables through the CLI state', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '', '')
    })
    await setPluginEnabled('demo@example-mp', true)
    expect(execFileMock.mock.calls[0]?.[1]).toEqual(['plugin', 'enable', 'demo@example-mp'])
    await setPluginEnabled('demo@example-mp', false)
    expect(execFileMock.mock.calls[1]?.[1]).toEqual(['plugin', 'disable', 'demo@example-mp'])
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
