import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { clothoDir } from './app-data'

export type AppStorage = Record<string, unknown>

export function storageJsonPath() {
  return path.join(clothoDir(), 'storage.json')
}

function parseStorage(content: string): AppStorage {
  const parsed = JSON.parse(content) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Clotho storage must be a JSON object')
  }
  return parsed as AppStorage
}

export async function readStorage(filePath: string = storageJsonPath()): Promise<AppStorage> {
  try {
    return parseStorage(await fs.readFile(filePath, 'utf8'))
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code !== 'ENOENT') throw caught
  }
  return {}
}

export async function writeStorage(state: AppStorage, filePath: string = storageJsonPath()) {
  const parent = path.dirname(filePath)
  const temporary = path.join(parent, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}`)
  await fs.mkdir(parent, { recursive: true })

  try {
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    await fs.rename(temporary, filePath)
    await fs.chmod(filePath, 0o600)
  } finally {
    await fs.unlink(temporary).catch(() => undefined)
  }
}

function cloneStorage<T>(storage: T): T {
  return structuredClone(storage)
}

export function createStorageStore(
  initialState: AppStorage,
  persist: (state: AppStorage) => Promise<void> = writeStorage,
) {
  let current = cloneStorage(initialState)
  let tail: Promise<unknown> = Promise.resolve()

  return {
    get() {
      return cloneStorage(current)
    },
    update(patch: AppStorage): Promise<AppStorage> {
      const result = tail.then(async () => {
        const next = { ...current, ...cloneStorage(patch) }
        await persist(next)
        current = next
        return cloneStorage(current)
      })
      tail = result.catch(() => undefined)
      return result
    },
    /** Queued read-modify-write for patches that depend on the stored document. */
    transform(transformer: (state: AppStorage) => AppStorage): Promise<AppStorage> {
      const result = tail.then(async () => {
        const next = cloneStorage(transformer(cloneStorage(current)))
        await persist(next)
        current = next
        return cloneStorage(current)
      })
      tail = result.catch(() => undefined)
      return result
    },
    async flush() {
      await tail
    },
  }
}
