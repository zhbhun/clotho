import type { ShortcutBinding, ShortcutModifier, ShortcutPlatform } from '@/shared/shortcuts'

const MODIFIER_ORDER: readonly ShortcutModifier[] = ['primary', 'ctrl', 'alt', 'shift', 'meta']
const MAC_DISPLAY_ORDER: readonly ShortcutModifier[] = ['ctrl', 'alt', 'shift', 'primary', 'meta']
const OTHER_DISPLAY_ORDER: readonly ShortcutModifier[] = ['primary', 'ctrl', 'alt', 'shift', 'meta']

const KEY_ALIASES: Readonly<Record<string, string>> = {
  ' ': 'space',
  arrowdown: 'arrowdown',
  arrowleft: 'arrowleft',
  arrowright: 'arrowright',
  arrowup: 'arrowup',
  esc: 'escape',
  return: 'enter',
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  backspace: 'Backspace',
  delete: 'Delete',
  end: 'End',
  enter: 'Enter',
  escape: 'Esc',
  home: 'Home',
  pagedown: 'Page Down',
  pageup: 'Page Up',
  space: 'Space',
  tab: 'Tab',
}

const MAC_OPTION_CODE_KEYS: Readonly<Record<string, readonly [string, string]>> = {
  Backquote: ['`', '~'],
  Backslash: ['\\', '|'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Comma: [',', '<'],
  Digit0: ['0', ')'],
  Digit1: ['1', '!'],
  Digit2: ['2', '@'],
  Digit3: ['3', '#'],
  Digit4: ['4', '$'],
  Digit5: ['5', '%'],
  Digit6: ['6', '^'],
  Digit7: ['7', '&'],
  Digit8: ['8', '*'],
  Digit9: ['9', '('],
  Equal: ['=', '+'],
  Minus: ['-', '_'],
  Period: ['.', '>'],
  Quote: ["'", '"'],
  Semicolon: [';', ':'],
  Slash: ['/', '?'],
  Space: [' ', ' '],
}

function normalizeKey(key: string) {
  const lowerKey = key.toLocaleLowerCase('en-US')
  return KEY_ALIASES[lowerKey] ?? lowerKey
}

export function shortcutEventKey(event: KeyboardEvent, platform: ShortcutPlatform) {
  if (platform !== 'mac' || !event.altKey) return event.key

  // macOS Option changes key to the typed character; code still points to the original key.
  const letterMatch = /^Key([A-Z])$/.exec(event.code)
  if (letterMatch) return letterMatch[1].toLocaleLowerCase('en-US')

  const codeKeys = MAC_OPTION_CODE_KEYS[event.code]
  return codeKeys?.[event.shiftKey ? 1 : 0] ?? event.key
}

export function normalizeShortcutBinding(binding: ShortcutBinding): ShortcutBinding {
  const modifiers = new Set(binding.modifiers)

  return {
    modifiers: MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)),
    key: normalizeKey(binding.key),
  }
}

function resolveModifier(modifier: ShortcutModifier, platform: ShortcutPlatform) {
  if (modifier !== 'primary') return modifier
  return platform === 'mac' ? 'meta' : 'ctrl'
}

export function bindingSignature(binding: ShortcutBinding, platform: ShortcutPlatform) {
  const normalized = normalizeShortcutBinding(binding)
  const modifiers = new Set(
    normalized.modifiers.map((modifier) => resolveModifier(modifier, platform)),
  )

  return `${MODIFIER_ORDER.filter(
    (modifier) => modifier !== 'primary' && modifiers.has(modifier),
  ).join('+')}|${normalized.key}`
}

export function eventMatchesShortcutBinding(
  event: KeyboardEvent,
  binding: ShortcutBinding,
  platform: ShortcutPlatform,
) {
  const modifiers: ShortcutModifier[] = []
  if (event.ctrlKey) modifiers.push('ctrl')
  if (event.altKey) modifiers.push('alt')
  if (event.shiftKey) modifiers.push('shift')
  if (event.metaKey) modifiers.push('meta')

  return (
    bindingSignature({ key: shortcutEventKey(event, platform), modifiers }, platform) ===
    bindingSignature(binding, platform)
  )
}

function modifierLabel(modifier: ShortcutModifier, platform: ShortcutPlatform) {
  if (platform === 'mac') {
    return {
      alt: '⌥',
      ctrl: '⌃',
      meta: '⌘',
      primary: '⌘',
      shift: '⇧',
    }[modifier]
  }

  return {
    alt: 'Alt',
    ctrl: 'Ctrl',
    meta: platform === 'windows' ? 'Win' : 'Meta',
    primary: 'Ctrl',
    shift: 'Shift',
  }[modifier]
}

export function formatShortcutBinding(binding: ShortcutBinding, platform: ShortcutPlatform) {
  const normalized = normalizeShortcutBinding(binding)
  const order = platform === 'mac' ? MAC_DISPLAY_ORDER : OTHER_DISPLAY_ORDER
  const modifiers = new Set(normalized.modifiers)
  const labels = order
    .filter((modifier) => modifiers.has(modifier))
    .map((modifier) => modifierLabel(modifier, platform))
  const keyLabel = KEY_LABELS[normalized.key] ?? normalized.key.toLocaleUpperCase('en-US')

  return platform === 'mac' ? `${labels.join('')}${keyLabel}` : [...labels, keyLabel].join('+')
}
