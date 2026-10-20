// @vitest-environment node
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createStorageStore, readStorage, writeStorage } from './storage'

describe('application storage', () => {
  let directory: string
  let filePath: string

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clotho-storage-'))
    filePath = path.join(directory, 'storage.json')
  })

  afterEach(async () => {
    await fs.rm(directory, { force: true, recursive: true })
  })

  test('uses an empty storage when no document exists', async () => {
    await expect(readStorage(filePath)).resolves.toEqual({})
  })

  test('round-trips storage without discarding unrelated fields', async () => {
    const storage = {
      ui: { sidebarWidth: 318 },
      windowsState: { lastActiveWindow: 'a', openedWindows: [{ id: 'a' }] },
    }

    await writeStorage(storage, filePath)

    await expect(readStorage(filePath)).resolves.toEqual(storage)
  })

  test('serializes concurrent updates so later updates keep earlier fields', async () => {
    const store = createStorageStore({ ui: { sidebarWidth: 318 } }, (state) =>
      writeStorage(state, filePath),
    )

    await Promise.all([
      store.update({ windowsState: { openedWindows: [] } }),
      store.update({ recentProject: '/projects/clotho' }),
    ])

    await expect(readStorage(filePath)).resolves.toEqual({
      ui: { sidebarWidth: 318 },
      windowsState: { openedWindows: [] },
      recentProject: '/projects/clotho',
    })
  })

  test('rejects a malformed storage document instead of losing it silently', async () => {
    await fs.writeFile(filePath, '[]', 'utf8')

    await expect(readStorage(filePath)).rejects.toThrow('Clotho storage must be a JSON object')
  })
})
