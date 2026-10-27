import path from 'node:path'

import { readJsonFile, writeJsonAtomic } from './fs-safe'

/**
 * Hooks in `~/.claude/settings.json` use the CLI file format (design D4):
 * `hooks` maps an event name to matchers, each holding command-type hooks.
 * This module manages command-type hooks only; any other hook type the CLI
 * wrote is preserved untouched.
 */
export interface CommandHook {
  type: 'command'
  command: string
  timeout?: number
  [extra: string]: unknown
}

export interface HookMatcherEntry {
  /** Tool-name matcher; empty/absent matches every input. */
  matcher?: string
  hooks: CommandHook[]
  [extra: string]: unknown
}

export type HooksConfig = Record<string, HookMatcherEntry[]>

type SettingsFile = { hooks?: HooksConfig } & Record<string, unknown>

export interface HookGroup {
  event: string
  entries: HookMatcherEntry[]
}

export function claudeSettingsPath(
  claudeDir = path.join(process.env.HOME ?? '', '.claude'),
): string {
  return path.join(claudeDir, 'settings.json')
}

export async function listHookGroups(claudeDir?: string): Promise<HookGroup[]> {
  const read = await readJsonFile<SettingsFile>(claudeSettingsPath(claudeDir))
  if (!read.ok) return []
  return Object.entries(read.value.hooks ?? {}).map(([event, entries]) => ({
    event,
    entries,
  }))
}

/** Command-type hooks only; non-command hooks inside an entry are kept but not editable. */
export async function saveHookGroup(
  event: string,
  entries: HookMatcherEntry[],
  claudeDir?: string,
) {
  if (!event.trim()) throw new Error('A hook requires an event name')
  for (const entry of entries) {
    if (!Array.isArray(entry.hooks) || entry.hooks.length === 0) {
      throw new Error(`A hook entry for ${event} requires at least one command`)
    }
    for (const hook of entry.hooks) {
      if (hook.type !== 'command' || typeof hook.command !== 'string' || !hook.command.trim()) {
        throw new Error(`Only command-type hooks are supported (event ${event})`)
      }
    }
  }
  await writeJsonAtomic<SettingsFile>(claudeSettingsPath(claudeDir), (current) => ({
    ...current,
    hooks: { ...(current.hooks ?? {}), [event]: entries },
  }))
}

export async function deleteHookGroup(event: string, claudeDir?: string): Promise<void> {
  await writeJsonAtomic<SettingsFile>(claudeSettingsPath(claudeDir), (current) => {
    const hooks = { ...(current.hooks ?? {}) }
    delete hooks[event]
    return { ...current, hooks }
  })
}
