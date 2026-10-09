import type { MenuItemConstructorOptions } from 'electron'

import type { AppLanguage } from '@/shared/rpc'
import type { CommandId, ShortcutBinding, ShortcutModifier } from '@/shared/shortcuts'

import type { ApplicationMenuLabels } from './menu-labels'
import { menuLabels } from './menu-labels'

export type ApplicationMenuActions = {
  /** Forward a shortcut command to the focused renderer for dispatch. */
  dispatchCommand: (commandId: CommandId) => void
  openShortcutSettings: () => void
  openTroubleshooting: () => void
  openTaskManager: () => void
}

export type ApplicationMenuOptions = {
  language: AppLanguage
  isDev: boolean
  /** While the renderer records a shortcut, accelerators must not swallow keystrokes. */
  isCaptureActive: boolean
  /**
   * Effective bindings for a command (defaults plus user overrides); the first
   * entry becomes the menu accelerator.
   */
  commandBindings: (commandId: CommandId) => readonly ShortcutBinding[]
  actions: ApplicationMenuActions
}

const ACCELERATOR_MODIFIERS: Record<ShortcutModifier, string> = {
  alt: 'Alt',
  ctrl: 'Control',
  meta: 'Meta',
  primary: 'CmdOrCtrl',
  shift: 'Shift',
}

const ACCELERATOR_KEYS: Readonly<Record<string, string>> = {
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  arrowup: 'Up',
  backspace: 'Backspace',
  delete: 'Delete',
  down: 'Down',
  end: 'End',
  enter: 'Return',
  escape: 'Esc',
  esc: 'Esc',
  home: 'Home',
  left: 'Left',
  pagedown: 'PageDown',
  pageup: 'PageUp',
  return: 'Return',
  right: 'Right',
  space: 'Space',
  spacebar: 'Space',
  tab: 'Tab',
  up: 'Up',
}

export function bindingToAccelerator(binding: ShortcutBinding): string {
  const modifiers = binding.modifiers.map((modifier) => ACCELERATOR_MODIFIERS[modifier]).join('+')
  const normalizedKey = binding.key.toLocaleLowerCase('en-US')
  const key = ACCELERATOR_KEYS[normalizedKey] ?? binding.key.toLocaleUpperCase('en-US')
  return modifiers ? `${modifiers}+${key}` : key
}

function commandMenuItem(
  label: string,
  commandId: CommandId,
  options: ApplicationMenuOptions,
): MenuItemConstructorOptions {
  const bindings = options.commandBindings(commandId)
  return {
    label,
    accelerator:
      !options.isCaptureActive && bindings.length > 0
        ? bindingToAccelerator(bindings[0])
        : undefined,
    click: () => options.actions.dispatchCommand(commandId),
  }
}

export function applicationMenuItems(options: ApplicationMenuOptions) {
  const labels: ApplicationMenuLabels = menuLabels(options.language)
  const isMac = process.platform === 'darwin'

  const items: MenuItemConstructorOptions[] = [
    {
      // macOS renders the app menu under the application name regardless of
      // this label; Electron still requires one for template validation.
      label: 'Clotho',
      submenu: [
        { label: labels.about, role: 'about' },
        { type: 'separator' },
        { label: labels.quit, role: 'quit' },
      ],
    },
    {
      label: labels.file,
      submenu: [commandMenuItem(labels.close, 'workbench.session.close', options)],
    },
    {
      label: labels.edit,
      submenu: [
        { label: labels.undo, role: 'undo' },
        { label: labels.redo, role: 'redo' },
        { type: 'separator' },
        { label: labels.cut, role: 'cut' },
        { label: labels.copy, role: 'copy' },
        { label: labels.paste, role: 'paste' },
        { label: labels.selectAll, role: 'selectAll' },
      ],
    },
    {
      label: labels.view,
      submenu: [
        commandMenuItem(labels.toggleSidebar, 'workbench.sidebar.toggle', options),
        { type: 'separator' },
        commandMenuItem(labels.quickPanel, 'workbench.picker.quick.open', options),
        commandMenuItem(labels.projectSwitcher, 'workbench.picker.project.open', options),
        commandMenuItem(labels.chatHistory, 'workbench.picker.allSessions.open', options),
        commandMenuItem(labels.sentMessages, 'workbench.picker.sentMessages.open', options),
        { type: 'separator' },
        commandMenuItem(labels.back, 'workbench.navigation.back', options),
        commandMenuItem(labels.forward, 'workbench.navigation.forward', options),
      ],
    },
    {
      label: labels.window,
      submenu: [
        { label: labels.minimize, role: 'minimize' },
        { label: labels.zoom, role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { label: labels.front, role: 'front' as const }]
          : []),
      ],
    },
    {
      label: labels.help,
      submenu: [
        { label: labels.keyboardShortcuts, click: () => options.actions.openShortcutSettings() },
        { type: 'separator' },
        { label: labels.troubleshooting, click: () => options.actions.openTroubleshooting() },
        { label: labels.taskManager, click: () => options.actions.openTaskManager() },
        ...(options.isDev
          ? [
              { type: 'separator' as const },
              // The toggleDevTools role targets the focused window and carries
              // the platform-default accelerator (Cmd+Option+I / Ctrl+Shift+I).
              { label: labels.toggleDevTools, role: 'toggleDevTools' as const },
            ]
          : []),
      ],
    },
  ]

  return items
}
