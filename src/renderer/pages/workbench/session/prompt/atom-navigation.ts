import { type Editor, Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

const PROMPT_ATOM_NAMES = new Set(['fileMention', 'slashCommand'])

function moveAcrossPromptAtom(editor: Editor, direction: -1 | 1) {
  const { doc, selection } = editor.state
  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$cursor) return false

  const node = direction < 0 ? selection.$cursor.nodeBefore : selection.$cursor.nodeAfter
  if (!node || !PROMPT_ATOM_NAMES.has(node.type.name)) return false

  const position = selection.$cursor.pos + (direction < 0 ? -node.nodeSize : node.nodeSize)
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, position)))
  return true
}

export const PromptAtomNavigation = Extension.create({
  name: 'promptAtomNavigation',

  addKeyboardShortcuts() {
    return {
      ArrowLeft: () => moveAcrossPromptAtom(this.editor, -1),
      ArrowRight: () => moveAcrossPromptAtom(this.editor, 1),
    }
  },
})
