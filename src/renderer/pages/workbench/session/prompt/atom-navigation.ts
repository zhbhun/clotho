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

// Chromium's native "move to beginning of line" (Cmd+Left) is a no-op when an
// inline atom chip sits at the line start: the cursor and the line start
// canonicalize to the same DOM position. Bind the macOS line-edge shortcuts
// explicitly so they move to the textblock edges instead.
function moveCursorToTextblockEdge(editor: Editor, side: 'start' | 'end') {
  const { state, view } = editor
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$cursor) return false

  const position = side === 'start' ? selection.$cursor.start() : selection.$cursor.end()
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, position)).scrollIntoView())
  return true
}

function selectToTextblockEdge(editor: Editor, side: 'start' | 'end') {
  const { state, view } = editor
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.$cursor) return false

  const position = side === 'start' ? selection.$cursor.start() : selection.$cursor.end()
  view.dispatch(
    state.tr
      .setSelection(TextSelection.create(state.doc, selection.$cursor.pos, position))
      .scrollIntoView(),
  )
  return true
}

export const PromptAtomNavigation = Extension.create({
  name: 'promptAtomNavigation',

  addKeyboardShortcuts() {
    return {
      ArrowLeft: () => moveAcrossPromptAtom(this.editor, -1),
      ArrowRight: () => moveAcrossPromptAtom(this.editor, 1),
      // Chromium's native "move to beginning of line" is a no-op when an inline
      // atom chip sits at the line start (cursor and line start canonicalize to
      // the same DOM position), so bind it explicitly.
      'Meta-ArrowLeft': () => moveCursorToTextblockEdge(this.editor, 'start'),
      'Meta-ArrowRight': () => moveCursorToTextblockEdge(this.editor, 'end'),
      'Meta-Shift-ArrowLeft': () => selectToTextblockEdge(this.editor, 'start'),
      'Meta-Shift-ArrowRight': () => selectToTextblockEdge(this.editor, 'end'),
    }
  },
})
