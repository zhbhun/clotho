import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { app, utilityProcess } from 'electron'

import type { MarketSkill } from '@/shared/rpc'

import { claudeSkillsDir } from './skills'

const SOURCE_FILE = '.clotho-market-source.json'
const installing = new Map<string, { source: string; name: string; promise: Promise<void> }>()

function isRepository(value: string) {
  return /^[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+$/i.test(value) && !/\/\.{1,2}$/.test(value)
}

function isProvider(value: string) {
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value)
}

// skills 1.8.1 normalizes the upstream selector when choosing the target directory.
function directoryName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._]+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '')
      .slice(0, 255) || 'unnamed-skill'
  )
}

function runSkills(args: string[], staging?: string): Promise<string> {
  const runtime = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'skill-runtime')
    : app.getAppPath()
  const entry = path.join(runtime, 'node_modules', 'skills', 'bin', 'cli.mjs')
  const runner = app.isPackaged
    ? path.join(runtime, 'skills-runner.cjs')
    : path.join(runtime, 'src/main/claude/agent-config/skills-runner.cjs')
  const child = utilityProcess.fork(runner, [entry, ...args], {
    stdio: 'pipe',
    serviceName: 'Clotho Skills',
    cwd: staging,
    env: {
      ...process.env,
      NO_COLOR: '1',
      DISABLE_TELEMETRY: '1',
      GIT_TERMINAL_PROMPT: '0',
      ...(staging && { CLAUDE_CONFIG_DIR: staging, XDG_STATE_HOME: path.join(staging, 'state') }),
    },
  })
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4096)
    })
    const timer = setTimeout(
      () => {
        child.kill()
        reject(new Error('The skills command timed out'))
      },
      staging ? 180_000 : 30_000,
    )
    child.once('error', () => {
      clearTimeout(timer)
      reject(new Error('The skills command could not run'))
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stripVTControlCharacters(stdout).trim())
      else reject(new Error(stripVTControlCharacters(stderr).trim() || 'The skills command failed'))
    })
  })
}

export async function findMarketSkills(query: string): Promise<MarketSkill[]> {
  const term = query.trim()
  if (!term) return []
  // The CLI also inspects --help/-h before parsing the option terminator.
  const argument = ['--help', '-h'].includes(term) ? ' ' + term : term
  const output = await runSkills(['find', '--', argument])
  if (/^No skills found for "/m.test(output)) return []
  const rows: MarketSkill[] = []
  const lines = output.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].startsWith('└ https://skills.sh/')) continue
    const match = /^(\S+)@(.+?)(?: (\d+(?:\.\d+)?[KM]?) installs?)?$/.exec(lines[i - 1])
    if (!match) throw new Error('Unexpected skills search result')
    const [, source, name, installs] = match
    rows.push({ source, name, installs: installs ?? '', url: lines[i].slice('└ '.length).trim() })
  }
  if (!rows.length) throw new Error('Unexpected skills search output')
  return rows
}

export async function readMarketSkillSource(name: string): Promise<string | undefined> {
  if (!name || /[/\\]/.test(name) || name === '.' || name === '..') return undefined
  try {
    const data = JSON.parse(await readFile(path.join(claudeSkillsDir(), name, SOURCE_FILE), 'utf8'))
    if (
      typeof data.source === 'string' &&
      (isRepository(data.source) || isProvider(data.source)) &&
      data.directory === name
    )
      return data.source
  } catch {
    // Existing skills installed outside Clotho have no recorded provenance.
  }
  return undefined
}

async function exists(file: string) {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function install(source: string, name: string, directory: string) {
  const skillsDir = claudeSkillsDir()
  const target = path.join(skillsDir, directory)
  const collision = () => new Error(`A user skill named "${directory}" already exists`)
  if (await exists(target)) throw collision()
  await mkdir(skillsDir, { recursive: true })
  // The CLI can replace directories and select fuzzy matches. Stage on the same
  // filesystem and publish only the verified, exact result by atomic rename.
  const staging = await mkdtemp(path.join(path.dirname(skillsDir), '.clotho-install-'))
  try {
    const provider = isProvider(source)
    const output = await runSkills(
      [
        'add',
        provider ? `https://${source}` : source,
        '--skill',
        name,
        '--agent',
        'claude-code',
        '--global',
        '--yes',
        '--copy',
        ...(provider ? [] : ['--json']),
      ],
      staging,
    )
    const stagedSkill = path.join(staging, 'skills', directory)
    if (provider) {
      // 1.8.1 only implements JSON output for repository sources. Its global
      // lock still records the selected install name and provider for these.
      const lock = JSON.parse(
        await readFile(path.join(staging, 'state', 'skills', '.skill-lock.json'), 'utf8'),
      )
      const entries = Object.entries(lock.skills ?? {})
      const entry = lock.skills?.[name]
      if (
        entries.length !== 1 ||
        entry?.sourceType !== 'well-known' ||
        entry.sourceBaseUrl !== `https://${source}`
      ) {
        throw new Error('The skills command did not install the selected provider skill')
      }
    } else {
      const results = JSON.parse(output)
      const result = Array.isArray(results) && results.length === 1 ? results[0] : null
      if (
        result?.status !== 'installed' ||
        result.name?.toLowerCase() !== name.toLowerCase() ||
        result.source?.toLowerCase() !== source.toLowerCase() ||
        result.scope !== 'global' ||
        path.resolve(result.path || '.') !== stagedSkill
      ) {
        throw new Error('The skills command did not install the selected skill')
      }
    }
    await readFile(path.join(stagedSkill, 'SKILL.md'), 'utf8')
    await writeFile(path.join(stagedSkill, SOURCE_FILE), JSON.stringify({ source, directory }), {
      flag: 'wx',
    })
    if (await exists(target)) throw collision()
    await rename(stagedSkill, target)
  } finally {
    await rm(staging, { force: true, recursive: true })
  }
}

export async function installMarketSkill(source: string, name: string): Promise<void> {
  if (
    (!isRepository(source) && !isProvider(source)) ||
    !name.trim() ||
    name !== name.trim() ||
    name.startsWith('-') ||
    name === '.' ||
    name === '..' ||
    /[*/\\\p{Cc}]/u.test(name)
  ) {
    throw new Error('Invalid skill source or selector')
  }
  const directory = directoryName(name)
  const pending = installing.get(directory)
  if (pending) {
    if (pending.source === source && pending.name === name) return pending.promise
    throw new Error(`A different skill named "${directory}" is being installed`)
  }
  const promise = install(source, name, directory)
  installing.set(directory, { source, name, promise })
  try {
    await promise
  } finally {
    installing.delete(directory)
  }
}
