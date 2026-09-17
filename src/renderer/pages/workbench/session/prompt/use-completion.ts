import { type Editor, type Range } from '@tiptap/core'
import type { TFunction } from 'i18next'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type {
  ClaudeSlashCommand,
  ProjectFileSearchEntry,
  ProjectFileSearchOutline,
  ProjectFileSearchResult,
} from '../../../../services/claude/claude'
import {
  type EditorCompletionBridge,
  type EditorCompletionSnapshot,
  type FileCompletionItem,
  exitEditorCompletion,
  setEditorCompletionBridge,
} from './completion-extension'
import { fileReferenceFromSearchEntry, fileReferenceToNode } from './files'
import { type SlashCommandMenuPlacement, calculateSlashCommandMenuPosition } from './menu-position'
import { filterSlashCommands, slashCommandToNode } from './slash-command'

const SLASH_MENU_ESTIMATED_SIZE = { width: 420, height: 288 }
const FILE_MENU_ESTIMATED_SIZE = { width: 768, height: 320 }
const FILE_COMPLETION_LIMIT = 40
export type PromptFileSearchClient = {
  enterWarmup: (params: {
    projectPath?: string
  }) => Promise<{ supported: boolean; message?: string; reason?: string }>
  exitWarmup: (params: { projectPath?: string }) => Promise<void>
  getOutline: (params: {
    projectPath?: string
    relativePath: string
  }) => Promise<ProjectFileSearchOutline>
  listRootEntries: (params: {
    limit?: number
    projectPath?: string
  }) => Promise<ProjectFileSearchResult>
  search: (params: {
    limit?: number
    projectPath?: string
    query: string
  }) => Promise<ProjectFileSearchResult>
}

type DisplayedCompletion = EditorCompletionSnapshot & {
  activeIndex: number
  scrollActiveIntoView: boolean
}

type FileCompletionState = {
  items: ProjectFileSearchEntry[]
  message?: string
  outline: ProjectFileSearchOutline['nodes']
  query: string
}

function activeIndexFor(itemsLength: number) {
  return itemsLength ? 0 : -1
}

function clampActiveIndex(index: number, itemsLength: number) {
  if (!itemsLength) return -1
  return Math.max(0, Math.min(index, itemsLength - 1))
}

function useCompletionController({
  availableCommands,
  disabled,
  editor,
  fileItems,
  fileQuery,
}: {
  availableCommands: ClaudeSlashCommand[]
  disabled: boolean
  editor: Editor | null
  fileItems: ProjectFileSearchEntry[]
  fileQuery: string
}) {
  const [completion, setCompletion] = useState<DisplayedCompletion | null>(null)
  const completionRef = useRef<DisplayedCompletion | null>(null)
  const fileItemsRef = useRef<ProjectFileSearchEntry[]>([])
  const fileQueryRef = useRef('')

  useEffect(() => {
    completionRef.current = completion
  }, [completion])

  useEffect(() => {
    fileItemsRef.current = fileItems
    fileQueryRef.current = fileQuery
  }, [fileItems, fileQuery])

  const handleChange = useCallback((snapshot: EditorCompletionSnapshot | null) => {
    setCompletion((previous) => {
      if (!snapshot) return null

      const sameRange =
        previous?.kind === snapshot.kind &&
        previous.range.from === snapshot.range.from &&
        previous.range.to === snapshot.range.to
      const itemCount =
        snapshot.kind === 'file' && snapshot.items.length === 0
          ? fileItemsRef.current.length
          : snapshot.items.length

      return {
        ...snapshot,
        activeIndex: sameRange
          ? clampActiveIndex(previous.activeIndex, itemCount)
          : activeIndexFor(itemCount),
        scrollActiveIntoView: false,
      }
    })
  }, [])

  const close = useCallback(() => {
    if (editor && !editor.isDestroyed) {
      exitEditorCompletion(editor, completionRef.current?.kind)
    }
    setCompletion(null)
  }, [editor])

  const moveActive = useCallback((delta: number) => {
    setCompletion((current) => {
      const itemsLength =
        current?.kind === 'file' ? fileItemsRef.current.length : (current?.items.length ?? 0)
      if (!current || itemsLength === 0) return current
      const activeIndex = clampActiveIndex(current.activeIndex + delta, itemsLength)

      return {
        ...current,
        activeIndex,
        scrollActiveIntoView: activeIndex !== current.activeIndex,
      }
    })
  }, [])

  const selectActive = useCallback(() => {
    const current = completionRef.current
    if (!current || current.activeIndex < 0) return true
    const item =
      current.kind === 'file'
        ? fileItemsRef.current[current.activeIndex]
        : current.items[current.activeIndex]
    if (!item) return true

    if (current.kind === 'slash') {
      current.command(item as ClaudeSlashCommand)
    } else {
      current.command(item as FileCompletionItem)
    }
    setCompletion(null)
    return true
  }, [])

  const handleKeyDown = useCallback(
    (kind: DisplayedCompletion['kind'], event: globalThis.KeyboardEvent) => {
      const current = completionRef.current
      if (!current || current.kind !== kind) return false

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        moveActive(event.key === 'ArrowDown' ? 1 : -1)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        return selectActive()
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return true
      }
      return false
    },
    [close, moveActive, selectActive],
  )

  const insertSlash = useCallback(
    (
      completionEditor: Parameters<EditorCompletionBridge['selectSlash']>[0],
      range: Range,
      command: ClaudeSlashCommand,
    ) => {
      completionEditor
        .chain()
        .focus()
        .insertContentAt(range, [slashCommandToNode(command), { type: 'text', text: ' ' }])
        .setTextSelection(range.from + 2)
        .run()
    },
    [],
  )

  const insertFile = useCallback(
    (
      completionEditor: Parameters<EditorCompletionBridge['selectFile']>[0],
      range: Range,
      item: FileCompletionItem,
    ) => {
      completionEditor
        .chain()
        .focus()
        .insertContentAt(range, [
          fileReferenceToNode(fileReferenceFromSearchEntry(item)),
          { type: 'text', text: ' ' },
        ])
        .setTextSelection(range.from + 2)
        .run()
    },
    [],
  )

  useLayoutEffect(() => {
    if (!editor) return
    setEditorCompletionBridge(editor, {
      enabled: () => !disabled,
      fileItems: (query) => (fileQueryRef.current === query ? fileItemsRef.current : []),
      onChange: handleChange,
      onKeyDown: handleKeyDown,
      selectFile: insertFile,
      selectSlash: insertSlash,
      slashItems: (query: string) => filterSlashCommands(availableCommands, query),
    })
  }, [availableCommands, disabled, editor, handleChange, handleKeyDown, insertFile, insertSlash])

  return { close, completion, completionRef, setCompletion }
}

function useFileCompletion({
  client,
  completion,
  projectPath,
  setCompletion,
  setState,
  t,
}: {
  client: PromptFileSearchClient
  completion: DisplayedCompletion | null
  projectPath?: string
  setCompletion: React.Dispatch<React.SetStateAction<DisplayedCompletion | null>>
  setState: React.Dispatch<React.SetStateAction<FileCompletionState>>
  t: TFunction
}) {
  useEffect(() => {
    if (completion?.kind !== 'file') return
    if (!projectPath) {
      setState({
        items: [],
        message: t('workbench.completion.fileSearchUnsupported'),
        outline: [],
        query: '',
      })
      return
    }

    let isCancelled = false
    void client.enterWarmup({ projectPath }).then((capability) => {
      if (isCancelled || capability.supported) return
      setState({
        items: [],
        message:
          capability.reason === 'missing-project' || capability.reason === 'unsafe-root'
            ? t('workbench.completion.fileSearchUnsupported')
            : (capability.message ?? t('workbench.completion.fileSearchUnsupported')),
        outline: [],
        query: '',
      })
    })

    return () => {
      isCancelled = true
      void client.exitWarmup({ projectPath })
    }
  }, [client, completion?.kind, projectPath, setState, t])

  useEffect(() => {
    if (completion?.kind !== 'file') return
    const query = completion.query
    if (!projectPath) {
      setCompletion((current) =>
        current?.kind === 'file'
          ? { ...current, activeIndex: -1, items: [], scrollActiveIntoView: false }
          : current,
      )
      return
    }

    let isCancelled = false
    const request = query.trim()
      ? client.search({ limit: FILE_COMPLETION_LIMIT, projectPath, query })
      : client.listRootEntries({ limit: FILE_COMPLETION_LIMIT, projectPath })

    void request.then((result) => {
      if (isCancelled) return
      const items = result.supported ? result.items : []
      const message = result.supported
        ? items.length
          ? undefined
          : t('workbench.completion.noFiles')
        : result.reason === 'missing-project' || result.reason === 'unsafe-root'
          ? t('workbench.completion.fileSearchUnsupported')
          : (result.message ?? t('workbench.completion.fileSearchUnsupported'))

      setState((current) => ({ items, message, outline: current.outline, query }))
      setCompletion((current) => {
        if (!current || current.kind !== 'file' || current.query !== query) return current
        return {
          ...current,
          activeIndex: clampActiveIndex(current.activeIndex, items.length),
          items,
          scrollActiveIntoView: false,
        }
      })
    })

    return () => {
      isCancelled = true
    }
  }, [client, completion?.kind, completion?.query, projectPath, setCompletion, setState, t])

  useEffect(() => {
    if (completion?.kind !== 'file' || !projectPath || completion.activeIndex < 0) return
    const item = completion.items[completion.activeIndex]
    if (!item) return

    let isCancelled = false
    void client.getOutline({ projectPath, relativePath: item.relativePath }).then((outline) => {
      if (isCancelled || !outline.supported) return
      setState((current) => ({ ...current, outline: outline.nodes }))
    })

    return () => {
      isCancelled = true
    }
  }, [client, completion?.activeIndex, completion?.items, completion?.kind, projectPath, setState])
}

function viewportSize() {
  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  }
}

function completionAnchorRect(completion: DisplayedCompletion) {
  return completion.clientRect?.() ?? new DOMRect(0, 0, 0, 0)
}

function useCompletionMenu(
  completion: DisplayedCompletion | null,
  placement: SlashCommandMenuPlacement,
  close: () => void,
) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<ReturnType<
    typeof calculateSlashCommandMenuPosition
  > | null>(null)

  useLayoutEffect(() => {
    if (!completion) {
      setPosition(null)
      return
    }
    const menuRect = menuRef.current?.getBoundingClientRect()
    const estimatedSize =
      completion.kind === 'file' ? FILE_MENU_ESTIMATED_SIZE : SLASH_MENU_ESTIMATED_SIZE
    setPosition(
      calculateSlashCommandMenuPosition({
        anchorRect: completionAnchorRect(completion),
        menuSize: {
          width: menuRect?.width || Math.min(estimatedSize.width, window.innerWidth - 24),
          height: menuRect?.height || estimatedSize.height,
        },
        placement,
        viewportSize: viewportSize(),
      }),
    )
  }, [completion, placement])

  useEffect(() => {
    if (!completion) return

    function handleDocumentPointerDown(event: MouseEvent | PointerEvent) {
      const target = event.target
      if (target instanceof globalThis.Node && menuRef.current?.contains(target)) return
      close()
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown, true)
    document.addEventListener('mousedown', handleDocumentPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
      document.removeEventListener('mousedown', handleDocumentPointerDown, true)
    }
  }, [close, completion])

  return {
    menuRef,
    position:
      completion &&
      (position ??
        calculateSlashCommandMenuPosition({
          anchorRect: completionAnchorRect(completion),
          menuSize: SLASH_MENU_ESTIMATED_SIZE,
          placement,
          viewportSize: viewportSize(),
        })),
  }
}

export function usePromptCompletion({
  availableCommands,
  client,
  disabled,
  editor,
  placement,
  projectPath,
  t,
}: {
  availableCommands: ClaudeSlashCommand[]
  client: PromptFileSearchClient
  disabled: boolean
  editor: Editor | null
  placement: SlashCommandMenuPlacement
  projectPath?: string
  t: TFunction
}) {
  const [fileState, setFileState] = useState<FileCompletionState>({
    items: [],
    outline: [],
    query: '',
  })
  const controller = useCompletionController({
    availableCommands,
    disabled,
    editor,
    fileItems: fileState.items,
    fileQuery: fileState.query,
  })
  const { completion, setCompletion } = controller

  useEffect(() => {
    if (!fileState.items.length) return
    setCompletion((current) => {
      if (!current || current.kind !== 'file' || current.query !== fileState.query) return current
      if (current.activeIndex >= 0) return current
      return { ...current, activeIndex: 0, items: fileState.items }
    })
  }, [fileState.items, fileState.query, setCompletion])

  useEffect(() => {
    if (completion?.kind !== 'slash') return
    setCompletion((current) => {
      if (!current || current.kind !== 'slash') return current
      const items = filterSlashCommands(availableCommands, current.query)
      return {
        ...current,
        activeIndex: clampActiveIndex(current.activeIndex, items.length),
        items,
        scrollActiveIntoView: false,
      }
    })
  }, [availableCommands, completion?.kind, completion?.query, setCompletion])

  useFileCompletion({
    client,
    completion,
    projectPath,
    setCompletion,
    setState: setFileState,
    t,
  })
  const menu = useCompletionMenu(completion, placement, controller.close)
  const displayedFileItems =
    completion?.kind === 'file' ? (fileState.items.length ? fileState.items : completion.items) : []

  return {
    ...controller,
    ...menu,
    displayedFileActiveIndex:
      completion?.kind === 'file'
        ? clampActiveIndex(completion.activeIndex, displayedFileItems.length)
        : -1,
    displayedFileItems,
    fileState,
    selectFileItem(item: ProjectFileSearchEntry) {
      const current = controller.completionRef.current
      if (!current || current.kind !== 'file') return
      current.command(item)
      controller.setCompletion(null)
    },
    selectSlashCommand(command: ClaudeSlashCommand) {
      const current = controller.completionRef.current
      if (!current || current.kind !== 'slash') return
      current.command(command)
      controller.setCompletion(null)
    },
  }
}
