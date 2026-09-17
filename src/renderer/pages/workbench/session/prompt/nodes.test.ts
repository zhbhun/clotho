import { describe, expect, it } from 'vitest'

async function loadPromptExtensions() {
  const [{ default: Document }, { default: Paragraph }, { default: Text }] = await Promise.all([
    import('@tiptap/extension-document'),
    import('@tiptap/extension-paragraph'),
    import('@tiptap/extension-text'),
  ])
  const [{ PromptAtomNavigation }, { FileMention }, { SlashCommand }] = await Promise.all([
    import('./atom-navigation'),
    import('./files'),
    import('./slash-command'),
  ])

  return [Document, Paragraph, Text, FileMention, SlashCommand, PromptAtomNavigation]
}

function pressArrow(view: { dom: HTMLElement }, key: 'ArrowLeft' | 'ArrowRight') {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
  Object.defineProperty(event, 'keyCode', {
    value: key === 'ArrowLeft' ? 37 : 39,
  })
  view.dom.dispatchEvent(event)
}

describe('prompt atomic nodes', () => {
  it('keeps file mentions and slash commands out of node selections', async () => {
    const [{ getSchema }, { NodeSelection }, extensions] = await Promise.all([
      import('@tiptap/core'),
      import('@tiptap/pm/state'),
      loadPromptExtensions(),
    ])
    const schema = getSchema(extensions)

    expect(NodeSelection.isSelectable(schema.nodes.fileMention.create())).toBe(false)
    expect(NodeSelection.isSelectable(schema.nodes.slashCommand.create())).toBe(false)
  })

  it('moves the text cursor across file mentions and slash commands in one step', async () => {
    const [{ Editor }, { TextSelection }, extensions] = await Promise.all([
      import('@tiptap/core'),
      import('@tiptap/pm/state'),
      loadPromptExtensions(),
    ])

    for (const nodeName of ['fileMention', 'slashCommand']) {
      const editor = new Editor({
        extensions,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: nodeName }],
            },
          ],
        },
      })

      editor.commands.focus()
      editor.commands.setTextSelection(2)
      pressArrow(editor.view, 'ArrowLeft')
      expect(editor.state.selection).toBeInstanceOf(TextSelection)
      expect(editor.state.selection.from).toBe(1)

      editor.commands.setTextSelection(1)
      pressArrow(editor.view, 'ArrowRight')
      expect(editor.state.selection).toBeInstanceOf(TextSelection)
      expect(editor.state.selection.from).toBe(2)

      editor.destroy()
    }
  })
})
