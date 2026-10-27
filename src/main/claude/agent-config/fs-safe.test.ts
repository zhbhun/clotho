// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { readJsonFile, writeJsonAtomic } from './fs-safe'

describe('readJsonFile', () => {
  it('returns the parsed object', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fs-safe-'))
    try {
      const filePath = path.join(dir, 'data.json')
      await writeFile(filePath, '{"a":1}\n', 'utf8')
      await expect(readJsonFile(filePath)).resolves.toEqual({ ok: true, value: { a: 1 } })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports missing files without throwing', async () => {
    const filePath = path.join(tmpdir(), 'fs-safe-does-not-exist.json')
    await expect(readJsonFile(filePath)).resolves.toEqual({ ok: false, reason: 'missing' })
  })

  it('reports parse failures as parse, not a crash', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fs-safe-'))
    try {
      const filePath = path.join(dir, 'broken.json')
      await writeFile(filePath, '{not json', 'utf8')
      await expect(readJsonFile(filePath)).resolves.toEqual({ ok: false, reason: 'parse' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports non-object JSON as shape failures', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fs-safe-'))
    try {
      const filePath = path.join(dir, 'array.json')
      await writeFile(filePath, '[1,2]\n', 'utf8')
      await expect(readJsonFile(filePath)).resolves.toEqual({ ok: false, reason: 'shape' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('writeJsonAtomic', () => {
  it('creates a missing file with the mutation applied', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fs-safe-'))
    try {
      const filePath = path.join(dir, 'data.json')
      const next = await writeJsonAtomic<{ mcpServers: Record<string, unknown> }>(
        filePath,
        (current) => ({ ...current, mcpServers: { a: { type: 'http' } } }),
      )
      expect(next.mcpServers).toEqual({ a: { type: 'http' } })
      expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({
        mcpServers: { a: { type: 'http' } },
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('re-reads fresh and preserves unrelated fields written after the caller read the file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fs-safe-'))
    try {
      const filePath = path.join(dir, 'data.json')
      await writeFile(filePath, '{"mcpServers":{"a":{}},"tipsHistory":[1]}\n', 'utf8')
      // Simulate a concurrent CLI rewrite landing between the caller's read and the save.
      const concurrent = writeJsonAtomic<Record<string, unknown>>(filePath, (current) => ({
        ...current,
        lastCost: 42,
      }))
      await concurrent
      await writeJsonAtomic<{ mcpServers: Record<string, unknown> }>(filePath, (current) => ({
        ...current,
        mcpServers: { b: { type: 'stdio' } },
      }))
      const saved = JSON.parse(await readFile(filePath, 'utf8'))
      expect(saved.mcpServers).toEqual({ b: { type: 'stdio' } })
      expect(saved.lastCost).toBe(42)
      expect(saved.tipsHistory).toEqual([1])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses to overwrite a file that fails to parse', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fs-safe-'))
    try {
      const filePath = path.join(dir, 'broken.json')
      await writeFile(filePath, '{broken', 'utf8')
      await expect(writeJsonAtomic(filePath, (current) => ({ ...current, x: 1 }))).rejects.toThrow(
        /failed to parse/,
      )
      expect(await readFile(filePath, 'utf8')).toBe('{broken')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('leaves no temp files behind after a failed write', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fs-safe-'))
    try {
      const filePath = path.join(dir, 'data.json')
      // Force the rename to fail: target parent replaced by a file.
      await writeFile(filePath, '{"a":1}\n', 'utf8')
      await expect(
        writeJsonAtomic(filePath, () => {
          throw new Error('mutate boom')
        }),
      ).rejects.toThrow('mutate boom')
      const entries = await (await import('node:fs/promises')).readdir(dir)
      expect(entries.filter((entry) => entry.includes('.tmp'))).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
