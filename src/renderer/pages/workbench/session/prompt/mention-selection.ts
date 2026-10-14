import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const MENTION_IN_SELECTION_CLASS = 'mention-in-selection'

const MENTION_NODE_NAMES = new Set(['fileMention', 'slashCommand'])

const mentionSelectionKey = new PluginKey<DecorationSet>('mentionInSelection')

/**
 * The browser never paints the native selection over the inline chips (file
 * mentions and slash commands), so mirror "the selection covers this chip" as
 * a node decoration class and let prompt.css restyle the chip with the editor
 * selection colors.
 */
export const MentionSelection = Extension.create({
  name: 'mentionSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: mentionSelectionKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, decorations) {
            if (!tr.docChanged && !tr.selectionSet) return decorations
            const { selection } = tr
            if (selection.empty) return DecorationSet.empty
            const marks: Decoration[] = []
            tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
              if (MENTION_NODE_NAMES.has(node.type.name)) {
                marks.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: MENTION_IN_SELECTION_CLASS,
                  }),
                )
              }
            })
            return marks.length > 0 ? DecorationSet.create(tr.doc, marks) : DecorationSet.empty
          },
        },
        props: {
          decorations: (state) => mentionSelectionKey.getState(state),
        },
      }),
    ]
  },
})
