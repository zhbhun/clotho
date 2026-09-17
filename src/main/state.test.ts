// @vitest-environment node
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createStateStore, readState, writeState } from './state'

describe('recoverable application state', () => {
  let directory: string
  let filePath: string

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clotho-state-'))
    filePath = path.join(directory, 'state.json')
  })

  afterEach(async () => {
    await fs.rm(directory, { force: true, recursive: true })
  })

  test('uses an empty state when the file does not exist', async () => {
    await expect(readState(filePath)).resolves.toEqual({})
  })

  test('round-trips recoverable state without discarding unrelated fields', async () => {
    const state = {
      ui: { sidebarWidth: 318 },
      window: { isMaximized: true },
    }

    await writeState(state, filePath)

    await expect(readState(filePath)).resolves.toEqual(state)
  })

  test('serializes concurrent updates so later state keeps earlier fields', async () => {
    const store = createStateStore({ ui: { sidebarWidth: 318 } }, (state) =>
      writeState(state, filePath),
    )

    await Promise.all([
      store.update({ window: { isMaximized: false } }),
      store.update({ recentProject: '/projects/clotho' }),
    ])

    await expect(readState(filePath)).resolves.toEqual({
      ui: { sidebarWidth: 318 },
      window: { isMaximized: false },
      recentProject: '/projects/clotho',
    })
  })

  test('rejects a malformed state document instead of losing it silently', async () => {
    await fs.writeFile(filePath, '[]', 'utf8')

    await expect(readState(filePath)).rejects.toThrow('Clotho state must be a JSON object')
  })
})
