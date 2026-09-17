import {
  SHORTCUT_MODIFIERS,
  SHORTCUT_MODIFIER_KEYS,
  type ShortcutBinding,
  type ShortcutBindingIssue,
} from '@/shared/shortcuts'

const modifierKeys = new Set<string>(SHORTCUT_MODIFIER_KEYS)
const modifiers = new Set<string>(SHORTCUT_MODIFIERS)

export function isShortcutModifierKey(key: string) {
  return modifierKeys.has(key.toLocaleLowerCase('en-US'))
}

export function getShortcutBindingIssue(value: unknown): ShortcutBindingIssue | null {
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

export function isShortcutBinding(value: unknown): value is ShortcutBinding {
  return getShortcutBindingIssue(value) === null
}
