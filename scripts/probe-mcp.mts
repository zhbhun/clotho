/**
 * Run: node scripts/probe-mcp.mts (makes two model requests)
 * Read the denylist from an isolated user settings.json: add --user-settings
 * Uses ANTHROPIC_* env vars from the environment or the user's Claude settings.
 * Optional: CLAUDE_CODE_EXECUTABLE, PROBE_MODEL, PROBE_TIMEOUT_MS.
 * Creates two temporary stdio servers; never edits existing MCP configuration.
 */
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { type Options, query } from '@anthropic-ai/claude-agent-sdk'

const root = await mkdtemp(join(tmpdir(), 'clotho-mcp-'))
const marker = randomUUID()
const useUserSettings = process.argv.includes('--user-settings')
const testConfigDir = join(root, 'user-config')
await mkdir(testConfigDir, { recursive: true })
const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 60000)
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid PROBE_TIMEOUT_MS')
const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
const userSettings = await readFile(join(configDir, 'settings.json'), 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return '{}'
  throw error
})
const configuredEnv = Object.fromEntries(
  Object.entries(JSON.parse(userSettings).env ?? {}).filter(
    ([key, value]) => key.startsWith('ANTHROPIC_') && typeof value === 'string',
  ),
) as Record<string, string>

// Minimal newline-delimited stdio MCP fixture. All protocol traffic goes to stdout;
// independent disk evidence proves whether a server was started or called.
const serverPath = join(root, 'server.mjs')
await writeFile(
  serverPath,
  `import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
const [log, marker] = process.argv.slice(2)
appendFileSync(log, 'started\\n')
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line)
  appendFileSync(log, JSON.stringify({ method: message.method }) + '\\n')
  if (message.id === undefined) return
  let result
  switch (message.method) {
    case 'initialize':
      result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'clotho-probe', version: '1.0.0' } }
      break
    case 'tools/list':
      result = { tools: [{ name: 'ping', description: 'Return a harmless probe marker.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] }
      break
    case 'tools/call':
      result = { content: [{ type: 'text', text: marker }] }
      break
    case 'ping': result = {}; break
    default:
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } }) + '\\n')
      return
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\\n')
})
`,
)

const rows: Record<string, unknown>[] = []
console.log(`Evidence directory: ${root}`)
for (const [index, isDenied] of (useUserSettings
  ? [false, true, false]
  : [false, true]
).entries()) {
  const name = index === 2 ? 'restored' : isDenied ? 'deny-target' : 'default'
  const logs = Object.fromEntries(
    ['target', 'control'].map((key) => [key, join(root, `${name}-${key}.log`)]),
  )
  const mcpServers: Options['mcpServers'] = Object.fromEntries(
    ['target', 'control'].map((key) => [
      key,
      {
        type: 'stdio',
        command: process.execPath,
        args: [serverPath, logs[key], `${key}_${marker}`],
      },
    ]),
  )
  const env: NodeJS.ProcessEnv = { ...configuredEnv, ...process.env, ENABLE_TOOL_SEARCH: 'false' }
  const settings = { deniedMcpServers: isDenied ? [{ serverName: 'target' }] : [] }
  if (useUserSettings) {
    env.CLAUDE_CONFIG_DIR = testConfigDir
    await writeFile(join(testConfigDir, 'settings.json'), JSON.stringify(settings))
  }
  delete env.CLAUDECODE
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), timeoutMs)
  const diagnostics: string[] = []
  const row: Record<string, unknown> = { case: name }
  console.log(`Running ${name}...`)
  const session = query({
    prompt:
      'Call mcp__target__ping and mcp__control__ping once each if available. Do not use any other tools. Report missing tools and the results you receive, then stop.',
    options: {
      cwd: root,
      env,
      abortController,
      pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE ?? 'claude',
      settingSources: useUserSettings ? ['user'] : [],
      persistSession: false,
      tools: [],
      mcpServers,
      strictMcpConfig: true,
      allowedTools: ['mcp__target__ping', 'mcp__control__ping'],
      permissionMode: 'dontAsk',
      maxTurns: 4,
      ...(process.env.PROBE_MODEL ? { model: process.env.PROBE_MODEL } : {}),
      ...(useUserSettings ? {} : { settings }),
      stderr: (data) => {
        diagnostics.push(data)
      },
    },
  })
  try {
    for await (const message of session) {
      await appendFile(join(root, `${name}.jsonl`), JSON.stringify(message) + '\n')
      if (message.type === 'system' && message.subtype === 'init') {
        row.tools = message.tools.filter((tool) => tool.startsWith('mcp__'))
        row.servers = message.mcp_servers
      }
      if (message.type === 'result') {
        row.result = message.subtype
        row.isError = message.is_error
        row.reply = 'result' in message ? message.result : message.errors
      }
    }
    if (!row.result) row.error = 'Stream ended without a result'
  } catch (error) {
    row.error = error instanceof Error ? error.message : String(error)
  } finally {
    clearTimeout(timer)
    session.close()
    if (diagnostics.length) await writeFile(join(root, `${name}.stderr.log`), diagnostics.join(''))
  }
  for (const key of ['target', 'control']) {
    const log = await readFile(logs[key], 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return ''
      throw error
    })
    row[`${key}Started`] = log.includes('started')
    row[`${key}Called`] = log.includes('"method":"tools/call"')
  }
  rows.push(row)
  await writeFile(join(root, 'report.json'), JSON.stringify({ rows }, null, 2))
}
console.table(
  rows.map((row) => ({
    case: row.case,
    targetStarted: row.targetStarted,
    targetCalled: row.targetCalled,
    controlStarted: row.controlStarted,
    controlCalled: row.controlCalled,
    result: row.result,
    error: row.error,
  })),
)
console.log(`Server status, advertised tools and results: ${join(root, 'report.json')}`)
if (rows.some((row) => row.error || row.isError)) process.exitCode = 1
