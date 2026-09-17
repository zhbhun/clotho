import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { clothoDir } from './app-data'

export type AppState = Record<string, unknown>

export function stateJsonPath() {
  return path.join(clothoDir(), 'state.json')
}

export async function readState(filePath = stateJsonPath()): Promise<AppState> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Clotho state must be a JSON object')
    }
    return parsed as AppState
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw caught
  }
}

export async function writeState(state: AppState, filePath = stateJsonPath()) {
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

function cloneState<T>(state: T): T {
  return structuredClone(state)
}

export function createStateStore(
  initialState: AppState,
  persist: (state: AppState) => Promise<void> = writeState,
) {
  let current = cloneState(initialState)
  let tail: Promise<unknown> = Promise.resolve()

  return {
    get() {
      return cloneState(current)
    },
    update(patch: AppState): Promise<AppState> {
      const result = tail.then(async () => {
        const next = { ...current, ...cloneState(patch) }
        await persist(next)
        current = next
        return cloneState(current)
      })
      tail = result.catch(() => undefined)
      return result
    },
    async flush() {
      await tail
    },
  }
}
