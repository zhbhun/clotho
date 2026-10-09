import type { MenuItemConstructorOptions } from 'electron'

import type { ApplicationMenuLabels } from './menu-labels'

export type WebviewContextMenuLabels = Pick<
  ApplicationMenuLabels,
  'copy' | 'cut' | 'paste' | 'redo' | 'selectAll' | 'undo'
>

type WebviewContextMenuParams = {
  editFlags: {
    canCopy: boolean
    canCut: boolean
    canPaste: boolean
    canRedo: boolean
    canSelectAll: boolean
    canUndo: boolean
  }
  isEditable: boolean
  selectionText: string
}

/**
 * Builds the native text-editing menu for a right-click: full editing roles on
 * editable targets, plain copy over a selection, and nothing elsewhere.
 * Electron reports every context menu as handled and shows no default one, so
 * silent areas depend on this gate staying closed.
 */
export function textEditMenuItems(
  params: WebviewContextMenuParams,
  labels: WebviewContextMenuLabels,
): MenuItemConstructorOptions[] | undefined {
  const { editFlags, isEditable, selectionText } = params
  if (!isEditable && selectionText === '') {
    return undefined
  }
  if (!isEditable) {
    return [{ label: labels.copy, role: 'copy', enabled: editFlags.canCopy }]
  }
  return [
    { label: labels.undo, role: 'undo', enabled: editFlags.canUndo },
    { label: labels.redo, role: 'redo', enabled: editFlags.canRedo },
    { type: 'separator' },
    { label: labels.cut, role: 'cut', enabled: editFlags.canCut },
    { label: labels.copy, role: 'copy', enabled: editFlags.canCopy },
    { label: labels.paste, role: 'paste', enabled: editFlags.canPaste },
    { type: 'separator' },
    { label: labels.selectAll, role: 'selectAll', enabled: editFlags.canSelectAll },
  ]
}
