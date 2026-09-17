import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import Text from '@tiptap/extension-text'
import { EditorContent, useEditor } from '@tiptap/react'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { claude } from '../../../../services/claude/claude'
import type { ClaudeSlashCommand } from '../../../../services/claude/claude'
import { PromptAtomNavigation } from './atom-navigation'
import { EditorCompletion } from './completion-extension'
import { promptDocToMarkdown, restorePromptDocument } from './content'
import { FileCompletionMenu } from './file-menu'
import { FileMention, type PromptFileReference, fileReferenceToNode } from './files'
import type { SlashCommandMenuPlacement } from './menu-position'
import { SlashCommand, SlashCommandMenu, prepareSlashCommands } from './slash-command'
import { type PromptFileSearchClient, usePromptCompletion } from './use-completion'

type PromptMarkdownEditorProps = {
  autoFocus?: boolean
  availableCommands?: ClaudeSlashCommand[]
  disabled?: boolean
  fileSearchClient?: PromptFileSearchClient
  filesToInsert?: PromptFileReference[]
  interactionScope?: string
  onChange: (markdown: string) => void
  onFilesInserted?: () => void
  onSubmit: () => void
  placeholder?: string
  projectPath?: string
  ref?: Ref<PromptEditorHandle>
  slashMenuPlacement?: SlashCommandMenuPlacement
  value: string
}

/** Imperative composer actions for surfaces outside the editor (e.g. the add menu). */
export type PromptEditorHandle = {
  focus: () => void
  /** Insert a completion trigger character at the cursor to open its menu. */
  insertTrigger: (trigger: '@' | '/') => void
}

const EMPTY_SLASH_COMMANDS: ClaudeSlashCommand[] = []

const defaultFileSearchClient: PromptFileSearchClient = {
  enterWarmup: (params) => claude.enterProjectFileSearchWarmup(params),
  exitWarmup: (params) => claude.exitProjectFileSearchWarmup(params),
  getOutline: (params) => claude.getProjectFileOutline(params),
  listRootEntries: (params) => claude.listProjectRootEntries(params),
  search: (params) => claude.searchProjectFiles(params),
}

export function PromptMarkdownEditor({
  autoFocus = false,
  availableCommands = EMPTY_SLASH_COMMANDS,
  disabled = false,
  fileSearchClient = defaultFileSearchClient,
  filesToInsert = [],
  interactionScope,
  onChange,
  onFilesInserted,
  onSubmit,
  placeholder,
  projectPath,
  ref,
  slashMenuPlacement = 'below',
  value,
}: PromptMarkdownEditorProps) {
  const { t } = useTranslation()
  const onChangeRef = useRef(onChange)
  const onFilesInsertedRef = useRef(onFilesInserted)
  const onSubmitRef = useRef(onSubmit)
  const promptCommands = useMemo(() => prepareSlashCommands(availableCommands), [availableCommands])
  const extensions = useMemo(
    () => [
      Document,
      Paragraph,
      Text,
      HardBreak,
      FileMention,
      SlashCommand,
      PromptAtomNavigation,
      EditorCompletion,
      Placeholder.configure({ placeholder }),
    ],
    [placeholder],
  )
  const editor = useEditor(
    {
      content: restorePromptDocument(value, promptCommands),
      editable: !disabled,
      editorProps: {
        attributes: {
          'aria-label': t('workbench.prompt.label'),
          'data-prompt-editor': 'true',
          class:
            'prompt-markdown-editor min-h-[40px] leading-6 outline-none whitespace-pre-wrap break-words',
          role: 'textbox',
          spellcheck: 'false',
        },
        handleKeyDown(_view, event) {
          if (
            completion.completionRef.current &&
            ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)
          ) {
            return false
          }
          // The Enter that commits an IME composition arrives with keyCode 229
          // (isComposing); it confirms the candidate and must never send.
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault()
            onSubmitRef.current()
            return true
          }
          return false
        },
      },
      extensions,
      onUpdate({ editor: currentEditor }) {
        onChangeRef.current(promptDocToMarkdown(currentEditor.getJSON()))
      },
    },
    [extensions],
  )
  const completion = usePromptCompletion({
    availableCommands: promptCommands,
    client: fileSearchClient,
    disabled,
    editor,
    placement: slashMenuPlacement,
    projectPath,
    t,
  })
  const { close: closeCompletion, completionRef } = completion

  // The useEditor instance arrives after the first render, so the handle reads it
  // lazily and stays referentially stable instead of capturing a stale editor.
  const editorRef = useRef(editor)
  useLayoutEffect(() => {
    editorRef.current = editor
  }, [editor])

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        const currentEditor = editorRef.current
        if (!currentEditor) return
        currentEditor.commands.focus(undefined, { scrollIntoView: false })
      },
      insertTrigger: (trigger: '@' | '/') => {
        const currentEditor = editorRef.current
        if (!currentEditor || currentEditor.isDestroyed || disabled) return
        // Without a focused cursor (never typed into), append at the end of the prompt.
        const position = currentEditor.isFocused
          ? currentEditor.state.selection.from
          : Math.max(1, currentEditor.state.doc.content.size - 1)
        // The suggestion matcher only fires when the trigger follows whitespace or
        // starts a text block, so add the missing separator before the trigger.
        const previousChar = currentEditor.state.doc.textBetween(
          Math.max(0, position - 1),
          position,
          '\n',
          '\u0000',
        )
        const needsSeparator = previousChar !== '' && !/[\s\u200b]/.test(previousChar)
        currentEditor
          .chain()
          .focus()
          .insertContentAt(position, [
            ...(needsSeparator ? [{ type: 'text', text: ' ' }] : []),
            { type: 'text', text: trigger },
          ])
          .run()
      },
    }),
    [disabled],
  )

  useEffect(() => {
    onChangeRef.current = onChange
    onFilesInsertedRef.current = onFilesInserted
    onSubmitRef.current = onSubmit
  }, [onChange, onFilesInserted, onSubmit])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (autoFocus && editor && !editor.isDestroyed) {
      editor.commands.focus('end', { scrollIntoView: false })
    }
  }, [autoFocus, editor])

  useEffect(() => {
    if (disabled && completionRef.current) closeCompletion()
  }, [closeCompletion, completionRef, disabled])

  useEffect(() => {
    if (!editor) return
    let isCancelled = false
    queueMicrotask(() => {
      if (isCancelled || editor.isDestroyed) return
      const restored = restorePromptDocument(value, promptCommands)
      if (promptDocToMarkdown(editor.getJSON()) !== value) {
        editor.commands.setContent(restored, { emitUpdate: false })
      }
    })
    return () => {
      isCancelled = true
    }
  }, [editor, promptCommands, value])

  useEffect(() => {
    if (!editor || editor.isDestroyed || filesToInsert.length === 0) return
    let isCancelled = false
    queueMicrotask(() => {
      if (isCancelled || editor.isDestroyed) return
      const insertPosition = editor.isFocused
        ? editor.state.selection.to
        : Math.max(1, editor.state.doc.content.size - 1)
      editor.commands.insertContentAt(
        insertPosition,
        filesToInsert.flatMap((file) => [fileReferenceToNode(file), { type: 'text', text: ' ' }]),
      )
      onFilesInsertedRef.current?.()
    })
    return () => {
      isCancelled = true
    }
  }, [editor, filesToInsert])

  return (
    <>
      <EditorContent
        className={cn(
          'min-h-[40px] max-h-[360px] cursor-text overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          disabled && 'cursor-not-allowed opacity-60',
        )}
        editor={editor}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (completion.completionRef.current && (event.key === 'Enter' || event.key === 'Tab')) {
            event.preventDefault()
          }
          if (
            !completion.completionRef.current &&
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault()
          }
        }}
      />
      {completion.completion?.kind === 'slash' && completion.position ? (
        <SlashCommandMenu
          activeIndex={completion.completion.activeIndex}
          availableCommandCount={promptCommands.length}
          commands={completion.completion.items}
          interactionScope={interactionScope}
          menuRef={completion.menuRef}
          placement={slashMenuPlacement}
          position={completion.position}
          query={completion.completion.query}
          scrollActiveIntoView={completion.completion.scrollActiveIntoView}
          onActiveIndexChange={(activeIndex) =>
            completion.setCompletion((current) =>
              current ? { ...current, activeIndex, scrollActiveIntoView: false } : current,
            )
          }
          onSelect={completion.selectSlashCommand}
        />
      ) : null}
      {completion.completion?.kind === 'file' && completion.position ? (
        <FileCompletionMenu
          activeIndex={completion.displayedFileActiveIndex}
          items={completion.displayedFileItems}
          interactionScope={interactionScope}
          menuRef={completion.menuRef}
          message={completion.fileState.message}
          outline={completion.fileState.outline}
          placement={slashMenuPlacement}
          position={completion.position}
          query={completion.completion.query}
          scrollActiveIntoView={completion.completion.scrollActiveIntoView}
          onActiveIndexChange={(activeIndex) =>
            completion.setCompletion((current) =>
              current?.kind === 'file'
                ? { ...current, activeIndex, scrollActiveIntoView: false }
                : current,
            )
          }
          onSelect={completion.selectFileItem}
        />
      ) : null}
    </>
  )
}
