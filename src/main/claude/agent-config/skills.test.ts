// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { claudeSkillsDir, deleteSkill, listSkills } from './skills'

let tempDir: string

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

async function makeSkillsDir() {
  tempDir = await mkdtemp(path.join(tmpdir(), 'skills-'))
  return tempDir
}

describe('listSkills', () => {
  it('lists directories containing SKILL.md with description from frontmatter', async () => {
    const claudeDir = await makeSkillsDir()
    const skillsDir = claudeSkillsDir(claudeDir)
    await mkdir(path.join(skillsDir, 'cheatsheet'), { recursive: true })
    await writeFile(
      path.join(skillsDir, 'cheatsheet', 'SKILL.md'),
      '---\nname: cheatsheet\ndescription: "Cheat sheet helper"\n---\n\nBody\n',
      'utf8',
    )
    const skills = await listSkills(claudeDir)
    expect(skills).toEqual([{ name: 'cheatsheet', description: 'Cheat sheet helper' }])
  })

  it('skips directories without SKILL.md and does not fail', async () => {
    const claudeDir = await makeSkillsDir()
    const skillsDir = claudeSkillsDir(claudeDir)
    await mkdir(path.join(skillsDir, 'real'), { recursive: true })
    await mkdir(path.join(skillsDir, 'empty'), { recursive: true })
    await writeFile(path.join(skillsDir, 'real', 'SKILL.md'), '---\nname: real\n---\n', 'utf8')
    await expect(listSkills(claudeDir)).resolves.toEqual([{ name: 'real', description: 'real' }])
  })

  it('returns empty when the skills directory is missing', async () => {
    const claudeDir = await makeSkillsDir()
    await expect(listSkills(claudeDir)).resolves.toEqual([])
  })
})

describe('deleteSkill', () => {
  it('removes the skill directory', async () => {
    const claudeDir = await makeSkillsDir()
    const skillDir = path.join(claudeSkillsDir(claudeDir), 'gone')
    await mkdir(skillDir, { recursive: true })
    await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: gone\n---\n', 'utf8')
    await deleteSkill('gone', claudeDir)
    await expect(listSkills(claudeDir)).resolves.toEqual([])
  })

  it('rejects names that would escape the directory', async () => {
    const claudeDir = await makeSkillsDir()
    await expect(deleteSkill('../escape', claudeDir)).rejects.toThrow(/Invalid skill name/)
  })
})
