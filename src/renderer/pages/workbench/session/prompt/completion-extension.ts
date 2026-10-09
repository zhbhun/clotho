import { type Editor, Extension, type Range } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { PluginKey, type Transaction } from '@tiptap/pm/state'
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
  exitSuggestion,
} from '@tiptap/suggestion'

import type { ClaudeSlashCommand, ProjectFileSearchEntry } from '../../../../services/claude/claude'

export type FileCompletionItem = ProjectFileSearchEntry

export type EditorCompletionKind = 'file' | 'slash'

export type SlashCompletionSnapshot = {
  kind: 'slash'
  command: (item: ClaudeSlashCommand) => void
  clientRect?: (() => DOMRect | null) | null
  items: ClaudeSlashCommand[]
  query: string
  range: Range
}

export type FileCompletionSnapshot = {
  kind: 'file'
  command: (item: FileCompletionItem) => void
  clientRect?: (() => DOMRect | null) | null
  items: FileCompletionItem[]
  query: string
  range: Range
}

export type EditorCompletionSnapshot = FileCompletionSnapshot | SlashCompletionSnapshot

export type EditorCompletionBridge = {
  enabled: () => boolean
  fileItems: (query: string) => FileCompletionItem[]
  onChange: (snapshot: EditorCompletionSnapshot | null) => void
  onKeyDown: (kind: EditorCompletionKind, event: KeyboardEvent) => boolean
  selectFile: (editor: Editor, range: Range, item: FileCompletionItem) => void
  selectSlash: (editor: Editor, range: Range, item: ClaudeSlashCommand) => void
  slashItems: (query: string) => ClaudeSlashCommand[]
}

const allowedCompletionPrefixes = [' ', '\n', '\t']

const COMPLETION_WHITESPACE_PATTERN = /[\s\u200b]/

function characterAt(doc: ProseMirrorNode, pos: number) {
  if (pos < 0) return ''
  return doc.textBetween(pos, pos + 1, '\n', '\u0000')
}

/**
 * A fresh activation only opens the file menu when the trigger itself was just
 * typed or inserted, or when the cursor sits right after a path separator with
 * nothing but whitespace (or the end) ahead — pasted paths and cursor moves
 * into an existing `@path` must stay quiet.
 */
function shouldShowFileCompletion({
  editor,
  transaction,
}: {
  editor: Editor
  transaction: Transaction
}) {
  // Plugin apply runs while editor.state still is the pre-transaction state,
  // so this reads whether the menu was already open before this change.
  if (fileCompletionPluginKey.getState(editor.state)?.active) return true
  const { selection } = transaction
  if (!selection.empty) return false
  const charBefore = characterAt(transaction.doc, selection.from - 1)
  if (transaction.docChanged) return charBefore === '@'
  const charAfter = characterAt(transaction.doc, selection.from)
  return charBefore === '/' && (charAfter === '' || COMPLETION_WHITESPACE_PATTERN.test(charAfter))
}

export const slashCompletionPluginKey = new PluginKey('slashCompletion')
export const fileCompletionPluginKey = new PluginKey('fileCompletion')

const editorCompletionBridges = new WeakMap<Editor, EditorCompletionBridge>()

function emptyBridge(): EditorCompletionBridge {
  return {
    enabled: () => true,
    fileItems: () => [],
    onChange: () => undefined,
    onKeyDown: () => false,
    selectFile: () => undefined,
    selectSlash: () => undefined,
    slashItems: () => [],
  }
}

export function setEditorCompletionBridge(editor: Editor, bridge: EditorCompletionBridge) {
  editorCompletionBridges.set(editor, bridge)
}

function slashSnapshot(
  props: SuggestionProps<ClaudeSlashCommand, ClaudeSlashCommand>,
): SlashCompletionSnapshot {
  return {
    kind: 'slash',
    clientRect: props.clientRect,
    command: props.command,
    items: props.items,
    query: props.query,
    range: props.range,
  }
}

function fileSnapshot(
  props: SuggestionProps<FileCompletionItem, FileCompletionItem>,
): FileCompletionSnapshot {
  return {
    kind: 'file',
    clientRect: props.clientRect,
    command: props.command,
    items: props.items,
    query: props.query,
    range: props.range,
  }
}

function completionKeyDown(
  bridge: () => EditorCompletionBridge,
  kind: EditorCompletionKind,
  props: SuggestionKeyDownProps,
) {
  return bridge().onKeyDown(kind, props.event)
}

export function exitEditorCompletion(editor: Editor, kind?: EditorCompletionKind) {
  if (!editor.view) return
  if (!kind || kind === 'slash') exitSuggestion(editor.view, slashCompletionPluginKey)
  if (!kind || kind === 'file') exitSuggestion(editor.view, fileCompletionPluginKey)
}

export const EditorCompletion = Extension.create({
  name: 'editorCompletion',

  addProseMirrorPlugins() {
    const bridge = () => editorCompletionBridges.get(this.editor) ?? emptyBridge()

    return [
      Suggestion<ClaudeSlashCommand, ClaudeSlashCommand>({
        editor: this.editor,
        char: '/',
        allowedPrefixes: allowedCompletionPrefixes,
        allow: () => bridge().enabled(),
        pluginKey: slashCompletionPluginKey,
        items: ({ query }) => bridge().slashItems(query),
        command: ({ editor, range, props }) => bridge().selectSlash(editor, range, props),
        render: () => ({
          onStart: (props) => bridge().onChange(slashSnapshot(props)),
          onUpdate: (props) => bridge().onChange(slashSnapshot(props)),
          onExit: () => bridge().onChange(null),
          onKeyDown: (props) => completionKeyDown(bridge, 'slash', props),
        }),
      }),
      Suggestion<FileCompletionItem, FileCompletionItem>({
        editor: this.editor,
        char: '@',
        allowedPrefixes: allowedCompletionPrefixes,
        allow: () => bridge().enabled(),
        pluginKey: fileCompletionPluginKey,
        items: ({ query }) => bridge().fileItems(query),
        command: ({ editor, range, props }) => bridge().selectFile(editor, range, props),
        shouldShow: ({ editor, transaction }) => shouldShowFileCompletion({ editor, transaction }),
        render: () => ({
          onStart: (props) => bridge().onChange(fileSnapshot(props)),
          onUpdate: (props) => bridge().onChange(fileSnapshot(props)),
          onExit: () => bridge().onChange(null),
          onKeyDown: (props) => completionKeyDown(bridge, 'file', props),
        }),
      }),
    ]
  },
})
