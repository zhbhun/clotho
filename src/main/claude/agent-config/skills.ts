import { type Dirent, promises as fs } from 'node:fs'
import path from 'node:path'

import { parseDocument } from 'yaml'

import type { AgentSkillDocument } from '@/shared/rpc'

import { getLogger } from '../../logging/runtime'
import { claudeConfigDir } from './paths'

const logger = getLogger('agent-config')

export interface SkillInfo {
  /** Directory name under `~/.claude/skills/`. */
  name: string
  /** From SKILL.md frontmatter; falls back to the directory name. */
  description: string
}

export function claudeSkillsDir(claudeDir = claudeConfigDir()) {
  return path.join(claudeDir, 'skills')
}

function skillPath(name: string, claudeDir?: string) {
  if (!name || name === '.' || name === '..' || /[/\\]/.test(name) || path.isAbsolute(name)) {
    throw new Error(`Invalid skill name: ${name}`)
  }
  return path.join(claudeSkillsDir(claudeDir), name)
}

export async function readSkill(name: string, claudeDir?: string): Promise<AgentSkillDocument> {
  const source = await fs.readFile(path.join(skillPath(name, claudeDir), 'SKILL.md'), 'utf8')
  return parseSkillDocument(source)
}

export function parseSkillDocument(source: string): AgentSkillDocument {
  const header = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
  if (!header) return { metadata: {}, body: source }
  const yaml = parseDocument(header[1], { schema: 'failsafe' })
  if (yaml.errors.length) return { metadata: {}, body: source }
  const metadata: AgentSkillDocument['metadata'] = {}
  for (const key of ['name', 'description', 'license', 'version', 'author'] as const) {
    const value =
      yaml.get(key) ??
      (key === 'version' || key === 'author' ? yaml.getIn(['metadata', key]) : undefined)
    if (typeof value === 'string' && value.trim()) metadata[key] = value.trim()
  }
  return { metadata, body: source.slice(header[0].length) }
}

export async function listSkills(claudeDir?: string): Promise<SkillInfo[]> {
  const skillsDir = claudeSkillsDir(claudeDir)
  let entries: Dirent[]
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true })
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return []
    logger.warning('agent_config.skills_list_failed', 'Failed to list skills', {
      context: { skillsDir },
      error: caught,
    })
    throw caught
  }
  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map(async (entry) => {
        try {
          const { metadata } = await readSkill(entry.name, claudeDir)
          return {
            name: entry.name,
            description: metadata.description ?? metadata.name ?? entry.name,
          }
        } catch {
          // No SKILL.md (or unreadable): not a skill (spec: directory without SKILL.md).
          return null
        }
      }),
  )
  return skills.filter((skill) => skill !== null)
}

export async function deleteSkill(name: string, claudeDir?: string): Promise<void> {
  await fs.rm(skillPath(name, claudeDir), { recursive: true })
}
