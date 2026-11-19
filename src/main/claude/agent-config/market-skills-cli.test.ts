// @vitest-environment node
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'

import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { findMarketSkills, installMarketSkill, readMarketSkillSource } from './market-skills-cli'

const { fork } = vi.hoisted(() => ({ fork: vi.fn() }))
vi.mock('electron', () => ({ app: { getAppPath: () => '/app' }, utilityProcess: { fork } }))

let skillsDir: string
vi.mock('./skills', () => ({ claudeSkillsDir: () => skillsDir }))

beforeEach(async () => {
  skillsDir = path.join(await mkdtemp(path.join(tmpdir(), 'market-cli-test-')), 'skills')
  fork.mockReset()
})
afterEach(async () => {
  await rm(path.dirname(skillsDir), { recursive: true, force: true })
})

function runFixture(response: (args: string[], cwd: string) => string | Promise<string>) {
  fork.mockImplementation((runner: string, [entry, ...args]: string[], { cwd }) => {
    expect(path.basename(runner)).toBe('skills-runner.cjs')
    expect(path.basename(entry)).toBe('cli.mjs')
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    })
    void Promise.resolve()
      .then(() => response(args, cwd))
      .then(
        (output) => {
          child.stdout.end(output)
          child.emit('exit', 0)
        },
        (error: Error) => {
          child.stderr.end(error.message)
          child.emit('exit', 1)
        },
      )
    return child
  })
}

it('passes option-like queries as data and preserves CLI result order, names and formatted counts', async () => {
  runFixture((args) => {
    expect(args).toEqual(['find', '--', '--owner'])
    return [
      'Install with npx skills add <owner/repo@skill>',
      'acme/skills@react:components 52.1K installs',
      '└ https://skills.sh/acme/skills/reactcomponents',
      'Partial matches (some terms of "--owner"):',
      'example.org@Second skill',
      '└ https://skills.sh/example.org/second-skill',
    ].join('\n')
  })
  await expect(findMarketSkills('--owner')).resolves.toEqual([
    {
      source: 'acme/skills',
      name: 'react:components',
      installs: '52.1K',
      url: 'https://skills.sh/acme/skills/reactcomponents',
    },
    {
      source: 'example.org',
      name: 'Second skill',
      installs: '',
      url: 'https://skills.sh/example.org/second-skill',
    },
  ])
})

it('distinguishes empty results from an incompatible output format', async () => {
  runFixture(() => 'No skills found for "missing"')
  await expect(findMarketSkills('missing')).resolves.toEqual([])
  runFixture(() => 'unexpected output')
  await expect(findMarketSkills('missing')).rejects.toThrow('Unexpected skills search output')
})

it('coalesces installations, verifies one exact result, and protects other sources with the same directory name', async () => {
  runFixture(async (args, cwd) => {
    expect(args).toEqual([
      'add',
      'acme/tools',
      '--skill',
      'review:docs',
      '--agent',
      'claude-code',
      '--global',
      '--yes',
      '--copy',
      '--json',
    ])
    const staged = path.join(cwd, 'skills', 'review-docs')
    await mkdir(staged, { recursive: true })
    await writeFile(path.join(staged, 'SKILL.md'), 'review')
    return JSON.stringify([
      {
        name: 'review:docs',
        path: staged,
        source: 'acme/tools',
        scope: 'global',
        status: 'installed',
      },
    ])
  })
  const first = installMarketSkill('acme/tools', 'review:docs')
  const again = installMarketSkill('acme/tools', 'review:docs')
  await expect(installMarketSkill('other/tools', 'review-docs')).rejects.toThrow('being installed')
  await Promise.all([first, again])
  await expect(readMarketSkillSource('review-docs')).resolves.toBe('acme/tools')
  await expect(installMarketSkill('other/tools', 'review-docs')).rejects.toThrow('already exists')
  await expect(readFile(path.join(skillsDir, 'review-docs', 'SKILL.md'), 'utf8')).resolves.toBe(
    'review',
  )
  expect(fork).toHaveBeenCalledTimes(1)
})

it('rejects unexpected selections without publishing partial files, then allows retry', async () => {
  runFixture(() => '[{"status":"installed","name":"similar"}]')
  await expect(installMarketSkill('acme/repo', 'skill')).rejects.toThrow('selected skill')
  runFixture(() => {
    throw new Error('Repository unavailable')
  })
  await expect(installMarketSkill('acme/repo', 'skill')).rejects.toThrow('Repository unavailable')
  await expect(readdir(skillsDir)).resolves.toEqual([])
  await expect(readdir(path.dirname(skillsDir))).resolves.toEqual(['skills'])
})

it('installs a verified HTTPS provider skill using its isolated global lock', async () => {
  runFixture(async (args, cwd) => {
    expect(args).toContain('https://open.example.com')
    expect(args).not.toContain('--json')
    const staged = path.join(cwd, 'skills', 'docs')
    const lockDir = path.join(cwd, 'state', 'skills')
    await mkdir(staged, { recursive: true })
    await mkdir(lockDir, { recursive: true })
    await writeFile(
      path.join(lockDir, '.skill-lock.json'),
      JSON.stringify({
        skills: { docs: { sourceBaseUrl: 'https://open.example.com', sourceType: 'well-known' } },
      }),
    )
    await writeFile(path.join(staged, 'SKILL.md'), 'documentation')
    return 'Done!'
  })
  await installMarketSkill('open.example.com', 'docs')
  await expect(readMarketSkillSource('docs')).resolves.toBe('open.example.com')
})
