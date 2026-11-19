// @vitest-environment node
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { claudeSkillsDir, deleteSkill, listSkills, readSkill } from './skills'

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

  it.each(['absolute', 'relative'])('lists skills installed through %s links', async (linkType) => {
    const claudeDir = await makeSkillsDir()
    const skillsDir = claudeSkillsDir(claudeDir)
    const targetDir = path.join(claudeDir, 'shared', 'original')
    await mkdir(skillsDir, { recursive: true })
    await mkdir(targetDir, { recursive: true })
    await writeFile(
      path.join(targetDir, 'SKILL.md'),
      '---\nname: original\ndescription: Linked skill helper\n---\n',
      'utf8',
    )
    const target = linkType === 'relative' ? path.relative(skillsDir, targetDir) : targetDir
    await symlink(target, path.join(skillsDir, 'linked'), 'dir')

    await expect(listSkills(claudeDir)).resolves.toEqual([
      { name: 'linked', description: 'Linked skill helper' },
    ])
  })

  it('skips broken links and links without SKILL.md while listing valid skills', async () => {
    const claudeDir = await makeSkillsDir()
    const skillsDir = claudeSkillsDir(claudeDir)
    const targetDir = path.join(claudeDir, 'empty-target')
    const skillFile = path.join(skillsDir, 'real', 'SKILL.md')
    await mkdir(path.dirname(skillFile), { recursive: true })
    await mkdir(targetDir)
    await writeFile(skillFile, '---\nname: real\n---\n', 'utf8')
    await symlink('missing-target', path.join(skillsDir, 'broken'), 'dir')
    await symlink(targetDir, path.join(skillsDir, 'empty'), 'dir')
    await symlink(skillFile, path.join(skillsDir, 'file'), 'file')

    await expect(listSkills(claudeDir)).resolves.toEqual([{ name: 'real', description: 'real' }])
  })

  it('returns empty when the skills directory is missing', async () => {
    const claudeDir = await makeSkillsDir()
    await expect(listSkills(claudeDir)).resolves.toEqual([])
  })
})

describe('readSkill', () => {
  it('separates YAML metadata from Markdown and preserves version spelling', async () => {
    const dir = await makeSkillsDir()
    const skill = path.join(claudeSkillsDir(dir), 'example')
    await mkdir(skill, { recursive: true })
    await writeFile(
      path.join(skill, 'SKILL.md'),
      [
        '---',
        'name: Original',
        'description: >-',
        '  First line',
        '  second line.',
        'license: MIT',
        'metadata:',
        '  version: 3.0',
        '  author: Example',
        '---',
        '# Instructions',
      ].join('\r\n'),
    )
    await expect(readSkill('example', dir)).resolves.toEqual({
      metadata: {
        name: 'Original',
        description: 'First line second line.',
        license: 'MIT',
        version: '3.0',
        author: 'Example',
      },
      body: '# Instructions',
    })
    await expect(readSkill('../example', dir)).rejects.toThrow('Invalid skill name')
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

  it('removes a skill link and preserves the target directory and contents', async () => {
    const claudeDir = await makeSkillsDir()
    const skillsDir = claudeSkillsDir(claudeDir)
    const targetDir = path.join(claudeDir, 'shared-skill')
    const linkPath = path.join(skillsDir, 'linked')
    const source = '---\nname: original\n---\n\nShared skill body\n'
    await mkdir(skillsDir, { recursive: true })
    await mkdir(targetDir)
    await writeFile(path.join(targetDir, 'SKILL.md'), source, 'utf8')
    await symlink(path.relative(skillsDir, targetDir), linkPath, 'dir')

    await deleteSkill('linked', claudeDir)

    await expect(lstat(linkPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(path.join(targetDir, 'SKILL.md'), 'utf8')).resolves.toBe(source)
    await expect(listSkills(claudeDir)).resolves.toEqual([])
  })

  it('rejects names that would escape the directory', async () => {
    const claudeDir = await makeSkillsDir()
    await expect(deleteSkill('../escape', claudeDir)).rejects.toThrow(/Invalid skill name/)
  })
})
