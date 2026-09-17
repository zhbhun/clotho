import type { TFunction } from 'i18next'

import type { CommandDefinition, CommandId } from '@/shared/shortcuts'

const COMMAND_MESSAGE_IDS: Readonly<Record<CommandId, string>> = {
  'workbench.navigation.back': 'navigationBack',
  'workbench.navigation.forward': 'navigationForward',
  'workbench.picker.permission.open': 'permissionPickerOpen',
  'workbench.picker.file.open': 'filePickerOpen',
  'workbench.picker.model.open': 'modelPickerOpen',
  'workbench.picker.project.open': 'projectPickerOpen',
  'workbench.picker.session.open': 'sessionPickerOpen',
  'workbench.session.close': 'sessionClose',
  'workbench.session.new': 'sessionNew',
  'workbench.settings.open': 'settingsOpen',
  'workbench.sidebar.session.next': 'sidebarSessionNext',
  'workbench.sidebar.session.previous': 'sidebarSessionPrevious',
  'workbench.sidebar.toggle': 'sidebarToggle',
  'workbench.tab.next': 'tabNext',
  'workbench.tab.previous': 'tabPrevious',
}

export function localizeCommand(
  commandId: CommandId,
  definition: CommandDefinition,
  t: TFunction,
): CommandDefinition {
  const position = /^workbench\.tab\.activate\.([1-9])$/.exec(commandId)?.[1]
  const messageId = position ? 'tabActivate' : COMMAND_MESSAGE_IDS[commandId]
  if (!messageId) return definition

  const options = position ? { position } : undefined
  return {
    ...definition,
    description: String(t(`shortcut.command.${messageId}.description` as never, options as never)),
    title: String(t(`shortcut.command.${messageId}.title` as never, options as never)),
  }
}
