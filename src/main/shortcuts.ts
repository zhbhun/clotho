import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  type CommandId,
  SHORTCUT_MODIFIERS,
  SHORTCUT_MODIFIER_KEYS,
  type ShortcutBinding,
  type ShortcutBindingIssue,
  type ShortcutOverrides,
} from '../shared/shortcuts'
import { clothoDir } from './app-data'
import { getLogger } from './logging/runtime'

const logger = getLogger('shortcuts')

const modifierKeys = new Set<string>(SHORTCUT_MODIFIER_KEYS)
const modifiers = new Set<string>(SHORTCUT_MODIFIERS)

function getShortcutBindingIssue(value: unknown): ShortcutBindingIssue | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'invalid-shape'

  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.key !== 'string' ||
    !Array.isArray(candidate.modifiers) ||
    !candidate.modifiers.every(
      (modifier) => typeof modifier === 'string' && modifiers.has(modifier),
    )
  ) {
    return 'invalid-shape'
  }
  if (candidate.key.length === 0) return 'empty-key'

  const normalizedKey = candidate.key.toLocaleLowerCase('en-US')
  if (modifierKeys.has(normalizedKey)) return 'modifier-only'
  if (
    candidate.modifiers.length === 0 &&
    (Array.from(candidate.key).length === 1 ||
      normalizedKey === 'space' ||
      normalizedKey === 'spacebar')
  ) {
    return 'bare-printable'
  }

  return null
}

function isShortcutBinding(value: unknown): value is ShortcutBinding {
  return getShortcutBindingIssue(value) === null
}

function cloneOverrides(overrides: ShortcutOverrides): ShortcutOverrides {
  return Object.fromEntries(
    Object.entries(overrides).map(([commandId, bindings]) => [
      commandId,
      bindings.map((binding) => ({ ...binding, modifiers: [...binding.modifiers] })),
    ]),
  )
}

export function sanitizeShortcutOverrides(
  value: unknown,
  onInvalid: (details: string) => void = () => undefined,
): ShortcutOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    onInvalid('root value must be an object')
    return {}
  }

  const entries: Array<[CommandId, ShortcutBinding[]]> = []
  for (const [commandId, valueBindings] of Object.entries(value)) {
    if (!commandId || !Array.isArray(valueBindings)) {
      onInvalid(`command "${commandId}" must contain a binding array`)
      continue
    }
    const bindings: ShortcutBinding[] = []
    valueBindings.forEach((binding, index) => {
      if (!isShortcutBinding(binding)) {
        onInvalid(`command "${commandId}" contains an invalid binding at index ${index}`)
        return
      }
      bindings.push({ key: binding.key, modifiers: [...binding.modifiers] })
    })
    if (bindings.length > 0 || valueBindings.length === 0) entries.push([commandId, bindings])
  }
  return Object.fromEntries(entries)
}

export function shortcutJsonPath() {
  return path.join(clothoDir(), 'shortcuts.json')
}

export async function readShortcutOverrides(
  filePath = shortcutJsonPath(),
): Promise<ShortcutOverrides> {
  try {
    let invalidCount = 0
    const overrides = sanitizeShortcutOverrides(
      JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown,
      () => {
        invalidCount += 1
      },
    )
    if (invalidCount > 0) {
      logger.warning('shortcuts.read_failed', 'Ignored invalid Clotho shortcuts', {
        filePath,
        invalidCount,
      })
    }
    return overrides
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return {}
    logger.warning('shortcuts.read_failed', 'Failed to read Clotho shortcuts', {
      errorName: caught instanceof Error ? caught.name : 'Error',
      filePath,
    })
    return {}
  }
}

export async function writeShortcutOverrides(
  overrides: ShortcutOverrides,
  filePath = shortcutJsonPath(),
) {
  const parent = path.dirname(filePath)
  const temporary = path.join(parent, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}`)
  await fs.mkdir(parent, { recursive: true })

  try {
    await fs.writeFile(temporary, `${JSON.stringify(overrides, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    await fs.rename(temporary, filePath)
  } finally {
    await fs.unlink(temporary).catch(() => undefined)
  }
}

export function createShortcutStore(
  initialOverrides: ShortcutOverrides,
  persist: (overrides: ShortcutOverrides) => Promise<void> = writeShortcutOverrides,
) {
  let current = cloneOverrides(initialOverrides)
  let tail: Promise<unknown> = Promise.resolve()

  function update(updater: (overrides: ShortcutOverrides) => ShortcutOverrides) {
    const result = tail.then(async () => {
      const next = cloneOverrides(updater(cloneOverrides(current)))
      await persist(next)
      current = next
      return cloneOverrides(current)
    })
    tail = result.catch(() => undefined)
    return result
  }

  return {
    get() {
      return cloneOverrides(current)
    },
    reset(commandId: CommandId) {
      return update((overrides) => {
        delete overrides[commandId]
        return overrides
      })
    },
    set(commandId: CommandId, bindings: ShortcutBinding[]) {
      return update((overrides) => {
        if (!Array.isArray(bindings)) throw new Error('Shortcut bindings must be an array')
        bindings.forEach((binding, index) => {
          const issue = getShortcutBindingIssue(binding)
          if (issue) throw new Error(`Invalid shortcut binding at index ${index}: ${issue}`)
        })

        return {
          ...overrides,
          [commandId]: bindings.map((binding) => ({
            ...binding,
            modifiers: [...binding.modifiers],
          })),
        }
      })
    },
  }
}

export type ShortcutStore = ReturnType<typeof createShortcutStore>
