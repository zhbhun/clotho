import { dialog } from 'electron'

import type { BrowserWindow } from 'electron'

/**
 * Native open dialogs. The main window is attached as the parent when present
 * so dialogs behave modally.
 */
let ownerWindow: BrowserWindow | undefined

export function setDialogOwnerWindow(window: BrowserWindow | undefined) {
  ownerWindow = window
}

type OpenFolderDialogOptions = {
  startingFolder?: string
}

/** Lets the user pick one directory; resolves to its absolute path or null. */
export async function showFolderPicker({ startingFolder }: OpenFolderDialogOptions = {}) {
  const options = {
    defaultPath: startingFolder,
    properties: ['openDirectory'] as Array<'openDirectory'>,
  }
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options)
  const selected = result.filePaths[0]
  return result.canceled || !selected ? null : selected
}

type OpenFilesDialogOptions = OpenFolderDialogOptions & {
  allowsMultipleSelection?: boolean
}

/** Lets the user pick one or more files; resolves to their absolute paths. */
export async function showFilesPicker({
  allowsMultipleSelection = true,
  startingFolder,
}: OpenFilesDialogOptions = {}) {
  const options = {
    defaultPath: startingFolder,
    properties: (allowsMultipleSelection
      ? ['openFile', 'multiSelections']
      : ['openFile']) as Array<'openFile' | 'multiSelections'>,
  }
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}
