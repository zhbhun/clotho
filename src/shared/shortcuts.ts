export const ANY_SHORTCUT_SCOPE = '*' as const

export type CommandId = string
export type ShortcutScopeId = string
export type ShortcutPlatform = 'linux' | 'mac' | 'windows'
export type ShortcutModifier = 'primary' | 'ctrl' | 'alt' | 'shift' | 'meta'

export const SHORTCUT_MODIFIERS: readonly ShortcutModifier[] = [
  'primary',
  'ctrl',
  'alt',
  'shift',
  'meta',
]

export const SHORTCUT_MODIFIER_KEYS = [
  'alt',
  'altgraph',
  'capslock',
  'control',
  'ctrl',
  'fn',
  'fnlock',
  'hyper',
  'meta',
  'numlock',
  'os',
  'scrolllock',
  'shift',
  'super',
  'symbol',
  'symbollock',
] as const

export interface ShortcutBinding {
  modifiers: readonly ShortcutModifier[]
  key: string
}

export type ShortcutBindingIssue =
  'invalid-shape' | 'empty-key' | 'modifier-only' | 'bare-printable'

export type ShortcutOverrides = Record<CommandId, ShortcutBinding[]>

export type CommandScope =
  | ShortcutScopeId
  | typeof ANY_SHORTCUT_SCOPE
  | readonly (ShortcutScopeId | typeof ANY_SHORTCUT_SCOPE)[]

export interface CommandDefinition {
  title: string
  description?: string
  scope: CommandScope
  defaultBindings: readonly ShortcutBinding[]
  allowInEditable?: boolean
  allowRepeat?: boolean
}

export type CommandCatalog = Readonly<Record<CommandId, CommandDefinition>>
