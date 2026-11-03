import { type Dirent, promises as fs } from 'node:fs'
import path from 'node:path'

import { getLogger } from '../../logging/runtime'
import { readFrontmatter } from './frontmatter'

const logger = getLogger('agent-config')

export interface SkillInfo {
  /** Directory name under `~/.claude/skills/`. */
  name: string
  /** From SKILL.md frontmatter; falls back to the directory name. */
  description: string
}

export function claudeSkillsDir(claudeDir = path.join(process.env.HOME ?? '', '.claude')) {
  return path.join(claudeDir, 'skills')
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
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const source = await fs.readFile(path.join(skillsDir, entry.name, 'SKILL.md'), 'utf8')
          const frontmatter = readFrontmatter(source)
          return {
            name: entry.name,
            description: frontmatter.description ?? frontmatter.name ?? entry.name,
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
  if (!name || name.includes('/') || name.includes('..')) {
    throw new Error(`Invalid skill name: ${name}`)
  }
  await fs.rm(path.join(claudeSkillsDir(claudeDir), name), { recursive: true })
}
