/** Run: node scripts/probe-plugins.mts (local fixture, no model requests). */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { query } from '@anthropic-ai/claude-agent-sdk'

const root = await mkdtemp(join(tmpdir(), 'clotho-plugins-'))
const configDir = join(root, 'user-config')
const marketplaceDir = join(root, 'marketplace')
const pluginDir = join(marketplaceDir, 'plugins', 'probe')
const settingsPath = join(configDir, 'settings.json')
const pluginId = 'probe@clotho-probe-marketplace'
const executable = process.env.CLAUDE_CODE_EXECUTABLE ?? 'claude'
const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: configDir }
delete env.CLAUDECODE
for (const dir of [
  configDir,
  join(marketplaceDir, '.claude-plugin'),
  join(pluginDir, '.claude-plugin'),
  join(pluginDir, 'skills', 'hello'),
])
  await mkdir(dir, { recursive: true })
await writeFile(
  join(pluginDir, '.claude-plugin', 'plugin.json'),
  JSON.stringify({ name: 'probe', version: '1.0.0' }),
)
await writeFile(
  join(pluginDir, 'skills', 'hello', 'SKILL.md'),
  '---\nname: hello\ndescription: Harmless plugin test skill.\n---\nReply hello.\n',
)
await writeFile(
  join(marketplaceDir, '.claude-plugin', 'marketplace.json'),
  JSON.stringify({
    name: 'clotho-probe-marketplace',
    owner: { name: 'Clotho probe' },
    plugins: [{ name: 'probe', source: './plugins/probe', description: 'Local test fixture' }],
  }),
)
const run = promisify(execFile)
console.log(`Evidence directory: ${root}`)
for (const args of [
  ['plugin', 'marketplace', 'add', marketplaceDir],
  ['plugin', 'install', pluginId, '--scope', 'user'],
]) {
  const result = await run(executable, args, { env, cwd: root, timeout: 30000 })
  await writeFile(join(root, `${args[1]}.log`), result.stdout + result.stderr)
}

async function* noPrompt() {}
const rows = []
for (const [index, enabled] of [true, false, true].entries()) {
  const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
  settings.enabledPlugins = { ...settings.enabledPlugins, [pluginId]: enabled }
  await writeFile(settingsPath, JSON.stringify(settings, null, 2))
  const session = query({
    prompt: noPrompt(),
    options: {
      cwd: root,
      env,
      pathToClaudeCodeExecutable: executable,
      settingSources: ['user'],
      persistSession: false,
      tools: [],
      strictMcpConfig: true,
      mcpServers: {},
      abortController: new AbortController(),
    },
  })
  const timer = setTimeout(() => session.close(), 30000)
  try {
    const commands = await session.supportedCommands()
    rows.push({
      phase: ['enabled', 'disabled', 'restored'][index],
      enabled,
      listed: commands.some((command) => command.name === 'probe:hello'),
      commands: commands.map((command) => command.name),
    })
  } finally {
    clearTimeout(timer)
    session.close()
  }
  await writeFile(join(root, 'report.json'), JSON.stringify({ rows }, null, 2))
}
console.table(rows.map((row) => ({ phase: row.phase, enabled: row.enabled, listed: row.listed })))
for (const row of rows)
  assert.equal(row.listed, row.enabled, `Plugin state mismatch in ${row.phase}`)
console.log(`Report: ${join(root, 'report.json')}`)
