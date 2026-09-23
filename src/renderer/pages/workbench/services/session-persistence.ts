import type { ClaudeAttachment, ClaudePermissionMode } from '@/shared/rpc'
import type { LocalSession } from '@/shared/session'

import { claude } from '../../../services/claude/claude'

export type SessionComposer = {
  prompt: string
  attachments?: ClaudeAttachment[]
  selectedProviderId: string | null
  selectedModelId: string | null
  selectedAgent: string | null
  permissionMode: ClaudePermissionMode
  recalledFromMessage?: string
}

/** Runtime representation; only LocalSession is written to disk. */
export type SessionRecord = {
  id: string
  projectId?: string | null
  projectPath?: string | null
  claudeSessionId?: string | null
  composer: SessionComposer
  contextUsage?: LocalSession['contextUsage']
}

type Storage = Pick<typeof claude, 'readLocalSession' | 'writeLocalSession' | 'deleteLocalSession'>

function fromFile(id: string, data: LocalSession): SessionRecord {
  const separator = data.input.model?.indexOf('/') ?? -1
  return {
    id: data.id ?? id,
    projectId: data.projectId,
    projectPath: data.projectPath,
    claudeSessionId: data.claudeSessionId,
    composer: {
      prompt: data.input.prompt,
      attachments: data.input.attachments,
      selectedProviderId: separator > 0 ? data.input.model!.slice(0, separator) : null,
      selectedModelId: separator > 0 ? data.input.model!.slice(separator + 1) : null,
      selectedAgent: data.input.agent,
      permissionMode: data.input.permissionMode,
      ...(data.input.recalledFromMessage
        ? { recalledFromMessage: data.input.recalledFromMessage }
        : {}),
    },
    ...(data.contextUsage ? { contextUsage: data.contextUsage } : {}),
  }
}

function toFile(record: SessionRecord): LocalSession {
  const input = record.composer
  return {
    id: record.id,
    projectId: record.projectId ?? null,
    projectPath: record.projectPath ?? null,
    claudeSessionId: record.claudeSessionId ?? null,
    input: {
      prompt: input.prompt,
      attachments: input.attachments ?? [],
      model:
        input.selectedProviderId && input.selectedModelId
          ? `${input.selectedProviderId}/${input.selectedModelId}`
          : null,
      permissionMode: input.permissionMode,
      agent: input.selectedAgent,
      ...(input.recalledFromMessage ? { recalledFromMessage: input.recalledFromMessage } : {}),
    },
    ...(record.contextUsage ? { contextUsage: record.contextUsage } : {}),
  }
}

/** Writes are write-behind: update() changes memory at once and the flush below persists every dirty record in one pass. */
const FLUSH_DELAY_MS = 200

export function createSessionPersistence(storage: Storage = claude) {
  const records = new Map<string, SessionRecord>()
  const loads = new Map<string, Promise<SessionRecord | undefined>>()
  const dirty = new Set<string>()
  // Tombstones: a load still in flight when remove() runs must not re-cache
  // the record when it resolves.
  const removed = new Set<string>()
  let tail: Promise<void> = Promise.resolve()
  let scheduledFlush:
    | {
        timer: ReturnType<typeof setTimeout>
        trigger: () => void
        done: Promise<void>
      }
    | undefined
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation)
    tail = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
  const writeDirty = async () => {
    const ids = [...dirty]
    dirty.clear()
    for (const id of ids) {
      const record = records.get(id)
      if (record) await storage.writeLocalSession(id, toFile(record))
    }
  }
  const scheduleFlush = (): Promise<void> => {
    if (!scheduledFlush) {
      let trigger!: () => void
      const ready = new Promise<void>((resolve) => {
        trigger = resolve
      })
      const timer = setTimeout(trigger, FLUSH_DELAY_MS)
      scheduledFlush = {
        timer,
        trigger,
        done: ready.then(() => {
          scheduledFlush = undefined
          return enqueue(writeDirty)
        }),
      }
    }
    return scheduledFlush.done
  }
  const get = (id: string) => {
    const record = records.get(id)
    return record ? structuredClone(record) : undefined
  }
  const load = (id: string) => {
    const record = get(id)
    if (record) return Promise.resolve(record)
    let promise = loads.get(id)
    if (!promise) {
      promise = storage.readLocalSession(id).then(
        (data) => {
          loads.delete(id)
          if (data && !removed.has(id)) records.set(id, fromFile(id, data))
          return get(id)
        },
        (error) => {
          loads.delete(id)
          throw error
        },
      )
      loads.set(id, promise as Promise<SessionRecord | undefined>)
    }
    return promise as Promise<SessionRecord | undefined>
  }
  return {
    // Startup deliberately does not read individual session files.
    async initialize() {},
    get,
    all: () => [...records.values()].map((r) => structuredClone(r)),
    load,
    update(id: string, updater: (current: SessionRecord | undefined) => SessionRecord | undefined) {
      return enqueue(async () => {
        removed.delete(id)
        await load(id)
        const next = updater(get(id))
        if (!next) return false
        records.set(id, structuredClone(next))
        dirty.add(id)
        return true
      }).then((changed) => (changed ? scheduleFlush() : undefined))
    },
    remove(id: string) {
      return enqueue(async () => {
        dirty.delete(id)
        removed.add(id)
        await storage.deleteLocalSession(id)
        records.delete(id)
        loads.delete(id)
      })
    },
    flush: () => {
      const pending = scheduledFlush
      if (pending) {
        clearTimeout(pending.timer)
        pending.trigger()
        return pending.done
      }
      return dirty.size ? enqueue(writeDirty) : tail
    },
    close() {
      if (scheduledFlush) {
        clearTimeout(scheduledFlush.timer)
        scheduledFlush = undefined
      }
      records.clear()
      loads.clear()
      dirty.clear()
      removed.clear()
    },
  }
}

export type SessionPersistence = ReturnType<typeof createSessionPersistence>
export const sessionPersistence = createSessionPersistence()
