import type { ShortcutBinding, ShortcutModifier, ShortcutPlatform } from '@/shared/shortcuts'

import { normalizeShortcutBinding, shortcutEventKey } from './bindings'
import { getShortcutBindingIssue, isShortcutModifierKey } from './validation'

type ShortcutCaptureResult =
  | { type: 'binding'; binding: ShortcutBinding }
  | { type: 'cancel' }
  | { type: 'clear' }
  | { type: 'invalid'; issue: 'bare-printable' }
  | { type: 'wait' }

function eventModifiers(event: KeyboardEvent, platform: ShortcutPlatform) {
  const modifiers: ShortcutModifier[] = []
  if (event.metaKey) modifiers.push(platform === 'mac' ? 'primary' : 'meta')
  if (event.ctrlKey) modifiers.push(platform === 'mac' ? 'ctrl' : 'primary')
  if (event.altKey) modifiers.push('alt')
  if (event.shiftKey) modifiers.push('shift')
  return modifiers
}

export function interpretShortcutCapture(
  event: KeyboardEvent,
  platform: ShortcutPlatform,
): ShortcutCaptureResult {
  if (event.isComposing) return { type: 'wait' }

  const eventKey = shortcutEventKey(event, platform)
  const key = eventKey.toLocaleLowerCase('en-US')
  if (key === 'escape') return { type: 'cancel' }
  if (isShortcutModifierKey(key)) return { type: 'wait' }

  const modifiers = eventModifiers(event, platform)
  if ((key === 'backspace' || key === 'delete') && modifiers.length === 0) {
    return { type: 'clear' }
  }
  const binding = normalizeShortcutBinding({ key: eventKey, modifiers })
  if (getShortcutBindingIssue(binding) === 'bare-printable') {
    return { issue: 'bare-printable', type: 'invalid' }
  }

  return {
    binding,
    type: 'binding',
  }
}
