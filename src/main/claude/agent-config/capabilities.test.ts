// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getCapabilityToggles, getMcpServerStates, setCapabilityToggle } from './capabilities'
import { saveMcpServer } from './mcp-servers'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'capabilities-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})
const readSettings = async () => JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'))

describe('native capability toggles', () => {
  it('matches URL wildcards and exact commands without treating URL punctuation as regex', async () => {
    await writeFile(
      path.join(dir, 'settings.json'),
      JSON.stringify({
        deniedMcpServers: [
          { serverUrl: 'https://*.example.com/mcp?key=*' },
          { serverCommand: ['node', 'server.js', '--stdio'] },
          { serverName: 'named' },
        ],
      }),
    )
    const states = await getMcpServerStates(
      [
        { name: 'remote', type: 'http', url: 'https://api.example.com/mcp?key=abc' },
        { name: 'other-url', type: 'sse', url: 'https://api.example.com/mcpXkey=abc' },
        { name: 'local', type: 'stdio', command: 'node', args: ['server.js', '--stdio'] },
        { name: 'other-args', type: 'stdio', command: 'node', args: ['server.js'] },
        { name: 'named', type: 'http', url: 'https://other.test' },
      ],
      dir,
    )
    expect(states.map(({ name, disabled, blockedBy }) => ({ name, disabled, blockedBy }))).toEqual([
      { name: 'remote', disabled: true, blockedBy: 'url' },
      { name: 'other-url', disabled: false, blockedBy: undefined },
      { name: 'local', disabled: true, blockedBy: 'command' },
      { name: 'other-args', disabled: false, blockedBy: undefined },
      { name: 'named', disabled: true, blockedBy: undefined },
    ])
  })

  it('refuses to enable a server still blocked by a broader rule without altering that rule', async () => {
    await saveMcpServer('docs', { type: 'http', url: 'https://mcp.example/docs' }, dir)
    const settings = {
      deniedMcpServers: [{ serverUrl: 'https://mcp.example/*' }, { serverName: 'docs' }],
    }
    await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings))
    await expect(setCapabilityToggle('mcp', 'docs', true, dir)).rejects.toThrow(/deny rule/)
    expect(await readSettings()).toEqual(settings)
  })

  it('reads user settings fresh, including changes written outside Clotho', async () => {
    expect(await getCapabilityToggles(dir)).toEqual({ disabledSkills: [], disabledMcpServers: [] })
    await writeFile(
      path.join(dir, 'settings.json'),
      JSON.stringify({
        skillOverrides: { deploy: 'off', review: 'on', pdf: 'user-invocable-only' },
        deniedMcpServers: [{ serverName: 'docs' }, { serverUrl: 'https://example.com/*' }],
      }),
    )
    expect(await getCapabilityToggles(dir)).toEqual({
      disabledSkills: ['deploy'],
      disabledMcpServers: ['docs'],
    })
  })

  it('creates native settings for a disabled skill and re-enables it', async () => {
    await setCapabilityToggle('skill', 'deploy', false, dir)
    expect(await readSettings()).toEqual({ skillOverrides: { deploy: 'off' } })
    expect(await setCapabilityToggle('skill', 'deploy', true, dir)).toEqual({
      disabledSkills: [],
      disabledMcpServers: [],
    })
    expect(await readSettings()).toEqual({ skillOverrides: { deploy: 'on' } })
  })

  it('preserves other overrides, credentials and plugin settings when updating a skill', async () => {
    const other = { env: { EXAMPLE: 'keep' }, enabledPlugins: { 'test@mp': false } }
    await writeFile(
      path.join(dir, 'settings.json'),
      JSON.stringify({ ...other, skillOverrides: { pdf: 'name-only' } }),
    )
    await setCapabilityToggle('skill', 'deploy', false, dir)
    expect(await readSettings()).toEqual({
      ...other,
      skillOverrides: { pdf: 'name-only', deploy: 'off' },
    })
  })

  it('updates only the named MCP deny entry, preserving URL and command policies', async () => {
    const otherRules = [
      { serverUrl: 'https://example.com/*' },
      { serverCommand: ['node', 'server.js'] },
      { serverName: 'other' },
    ]
    await writeFile(
      path.join(dir, 'settings.json'),
      JSON.stringify({ deniedMcpServers: otherRules, hooks: { Stop: [] } }),
    )
    await setCapabilityToggle('mcp', 'docs', false, dir)
    await setCapabilityToggle('mcp', 'docs', false, dir)
    expect((await readSettings()).deniedMcpServers).toEqual([...otherRules, { serverName: 'docs' }])
    await setCapabilityToggle('mcp', 'docs', true, dir)
    expect(await readSettings()).toEqual({ deniedMcpServers: otherRules, hooks: { Stop: [] } })
  })

  it('reports malformed settings and refuses to overwrite them', async () => {
    await writeFile(path.join(dir, 'settings.json'), '{broken')
    await expect(getCapabilityToggles(dir)).rejects.toThrow(/failed to parse/)
    await expect(setCapabilityToggle('mcp', 'docs', false, dir)).rejects.toThrow(/failed to parse/)
    expect(await readFile(path.join(dir, 'settings.json'), 'utf8')).toBe('{broken')
  })
})
