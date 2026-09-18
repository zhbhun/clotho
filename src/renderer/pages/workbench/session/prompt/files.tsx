import { type JSONContent, Node, mergeAttributes } from '@tiptap/core'
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { File, FileCode, FileText, ImageIcon, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Popover, PopoverContent, PopoverTrigger } from '@/shadcn/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'

import type { ProjectFileSearchEntry } from '../../../../services/claude/claude'

export type PromptFileMimeKind = 'code' | 'file' | 'image' | 'markdown' | 'text'

export type PromptFileReference = {
  path: string
  name: string
  mimeKind: PromptFileMimeKind
}

const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
const PREVIEW_CLOSE_DELAY = 100
const PREVIEW_DELAY = 300
const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx', 'markdown'])
const TEXT_EXTENSIONS = new Set(['csv', 'log', 'txt'])
const CODE_EXTENSIONS = new Set([
  'css',
  'go',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'py',
  'rs',
  'sh',
  'sql',
  'swift',
  'ts',
  'tsx',
  'yaml',
  'yml',
])

function basename(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath
}

function extension(filePath: string) {
  const name = basename(filePath)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function classifyPath(filePath: string): PromptFileMimeKind {
  const ext = extension(filePath)
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  return 'file'
}

export function fileReferenceFromPath(path: string): PromptFileReference {
  return {
    path,
    name: basename(path),
    mimeKind: classifyPath(path),
  }
}

export function fileReferenceFromSearchEntry(entry: ProjectFileSearchEntry): PromptFileReference {
  return {
    path: entry.relativePath,
    name: entry.name,
    mimeKind: entry.kind === 'directory' ? 'file' : classifyPath(entry.relativePath),
  }
}

export function fileReferenceToNode(file: PromptFileReference): JSONContent {
  return {
    type: 'fileMention',
    attrs: file,
  }
}

function fileUrlFromPath(path: string) {
  return encodeURI(`file://${path}`)
}

function FileKindIcon({ kind }: { kind: PromptFileMimeKind }) {
  if (kind === 'image') return <ImageIcon aria-hidden className="size-3.5" />
  if (kind === 'markdown' || kind === 'text') return <FileText aria-hidden className="size-3.5" />
  if (kind === 'code') return <FileCode aria-hidden className="size-3.5" />
  return <File aria-hidden className="size-3.5" />
}

function FileMentionView({ deleteNode, node }: NodeViewProps) {
  const { t } = useTranslation()
  const path = typeof node.attrs.path === 'string' ? node.attrs.path : ''
  const name = typeof node.attrs.name === 'string' ? node.attrs.name : basename(path)
  const mimeKind = (typeof node.attrs.mimeKind === 'string' ? node.attrs.mimeKind : 'file') as
    PromptFileMimeKind | string
  const safeKind: PromptFileMimeKind =
    mimeKind === 'code' ||
    mimeKind === 'file' ||
    mimeKind === 'image' ||
    mimeKind === 'markdown' ||
    mimeKind === 'text'
      ? mimeKind
      : 'file'
  const [hasImageError, setHasImageError] = useState(false)
  const showThumbnail = safeKind === 'image' && !hasImageError
  const trigger = (
    <span
      aria-label={`${name}: ${path}`}
      className="group/file mx-0.5 inline-flex h-6 max-w-56 items-center gap-1.5 rounded-md bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_8%)] px-1.5 align-top text-sm leading-6 text-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_12%)]"
      data-pointer-cursor-target=""
    />
  )
  const triggerContent = (
    <>
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm text-primary">
        {showThumbnail ? (
          <img
            alt=""
            className="size-4 object-cover group-hover/file:hidden"
            src={fileUrlFromPath(path)}
            onError={() => setHasImageError(true)}
          />
        ) : (
          <span className="group-hover/file:hidden">
            <FileKindIcon kind={safeKind} />
          </span>
        )}
        <button
          aria-label={t('workbench.prompt.removeFile', { name })}
          className="hidden size-4 items-center justify-center rounded-sm text-foreground-subtle hover:text-foreground group-hover/file:inline-flex"
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            deleteNode()
          }}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </span>
      <span className="min-w-0 truncate">{name}</span>
    </>
  )

  return (
    <NodeViewWrapper
      as="span"
      className="inline align-baseline leading-6"
      contentEditable={false}
      data-file-mention=""
    >
      {'\u200b'}
      {safeKind === 'image' ? (
        <Popover>
          <PopoverTrigger
            closeDelay={PREVIEW_CLOSE_DELAY}
            delay={PREVIEW_DELAY}
            nativeButton={false}
            openOnHover
            render={trigger}
          >
            {triggerContent}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-fit max-w-[min(32rem,calc(100vw-2rem))] gap-0 p-1"
            side="top"
            sideOffset={6}
          >
            {hasImageError ? (
              <p className="max-w-sm break-all px-2 py-1 text-foreground-subtle">{path}</p>
            ) : (
              <img
                alt={name}
                className="max-h-80 max-w-full rounded-md object-contain"
                src={fileUrlFromPath(path)}
                onError={() => setHasImageError(true)}
              />
            )}
          </PopoverContent>
        </Popover>
      ) : (
        <Tooltip>
          <TooltipTrigger render={trigger}>{triggerContent}</TooltipTrigger>
          <TooltipContent
            align="start"
            className="max-w-[min(32rem,calc(100vw-2rem))]"
            side="top"
            sideOffset={6}
          >
            <span className="block max-w-[30rem] truncate text-left [direction:rtl]">{path}</span>
          </TooltipContent>
        </Tooltip>
      )}
      {'\u200b'}
    </NodeViewWrapper>
  )
}

export const FileMention = Node.create({
  name: 'fileMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      mimeKind: { default: 'file' },
      name: { default: '' },
      path: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-file-mention]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-file-mention': '',
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileMentionView, { className: 'inline-block' })
  },
})
