import type { MessageKey } from './resources'

const APP_ERROR_KEYS: Readonly<Record<string, MessageKey>> = {
  项目数据文件无法读取: 'project.error.registryUnreadable',
  项目名称不能为空: 'project.error.nameRequired',
  '项目名称不能超过 80 个字符': 'project.error.nameTooLong',
  项目图标数据过大: 'project.error.iconTooLarge',
  项目图标无效: 'project.error.iconInvalid',
  请选择项目文件夹: 'project.error.selectFolderRequired',
  项目路径不存在: 'project.error.pathMissing',
  项目路径必须是文件夹: 'project.error.pathNotFolder',
  'Project path does not exist': 'project.error.pathMissing',
  'Project path must be a directory': 'project.error.pathNotFolder',
  找不到要编辑的项目: 'project.error.notFound',
  项目管理仅在桌面应用中可用: 'project.error.desktopOnly',
  会话名称不能为空: 'workbench.error.sessionNameRequired',
  会话不存在: 'workbench.error.sessionMissing',
  '会话尚未准备完成，请稍后再试': 'workbench.error.sessionNotReady',
}

export function appErrorKey(error: unknown): MessageKey | undefined {
  if (!(error instanceof Error)) return undefined
  return APP_ERROR_KEYS[error.message]
}
