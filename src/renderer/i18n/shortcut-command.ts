import type { TFunction } from 'i18next'

import type { CommandDefinition, CommandId } from '@/shared/shortcuts'

const COMMAND_MESSAGE_IDS: Readonly<Record<CommandId, string>> = {
  'workbench.navigation.back': 'navigationBack',
  'workbench.navigation.forward': 'navigationForward',
  'workbench.picker.permission.open': 'permissionPickerOpen',
  'workbench.picker.allSessions.open': 'allSessionsPickerOpen',
  'workbench.picker.file.open': 'filePickerOpen',
  'workbench.picker.model.open': 'modelPickerOpen',
  'workbench.picker.project.open': 'projectPickerOpen',
  'workbench.picker.quick.open': 'quickPickerOpen',
  'workbench.picker.session.open': 'sessionPickerOpen',
  'workbench.picker.sentMessages.open': 'sentMessagesPickerOpen',
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
  const position =
    /^workbench\.tab\.activate\.([1-9])$/.exec(commandId)?.[1] ??
    /^workbench\.sidebar\.session\.activate\.([1-9])$/.exec(commandId)?.[1]
  if (!position) {
    const messageId = COMMAND_MESSAGE_IDS[commandId]
    if (!messageId) return definition
    return {
      ...definition,
      description: String(t(`shortcut.command.${messageId}.description` as never)),
      title: String(t(`shortcut.command.${messageId}.title` as never)),
    }
  }

  const messageId = commandId.startsWith('workbench.tab.activate')
    ? 'tabActivate'
    : 'sidebarSessionActivate'
  const options = { position }
  return {
    ...definition,
    description: String(t(`shortcut.command.${messageId}.description` as never, options as never)),
    title: String(t(`shortcut.command.${messageId}.title` as never, options as never)),
  }
}
