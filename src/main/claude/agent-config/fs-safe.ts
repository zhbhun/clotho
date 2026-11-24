import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { getLogger } from '../../logging/runtime'

const logger = getLogger('agent-config')
const writes = new Map<string, Promise<void>>()

/** A parsed JSON file, or a typed failure so callers can report without guessing. */
export type JsonReadResult<T> =
  { ok: true; value: T } | { ok: false; reason: 'missing' | 'parse' | 'shape' }

/**
 * Read a JSON file managed by both Clotho and the Claude Code CLI.
 * `missing` lets callers treat absence as an empty default; `parse` must be
 * surfaced to the user, never silently overwritten.
 */
export async function readJsonFile<T>(filePath: string): Promise<JsonReadResult<T>> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return { ok: false, reason: 'missing' }
    logger.warning('agent_config.read_failed', 'Failed to read managed JSON file', {
      context: { filePath },
      error: caught,
    })
    throw caught
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'shape' }
    }
    return { ok: true, value: parsed as T }
  } catch {
    return { ok: false, reason: 'parse' }
  }
}

/**
 * Serialize in-process mutations per file, reading fresh inside the queue.
 * Atomic replacement prevents partial JSON from being observed by the CLI.
 */
export function writeJsonAtomic<T extends object>(
  filePath: string,
  mutate: (current: T) => T,
): Promise<T> {
  const key = path.resolve(filePath)
  const result = (writes.get(key) ?? Promise.resolve()).then(() => writeJsonFile(key, mutate))
  const tail = result.then(
    () => undefined,
    () => undefined,
  )
  writes.set(key, tail)
  void tail.then(() => {
    if (writes.get(key) === tail) writes.delete(key)
  })
  return result
}

async function writeJsonFile<T extends object>(filePath: string, mutate: (current: T) => T) {
  const read = await readJsonFile<T>(filePath)
  if (read.ok === false && read.reason !== 'missing') {
    throw new Error(`Cannot save ${filePath}: managed file failed to parse`)
  }
  const current = read.ok ? read.value : ({} as T)
  const next = mutate(current)
  const parent = path.dirname(filePath)
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  await fs.mkdir(parent, { recursive: true })

  try {
    await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    await fs.rename(temporary, filePath)
    await fs.chmod(filePath, 0o600)
  } catch (caught) {
    logger.error('agent_config.write_failed', 'Failed to write managed JSON file', {
      context: { filePath },
      error: caught,
    })
    throw caught
  } finally {
    await fs.unlink(temporary).catch(() => undefined)
  }
  return next
}
