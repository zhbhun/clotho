import { promises as fs } from 'node:fs'
import path from 'node:path'

import { type AgentSubagentFields } from '@/shared/rpc'

import { getLogger } from '../../logging/runtime'

const logger = getLogger('agent-config')

/** The frontmatter fields the subagent editor owns; the body is the prompt. */
export interface SubagentFrontmatter {
  name?: string
  description?: string
  tools?: string
  model?: string
  disallowedTools?: string
  permissionMode?: string
  effort?: string
  maxTurns?: string
  background?: string
  omitClaudeMd?: string
  memory?: string
  isolation?: string
  skills?: string
  color?: string
}

/** Decode file strings to the renderer contract; booleans are `'true'`/absent. */
export function subagentFieldsFrom(frontmatter: SubagentFrontmatter): AgentSubagentFields {
  return {
    tools: frontmatter.tools,
    model: frontmatter.model,
    disallowedTools: frontmatter.disallowedTools,
    permissionMode: frontmatter.permissionMode,
    effort: frontmatter.effort,
    maxTurns: frontmatter.maxTurns,
    background: frontmatter.background === 'true' ? true : undefined,
    omitClaudeMd: frontmatter.omitClaudeMd === 'true' ? true : undefined,
    memory: frontmatter.memory,
    isolation: frontmatter.isolation,
    skills: frontmatter.skills,
    color: frontmatter.color,
  }
}

/** Encode the renderer contract back to file strings; booleans become `'true'`. */
export function subagentFieldsTo(fields: AgentSubagentFields): SubagentFrontmatter {
  return {
    tools: fields.tools,
    model: fields.model,
    disallowedTools: fields.disallowedTools,
    permissionMode: fields.permissionMode,
    effort: fields.effort,
    maxTurns: fields.maxTurns,
    background: fields.background === undefined ? undefined : String(fields.background),
    omitClaudeMd: fields.omitClaudeMd === undefined ? undefined : String(fields.omitClaudeMd),
    memory: fields.memory,
    isolation: fields.isolation,
    skills: fields.skills,
    color: fields.color,
  }
}

/** Frontmatter keys the editor writes; every other line round-trips verbatim. */
const OWNED_KEYS = [
  'name',
  'description',
  'tools',
  'model',
  'disallowedTools',
  'permissionMode',
  'effort',
  'maxTurns',
  'background',
  'omitClaudeMd',
  'memory',
  'isolation',
  'skills',
  'color',
] as const

export interface SubagentConfigFile {
  /** File stem; also the write target for save/delete. */
  file: string
  fields: SubagentFrontmatter
  /** Raw frontmatter lines, preserved verbatim on write (design D5). */
  raw: string[]
  /** Markdown body after the frontmatter block (the system prompt). */
  body: string
}

export type SubagentParseResult =
  { ok: true; value: SubagentConfigFile } | { ok: false; reason: 'read' | 'frontmatter' }

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/**
 * Parse one `key: value` line, or a single-level `key: [a, b]` list, keeping
 * unknown keys verbatim in `raw` for round-trip preservation (design D5).
 */
function parseFrontmatterLine(line: string): { key: string; value: string } | null {
  const separator = line.indexOf(':')
  if (separator <= 0) return null
  const key = line.slice(0, separator).trim()
  const value = line.slice(separator + 1).trim()
  if (!key) return null
  return { key, value }
}

/** Minimal flat-key frontmatter parser; unknown lines survive in `raw`. */
export function parseFrontmatter(
  source: string,
): { fields: SubagentFrontmatter; raw: string[]; body: string } | null {
  const match = FRONTMATTER_RE.exec(source)
  if (!match) return null
  const rawLines = match[1].split(/\r?\n/)
  const fields: SubagentFrontmatter = {}
  for (const line of rawLines) {
    if (!line.trim()) continue
    const parsed = parseFrontmatterLine(line)
    if (!parsed) continue
    if ((OWNED_KEYS as readonly string[]).includes(parsed.key)) {
      fields[parsed.key as keyof SubagentFrontmatter] = unquote(parsed.value)
    }
  }
  return { fields, raw: rawLines, body: source.slice(match[0].length).replace(/^\r?\n/, '') }
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Serialize back to frontmatter + body, patching only UI-owned keys. */
export function serializeSubagent(config: {
  file: string
  frontmatter: SubagentFrontmatter
  body: string
  /** Previously parsed raw frontmatter lines; unknown keys are preserved. */
  rawLines?: string[]
}): string {
  const owned = new Set<string>(OWNED_KEYS)
  const lines: string[] = []
  const written = new Set<string>()
  for (const line of config.rawLines ?? []) {
    const parsed = parseFrontmatterLine(line)
    if (parsed && owned.has(parsed.key)) {
      const value = config.frontmatter[parsed.key as keyof SubagentFrontmatter]
      if (value === undefined) continue
      lines.push(`${parsed.key}: ${quote(value)}`)
      written.add(parsed.key)
    } else {
      lines.push(line)
    }
  }
  for (const key of OWNED_KEYS) {
    if (written.has(key) || config.frontmatter[key] === undefined) continue
    lines.push(`${key}: ${quote(config.frontmatter[key])}`)
  }
  const body = config.body ? `\n${config.body.trimEnd()}\n` : '\n'
  return `---\n${lines.join('\n')}\n---\n${body}`
}

export function claudeAgentsDir(claudeDir = path.join(process.env.HOME ?? '', '.claude')) {
  return path.join(claudeDir, 'agents')
}

export async function listSubagentConfigs(
  claudeDir?: string,
): Promise<Array<SubagentConfigFile | { file: string; broken: true }>> {
  const agentsDir = claudeAgentsDir(claudeDir)
  let entries: string[]
  try {
    entries = await fs.readdir(agentsDir)
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return []
    logger.warning('agent_config.subagents_list_failed', 'Failed to list subagents', {
      context: { agentsDir },
      error: caught,
    })
    throw caught
  }
  const results = await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.md'))
      .map(async (entry) => {
        try {
          const source = await fs.readFile(path.join(agentsDir, entry), 'utf8')
          const parsed = parseFrontmatter(source)
          if (!parsed) return { file: path.basename(entry, '.md'), broken: true } as const
          return {
            ok: true as const,
            value: { file: path.basename(entry, '.md'), ...parsed },
          }
        } catch {
          return { file: path.basename(entry, '.md'), broken: true } as const
        }
      }),
  )
  return results.map((result) => (result.ok ? result.value : result))
}

const FILE_NAME_RE = /^[\w][\w.-]*$/

export function subagentFilePath(name: string, claudeDir?: string): string {
  if (!FILE_NAME_RE.test(name)) {
    throw new Error(`Invalid subagent name: ${name}`)
  }
  return path.join(claudeAgentsDir(claudeDir), `${name}.md`)
}

export async function saveSubagentConfig(
  input: { file: string; frontmatter: SubagentFrontmatter; body: string },
  claudeDir?: string,
): Promise<void> {
  // Patch in place when the file exists so unknown frontmatter keys survive.
  let rawLines: string[] | undefined
  try {
    const existing = await fs.readFile(subagentFilePath(input.file, claudeDir), 'utf8')
    rawLines = parseFrontmatter(existing)?.raw
  } catch {
    rawLines = undefined
  }
  const filePath = subagentFilePath(input.file, claudeDir)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, serializeSubagent({ ...input, rawLines }), {
    encoding: 'utf8',
    mode: 0o600,
  })
}

export async function deleteSubagentConfig(file: string, claudeDir?: string): Promise<void> {
  await fs.rm(subagentFilePath(file, claudeDir), { force: false })
}
