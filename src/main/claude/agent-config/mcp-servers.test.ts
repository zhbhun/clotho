// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  claudeJsonPath,
  deleteMcpServer,
  filterDisabledServers,
  listMcpServers,
  saveMcpServer,
  validateMcpServer,
} from './mcp-servers'

let tempDir: string

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

async function makeClaudeHome(initial: Record<string, unknown> = {}) {
  tempDir = await mkdtemp(path.join(tmpdir(), 'mcp-'))
  const claudeDir = path.join(tempDir, '.claude')
  await writeFile(claudeJsonPath(claudeDir), `${JSON.stringify(initial, null, 2)}\n`, 'utf8')
  return claudeDir
}

const HTTP_SERVER = {
  type: 'http' as const,
  url: 'https://example.com/mcp',
  headers: { Authorization: 'Bearer token' },
}

describe('listMcpServers', () => {
  it('lists mcpServers entries with their names', async () => {
    const claudeDir = await makeClaudeHome({
      mcpServers: { 'web-reader': HTTP_SERVER },
      lastCost: 5,
    })
    const { servers } = await listMcpServers(claudeDir)
    expect(servers).toHaveLength(1)
    expect(servers[0].name).toBe('web-reader')
    expect(servers[0].url).toBe('https://example.com/mcp')
  })

  it('returns an empty list when the file is missing', async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'mcp-'))
    const { servers, read } = await listMcpServers(path.join(tempDir, '.claude'))
    expect(servers).toEqual([])
    expect(read).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('saveMcpServer', () => {
  it('adds a stdio server and preserves unrelated CLI fields', async () => {
    const claudeDir = await makeClaudeHome({ mcpServers: {}, tipsHistory: [1, 2], lastCost: 9 })
    await saveMcpServer(
      'local-tool',
      { type: 'stdio', command: 'npx', args: ['-y', '@example/server'], env: { KEY: 'v' } },
      claudeDir,
    )
    const saved = JSON.parse(await readFile(claudeJsonPath(claudeDir), 'utf8'))
    expect(saved.mcpServers['local-tool']).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@example/server'],
      env: { KEY: 'v' },
    })
    expect(saved.tipsHistory).toEqual([1, 2])
    expect(saved.lastCost).toBe(9)
  })

  it('overwrites an existing entry with the same name', async () => {
    const claudeDir = await makeClaudeHome({ mcpServers: { dup: HTTP_SERVER } })
    await saveMcpServer('dup', { type: 'sse', url: 'https://new.example/sse' }, claudeDir)
    const saved = JSON.parse(await readFile(claudeJsonPath(claudeDir), 'utf8'))
    expect(saved.mcpServers.dup).toEqual({ type: 'sse', url: 'https://new.example/sse' })
  })

  it('rejects an invalid server without writing', async () => {
    const claudeDir = await makeClaudeHome({ mcpServers: {} })
    await expect(saveMcpServer('bad', { type: 'http' }, claudeDir)).rejects.toThrow(
      /requires a url/,
    )
  })
})

describe('deleteMcpServer', () => {
  it('removes only the named entry and keeps the rest', async () => {
    const claudeDir = await makeClaudeHome({
      mcpServers: { keep: HTTP_SERVER, drop: HTTP_SERVER },
    })
    await deleteMcpServer('drop', claudeDir)
    const saved = JSON.parse(await readFile(claudeJsonPath(claudeDir), 'utf8'))
    expect(Object.keys(saved.mcpServers)).toEqual(['keep'])
  })
})

describe('validateMcpServer', () => {
  it('requires a command for stdio and a url for http/sse', () => {
    expect(validateMcpServer({ type: 'stdio' })).toMatch(/command/)
    expect(validateMcpServer({ type: 'http' })).toMatch(/url/)
    expect(validateMcpServer({ type: 'sse' })).toMatch(/url/)
    expect(validateMcpServer({ type: 'stdio', command: 'npx' })).toBeNull()
    expect(validateMcpServer({ type: 'weird' } as never)).toMatch(/Unknown/)
  })
})

describe('filterDisabledServers', () => {
  it('drops Clotho-disabled servers by name', () => {
    const servers = [{ name: 'a' }, { name: 'b' }]
    expect(filterDisabledServers(servers, ['b']).map((s) => s.name)).toEqual(['a'])
    expect(filterDisabledServers(servers, undefined)).toEqual(servers)
  })
})
