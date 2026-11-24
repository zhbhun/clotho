/**
 * Run: node scripts/probe-skills.mts
 * Discovery only (no model requests): node scripts/probe-skills.mts --list-only
 * Read capability switches from an isolated user settings.json: add --user-settings
 * Uses the installed `claude` CLI and its existing login, or ANTHROPIC_* env vars.
 * Optional: CLAUDE_CODE_EXECUTABLE, PROBE_MODEL, PROBE_TIMEOUT_MS.
 * Each invocation probe uses a fresh session and can incur API usage.
 */
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { type Options, query } from '@anthropic-ai/claude-agent-sdk'

const skillName = 'clotho-probe'
const marker = `SKILL_LOADED_${randomUUID()}`
const root = await mkdtemp(join(tmpdir(), 'clotho-skills-'))
const cwd = join(root, 'project')
const listOnly = process.argv.includes('--list-only')
const useUserSettings = process.argv.includes('--user-settings')
const testConfigDir = join(root, 'user-config')
await mkdir(testConfigDir, { recursive: true })
const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 60000)
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid PROBE_TIMEOUT_MS')

// Reuse API credentials/model routing without importing user hooks or plugins.
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

const skillDir = join(cwd, '.claude', 'skills', skillName)
await mkdir(skillDir, { recursive: true })
await writeFile(
  join(skillDir, 'SKILL.md'),
  `---
name: ${skillName}
description: Harmless test skill for verifying SDK skill configuration.
---
Reply with exactly this marker and nothing else: ${marker}
`,
)

const cases: { name: string; options: Options }[] = [
  { name: 'default', options: {} },
  { name: 'skills-empty', options: { skills: [] } },
  { name: 'deny-skill', options: { disallowedTools: [`Skill(${skillName})`] } },
  {
    name: 'override-off',
    options: { settings: { skillOverrides: { [skillName]: 'off' } } },
  },
]
if (useUserSettings) cases.push({ name: 'restored', options: {} })

const prompts = listOnly
  ? [{ name: 'listing', text: '' }]
  : [
      { name: 'slash', text: `/${skillName}` },
      {
        name: 'tool',
        text: `Call the Skill tool with skill="${skillName}" and no arguments. Do not read files or use any other tool. If it succeeds, follow the skill instructions. If unavailable or denied, report that and stop.`,
      },
    ]

// An empty iterable initializes the CLI without submitting a model turn.
async function* noPrompt() {}

const rows: Record<string, unknown>[] = []
console.log(`Evidence directory: ${root}`)

for (const test of cases) {
  if (useUserSettings && ['skills-empty', 'deny-skill'].includes(test.name)) continue
  for (const prompt of prompts) {
    const name = `${test.name}-${prompt.name}`
    const logPath = join(root, `${name}.jsonl`)
    const abortController = new AbortController()
    const timer = setTimeout(() => abortController.abort(), timeoutMs)
    const env = { ...configuredEnv, ...process.env }
    if (useUserSettings) {
      env.CLAUDE_CONFIG_DIR = testConfigDir
      await writeFile(
        join(testConfigDir, 'settings.json'),
        JSON.stringify(test.options.settings ?? {}),
      )
    }
    delete env.CLAUDECODE
    const row: Record<string, unknown> = { case: test.name, mode: prompt.name }
    const calls: unknown[] = []
    const toolResults: unknown[] = []
    const text: string[] = []
    console.log(`Running ${name}...`)
    const diagnostics: string[] = []
    const session = query({
      prompt: listOnly ? noPrompt() : prompt.text,
      options: {
        cwd,
        env,
        pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE ?? 'claude',
        settingSources: useUserSettings ? ['user', 'project'] : ['project'],
        persistSession: false,
        tools: ['Skill'],
        allowedTools: ['Skill'],
        permissionMode: 'dontAsk',
        strictMcpConfig: true,
        mcpServers: {},
        maxTurns: 3,
        ...(process.env.PROBE_MODEL ? { model: process.env.PROBE_MODEL } : {}),
        ...(useUserSettings ? {} : test.options),
        abortController,
        stderr: (data) => {
          // Keep CLI diagnostics alongside each probe rather than mixing with the table.
          diagnostics.push(data)
        },
      },
    })
    try {
      const commands = await session.supportedCommands()
      row.listed = commands.some((command) => command.name === skillName)
      await appendFile(logPath, JSON.stringify({ commands }) + '\n')
      if (!listOnly) {
        for await (const message of session) {
          await appendFile(logPath, JSON.stringify(message) + '\n')
          if (message.type === 'assistant') {
            for (const block of message.message.content) {
              if (block.type === 'text') text.push(block.text)
              if (block.type === 'tool_use') calls.push({ name: block.name, input: block.input })
            }
          }
          if (message.type === 'user' && Array.isArray(message.message.content)) {
            for (const block of message.message.content) {
              if (block.type === 'tool_result') toolResults.push(block)
            }
          }
          if (message.type === 'result') {
            row.result = message.subtype
            row.isError = message.is_error
            row.permissionDenials = message.permission_denials
            if ('result' in message) text.push(message.result)
          }
        }
        // The random marker exists only in SKILL.md, never in the prompt.
        row.markerReturned = text.some((value) => value.includes(marker))
        row.toolCalls = calls
        row.toolResults = toolResults
        row.reply = text.join('\n')
        if (!row.result) row.error = 'Stream ended without a result'
      }
    } catch (error) {
      row.error = error instanceof Error ? error.message : String(error)
    } finally {
      clearTimeout(timer)
      session.close()
      if (diagnostics.length)
        await writeFile(join(root, `${name}.stderr.log`), diagnostics.join(''))
    }
    rows.push(row)
    await writeFile(join(root, 'report.json'), JSON.stringify({ marker, cwd, rows }, null, 2))
  }
}

console.table(
  rows.map((row) => ({
    case: row.case,
    mode: row.mode,
    listed: row.listed,
    markerReturned: row.markerReturned,
    result: row.result,
    error: row.error,
  })),
)
console.log(`Full calls, replies and permission denials: ${join(root, 'report.json')}`)
console.log('A missing marker alone does not prove blocking; inspect tool results and API errors.')
if (rows.some((row) => row.error || row.isError)) process.exitCode = 1
