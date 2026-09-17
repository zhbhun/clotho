import { File, FileCode, FileText, Folder, ImageIcon } from 'lucide-react'
import { type Ref, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import type {
  ProjectFileSearchEntry,
  ProjectFileSearchOutlineNode,
} from '../../../../services/claude/claude'
import type { SlashCommandMenuPlacement } from './menu-position'

export type FileCompletionMenuPosition = {
  left: number
  top: number
}

export function FileCompletionMenu({
  activeIndex,
  interactionScope,
  items,
  menuRef,
  message,
  outline,
  placement,
  position,
  scrollActiveIntoView,
  onActiveIndexChange,
  onSelect,
}: {
  activeIndex: number
  interactionScope?: string
  items: ProjectFileSearchEntry[]
  menuRef?: Ref<HTMLDivElement>
  message?: string
  outline?: ProjectFileSearchOutlineNode[]
  placement: SlashCommandMenuPlacement
  position: FileCompletionMenuPosition
  query: string
  scrollActiveIntoView: boolean
  onActiveIndexChange: (activeIndex: number) => void
  onSelect: (item: ProjectFileSearchEntry) => void
}) {
  const { t } = useTranslation()
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined

  useEffect(() => {
    if (!scrollActiveIntoView || activeIndex < 0) return
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, scrollActiveIntoView])

  return createPortal(
    <div
      aria-label={t('workbench.completion.fileCompletions')}
      className="fixed z-50 flex max-h-80 items-start gap-1 overflow-visible text-popover-foreground"
      ref={menuRef}
      role="listbox"
      style={{
        left: position.left,
        top: position.top,
        width: 'min(760px, calc(100vw - 24px))',
      }}
      data-placement={placement}
      data-message-edit-surface={interactionScope}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div
        className="max-h-80 w-[31rem] max-w-[calc(100vw-24px)] min-w-0 shrink-0 overflow-y-auto rounded-lg border border-border/70 bg-popover p-1 shadow-float"
        data-glass="true"
        data-file-completion-results
      >
        {items.length > 0 ? (
          items.map((item, index) => (
            <button
              aria-selected={index === activeIndex}
              className={cn(
                'flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-sm leading-none outline-none transition-colors',
                index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70',
              )}
              key={`${item.kind}:${item.relativePath}`}
              ref={(node) => {
                optionRefs.current[index] = node
              }}
              role="option"
              type="button"
              onClick={() => onSelect(item)}
              onMouseEnter={() => onActiveIndexChange(index)}
            >
              <FileCompletionIcon item={item} />
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span
                  className="min-w-0 max-w-[18rem] shrink truncate text-sm"
                  data-file-completion-name
                >
                  {item.name}
                </span>
                {item.displayPath ? (
                  <span
                    className="min-w-0 truncate text-xs text-foreground-subtlest"
                    data-file-completion-path
                  >
                    {compactHeadPath(item.displayPath)}
                  </span>
                ) : null}
              </span>
            </button>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-foreground-subtlest" role="option" aria-disabled>
            {message ?? t('workbench.completion.noFiles')}
          </div>
        )}
      </div>
      {activeItem && outline?.length ? (
        <div
          className="hidden w-72 shrink-0 self-start rounded-lg border border-border/70 bg-popover p-1.5 shadow-float md:block"
          data-glass="true"
          data-file-completion-outline
        >
          <div className="flex flex-col gap-0.5">
            {outline.map((node, index) => (
              <div
                className="flex h-6 min-w-0 items-center gap-1 rounded px-1 text-xs text-foreground-subtlest"
                key={`${node.kind}:${node.relativePath}`}
                style={{ paddingLeft: 4 + index * 16 }}
                data-file-completion-outline-row
              >
                {node.kind === 'directory' ? (
                  <Folder aria-hidden className="size-3.5 shrink-0" />
                ) : (
                  <FileCompletionIcon item={activeItem} />
                )}
                <span className="truncate">{node.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

function FileCompletionIcon({ item }: { item: Pick<ProjectFileSearchEntry, 'kind' | 'name'> }) {
  if (item.kind === 'directory') {
    return <Folder aria-hidden className="size-3.5 shrink-0 text-foreground-subtlest" />
  }

  const extension = item.name.split('.').at(-1)?.toLowerCase()
  if (extension === 'tsx' || extension === 'jsx') {
    return <FileCode aria-hidden className="size-3.5 shrink-0 text-sky-500" />
  }
  if (extension === 'ts' || extension === 'js') {
    return <FileCode aria-hidden className="size-3.5 shrink-0 text-blue-500" />
  }
  if (extension === 'md' || extension === 'mdx' || extension === 'txt') {
    return <FileText aria-hidden className="size-3.5 shrink-0 text-sky-400" />
  }
  if (extension === 'png' || extension === 'jpg' || extension === 'jpeg' || extension === 'webp') {
    return <ImageIcon aria-hidden className="size-3.5 shrink-0 text-violet-400" />
  }
  return <File aria-hidden className="size-3.5 shrink-0 text-foreground-subtlest" />
}

function compactHeadPath(displayPath: string) {
  if (displayPath.length <= 32) return displayPath
  return `.../${displayPath.slice(-28)}`
}
