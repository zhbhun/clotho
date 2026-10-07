// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { menuLabels } from './application-menu'
import { textEditMenuItems } from './context-menu'

const EDIT_FLAGS = {
  canCopy: true,
  canCut: true,
  canPaste: true,
  canRedo: true,
  canSelectAll: true,
  canUndo: true,
}

describe('textEditMenuItems', () => {
  it('stays silent outside editable targets and selections', () => {
    expect(
      textEditMenuItems(
        { editFlags: EDIT_FLAGS, isEditable: false, selectionText: '' },
        menuLabels('en'),
      ),
    ).toBeUndefined()
  })

  it('offers copy only over a text selection', () => {
    expect(
      textEditMenuItems(
        { editFlags: EDIT_FLAGS, isEditable: false, selectionText: 'hi' },
        menuLabels('zh-CN'),
      ),
    ).toEqual([{ label: '复制', role: 'copy', enabled: true }])
  })

  it('offers the editing roles for editable targets and honors disabled flags', () => {
    const items = textEditMenuItems(
      {
        editFlags: { ...EDIT_FLAGS, canCut: false, canRedo: false },
        isEditable: true,
        selectionText: '',
      },
      menuLabels('en'),
    )
    expect(items).toEqual([
      { label: 'Undo', role: 'undo', enabled: true },
      { label: 'Redo', role: 'redo', enabled: false },
      { type: 'separator' },
      { label: 'Cut', role: 'cut', enabled: false },
      { label: 'Copy', role: 'copy', enabled: true },
      { label: 'Paste', role: 'paste', enabled: true },
      { type: 'separator' },
      { label: 'Select All', role: 'selectAll', enabled: true },
    ])
  })
})
