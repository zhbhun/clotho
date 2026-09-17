import {
  ANY_SHORTCUT_SCOPE,
  type CommandCatalog,
  type CommandScope,
  type ShortcutPlatform,
} from '@/shared/shortcuts'

import { bindingSignature } from './bindings'
import { findShortcutConflicts } from './resolver'
import { getShortcutBindingIssue } from './validation'

function toScopes(scope: CommandScope) {
  return Array.isArray(scope) ? scope : [scope as string]
}

export function validateCommandCatalog(catalog: CommandCatalog, platform: ShortcutPlatform) {
  for (const [commandId, definition] of Object.entries(catalog)) {
    const scopes = toScopes(definition.scope)
    if (scopes.length === 0) throw new Error(`Command ${commandId} must declare a scope`)
    if (scopes.includes(ANY_SHORTCUT_SCOPE) && scopes.length > 1) {
      throw new Error(`Command ${commandId} cannot combine "*" with other scopes`)
    }

    const signatures = new Set<string>()
    for (const binding of definition.defaultBindings) {
      const issue = getShortcutBindingIssue(binding)
      if (issue) throw new Error(`Invalid default keybinding for command ${commandId}: ${issue}`)

      const signature = bindingSignature(binding, platform)
      if (signatures.has(signature)) {
        throw new Error(`Duplicate default keybinding for command ${commandId}`)
      }
      signatures.add(signature)

      const hardConflict = findShortcutConflicts({
        binding,
        catalog,
        commandId,
        overrides: {},
        platform,
      }).find((conflict) => conflict.type === 'hard')
      if (hardConflict) {
        throw new Error(
          `Default keybinding conflict between ${commandId} and ${hardConflict.commandId}`,
        )
      }
    }
  }
}

const WORKBENCH_COMMAND = {
  allowInEditable: true,
  allowRepeat: false,
  scope: 'workbench',
} as const

export const commandCatalog: CommandCatalog = {
  'workbench.sidebar.toggle': {
    ...WORKBENCH_COMMAND,
    title: 'Toggle sidebar',
    description: 'Expand or collapse the workbench sidebar.',
    defaultBindings: [{ modifiers: ['primary'], key: 'b' }],
  },
  'workbench.session.new': {
    ...WORKBENCH_COMMAND,
    title: 'New conversation',
    description: 'Create a new conversation and focus the input.',
    defaultBindings: [{ modifiers: ['primary'], key: 'n' }],
  },
  'workbench.session.close': {
    ...WORKBENCH_COMMAND,
    title: 'Close current conversation',
    description: 'Close the current conversation tab without deleting its history.',
    defaultBindings: [{ modifiers: ['primary'], key: 'w' }],
  },
  'workbench.navigation.back': {
    ...WORKBENCH_COMMAND,
    title: 'Back',
    description: 'Return to the previously visited project or conversation location.',
    defaultBindings: [{ modifiers: ['primary'], key: '[' }],
  },
  'workbench.navigation.forward': {
    ...WORKBENCH_COMMAND,
    title: 'Forward',
    description: 'Move forward to the next visited project or conversation location.',
    defaultBindings: [{ modifiers: ['primary'], key: ']' }],
  },
  'workbench.tab.next': {
    ...WORKBENCH_COMMAND,
    title: 'Next conversation tab',
    description: 'Cycle to the next open conversation tab in the current workspace.',
    defaultBindings: [{ modifiers: ['ctrl'], key: 'tab' }],
  },
  'workbench.tab.previous': {
    ...WORKBENCH_COMMAND,
    title: 'Previous conversation tab',
    description: 'Cycle to the previous open conversation tab in the current workspace.',
    defaultBindings: [{ modifiers: ['ctrl', 'shift'], key: 'tab' }],
  },
  'workbench.sidebar.session.previous': {
    ...WORKBENCH_COMMAND,
    title: 'Previous sidebar session',
    description: 'Switch to the previous session in sidebar order.',
    defaultBindings: [{ modifiers: ['primary', 'shift'], key: 'arrowleft' }],
  },
  'workbench.sidebar.session.next': {
    ...WORKBENCH_COMMAND,
    title: 'Next sidebar session',
    description: 'Switch to the next session in sidebar order.',
    defaultBindings: [{ modifiers: ['primary', 'shift'], key: 'arrowright' }],
  },
  'workbench.settings.open': {
    ...WORKBENCH_COMMAND,
    title: 'Open settings',
    description: 'Open the application settings page.',
    defaultBindings: [{ modifiers: ['primary'], key: ',' }],
  },
  'workbench.picker.model.open': {
    ...WORKBENCH_COMMAND,
    title: 'Open model picker',
    description: 'Open the model picker in the current conversation input.',
    defaultBindings: [{ modifiers: ['ctrl', 'shift'], key: 'm' }],
  },
  'workbench.picker.permission.open': {
    ...WORKBENCH_COMMAND,
    title: 'Open permission picker',
    description: 'Open the permission picker in the current conversation input.',
    defaultBindings: [{ modifiers: ['ctrl', 'shift'], key: 'a' }],
  },
  'workbench.picker.project.open': {
    ...WORKBENCH_COMMAND,
    title: 'Open project picker',
    description: 'Open the project picker to enter the Claude home or switch projects.',
    defaultBindings: [{ modifiers: ['primary', 'alt'], key: 'p' }],
  },
  'workbench.picker.session.open': {
    ...WORKBENCH_COMMAND,
    title: 'Open session picker',
    description: 'Open the historical session picker for the current workspace.',
    defaultBindings: [{ modifiers: ['primary', 'alt', 'shift'], key: 'p' }],
  },
  'workbench.picker.file.open': {
    ...WORKBENCH_COMMAND,
    title: 'Choose file',
    description:
      'Open the system file picker and add the selected file to the current conversation.',
    defaultBindings: [{ modifiers: ['primary'], key: 'o' }],
  },
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => {
      const position = index + 1
      return [
        `workbench.tab.activate.${position}`,
        {
          ...WORKBENCH_COMMAND,
          title: `Go to session ${position}`,
          description: `Switch to session ${position} in the current workspace tab bar.`,
          defaultBindings: [{ modifiers: ['primary'], key: String(position) }],
        },
      ]
    }),
  ),
}
