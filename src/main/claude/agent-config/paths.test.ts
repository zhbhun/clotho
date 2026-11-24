// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getCapabilityToggles, setCapabilityToggle } from './capabilities'
import { listMcpServers, saveMcpServer } from './mcp-servers'
import { claudeConfigDir, claudeJsonPath, claudeSettingsPath } from './paths'
import { setPluginEnabled } from './plugins'
import { claudeSkillsDir } from './skills'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Claude configuration paths', () => {
  it('uses the platform home directory when HOME is not set', () => {
    vi.stubEnv('HOME', undefined)
    vi.stubEnv('CLAUDE_CONFIG_DIR', undefined)
    vi.spyOn(os, 'homedir').mockReturnValue(path.resolve('/platform-home'))
    expect(claudeConfigDir()).toBe(path.resolve('/platform-home/.claude'))
    expect(claudeSettingsPath()).toBe(path.resolve('/platform-home/.claude/settings.json'))
    expect(claudeJsonPath()).toBe(path.resolve('/platform-home/.claude.json'))
  })

  it('shares the custom config directory across skills, settings and MCP definitions', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'claude-paths-'))
    vi.stubEnv('CLAUDE_CONFIG_DIR', dir)
    try {
      expect(claudeSkillsDir()).toBe(path.join(dir, 'skills'))
      expect(claudeSettingsPath()).toBe(path.join(dir, 'settings.json'))
      expect(claudeJsonPath()).toBe(path.join(dir, '.claude.json'))
      await Promise.all([
        setCapabilityToggle('skill', 'deploy', false),
        setCapabilityToggle('mcp', 'docs', false),
        setPluginEnabled('probe@local', false),
      ])
      expect(JSON.parse(await readFile(claudeSettingsPath(), 'utf8'))).toEqual({
        skillOverrides: { deploy: 'off' },
        deniedMcpServers: [{ serverName: 'docs' }],
        enabledPlugins: { 'probe@local': false },
      })
      expect(await getCapabilityToggles()).toEqual({
        disabledSkills: ['deploy'],
        disabledMcpServers: ['docs'],
      })
      await saveMcpServer('docs', { type: 'http', url: 'https://mcp.example' })
      expect((await listMcpServers()).servers).toEqual([
        { name: 'docs', type: 'http', url: 'https://mcp.example' },
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
