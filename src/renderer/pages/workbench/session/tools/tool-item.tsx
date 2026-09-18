import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Card } from '@/shadcn/card'
import { FieldError } from '@/shadcn/field'
import { Spinner } from '@/shadcn/spinner'
import { cn } from '@/shadcn/utils'

import type {
  ClaudeImageSource,
  ClaudeToolRequest,
  ClaudeToolResult,
} from '../../../../services/claude/claude'
import type { ClaudeBackgroundTask } from '../conversation/types'
import { useWorkflowContext } from '../workflow-context'
import { getToolRenderer, getToolSummary } from './registry'
import {
  HeightCollapsible,
  ImageGallery,
  SectionLabel,
  ToolIcon,
  ToolResultNote,
} from './shared/content'
import type { CoalescedRead } from './shared/types'

export function ToolItem({
  name,
  input,
  result,
  toolUseResult,
  projectPath,
  images,
  coalescedReads,
  toolUseId,
  onOpenSubagent,
  pendingRequest,
  onRespond,
  isError,
  isRunning = false,
  backgroundTask,
  defaultOpen,
}: {
  name?: string
  input?: unknown
  result?: string
  toolUseResult?: unknown
  projectPath?: string
  images?: ClaudeImageSource[]
  coalescedReads?: CoalescedRead[]
  toolUseId?: string
  onOpenSubagent?: (toolUseId: string) => void
  pendingRequest?: ClaudeToolRequest
  onRespond?: (result: ClaudeToolResult) => Promise<void>
  isError?: boolean
  isRunning?: boolean
  backgroundTask?: ClaudeBackgroundTask
  defaultOpen?: boolean
}) {
  const { t } = useTranslation()
  const translate = t as unknown as (key: string) => string
  const workflows = useWorkflowContext()
  const renderer = getToolRenderer(name)
  const summary = getToolSummary({
    name,
    input,
    renderer,
    projectPath,
    result,
    t,
    toolUseResult,
  })
  const annotation = renderer.annotationView?.(input)
  const footer = renderer.footerView?.(input, result, images, toolUseResult, isError)
  const errorMessage = isError
    ? backgroundTask?.output?.trim() || backgroundTask?.summary?.trim() || result?.trim()
    : undefined
  const isReadCoalesced = Boolean(coalescedReads?.length)
  const itemContext = {
    name,
    input,
    result,
    toolUseResult,
    projectPath,
    images,
    coalescedReads,
    toolUseId,
    onOpenSubagent,
    pendingRequest,
    onRespond,
    isError,
    isRunning,
    backgroundTask,
  }
  const specialBody = renderer.bodyItemView?.(itemContext)
  const hasBody =
    renderer.hasBody?.(input, result, images, toolUseResult, isError) ??
    Boolean(specialBody || input || result || (images && images.length))
  const isSubagent = Boolean(
    renderer.opensSubagent && (renderer.canOpenSubagent?.(toolUseResult, Boolean(isError)) ?? true),
  )
  const naturalDefaultOpen =
    !isReadCoalesced && !renderer.itemView && renderer.label !== 'tools.Read.label' && !isSubagent
  const [open, setOpen] = useState(defaultOpen ?? naturalDefaultOpen)
  const awaitingPermission = pendingRequest?.kind === 'permission' ? pendingRequest : undefined
  const canToggle = hasBody && !isSubagent
  const canInteract = isSubagent || canToggle
  const toggleOpen = () => {
    if (hasBody) setOpen((value) => !value)
  }
  const handleItemClick = () => {
    if (isSubagent) {
      if (toolUseId) onOpenSubagent?.(toolUseId)
      return
    }
    if (canToggle) toggleOpen()
  }
  const displayLabel = [translate(renderer.label), summary].filter(Boolean).join(' ')
  const isWorkflow = name === 'Workflow' || name === 'WorkflowTool'
  const workflowRef = isWorkflow
    ? workflows.refs.find((ref) => ref.toolUseId === toolUseId)
    : undefined
  const workflowRun = workflowRef ? workflows.runs[workflowRef.runId] : undefined
  const isWorkflowTerminal =
    workflowRun?.status === 'completed' ||
    workflowRun?.status === 'failed' ||
    workflowRun?.status === 'stopped'
  const isEffectivelyRunning = isWorkflow
    ? workflowRun
      ? !isWorkflowTerminal
      : isRunning && !isError
    : isRunning
  const hasErrorStyle = Boolean(isError)
  const workItemLabelClass = cn(
    !hasErrorStyle && 'text-foreground-subtlest',
    !hasErrorStyle &&
      canInteract &&
      'group-hover:text-foreground group-focus-visible:text-foreground',
    !hasErrorStyle && isEffectivelyRunning && 'motion-safe:animate-pulse text-foreground',
  )
  const toolIcon = (
    <ToolIcon
      className={workItemLabelClass}
      description={translate(renderer.description)}
      errorMessage={errorMessage}
      icon={renderer.icon}
      isError={isError}
    />
  )

  const specialView = renderer.itemView?.(itemContext)
  if (specialView) {
    return specialView
  }

  const headerClassName = cn(
    'group inline-flex min-w-0 max-w-full items-center gap-1.5 text-left leading-6 text-foreground-subtle',
    canInteract &&
      '-mx-1 cursor-pointer rounded-sm border-0 bg-transparent px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
  )
  const headerContent = (
    <>
      {toolIcon}
      {summary ? (
        <span
          className={cn(
            'truncate font-mono text-foreground-subtlest',
            canInteract && 'group-hover:text-foreground group-focus-visible:text-foreground',
          )}
        >
          {summary}
        </span>
      ) : null}
      {canToggle ? (
        <ChevronRight
          className={cn(
            'pointer-events-none size-3 shrink-0 text-foreground-subtlest opacity-0 transition-[opacity,transform] group-hover:opacity-100 group-focus-visible:opacity-100',
            open && 'rotate-90',
          )}
        />
      ) : null}
    </>
  )

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        {canInteract ? (
          <button
            aria-expanded={canToggle ? open : undefined}
            aria-label={displayLabel}
            className={headerClassName}
            type="button"
            onClick={handleItemClick}
          >
            {headerContent}
          </button>
        ) : (
          <div aria-label={displayLabel} className={headerClassName}>
            {headerContent}
          </div>
        )}
        {awaitingPermission ? (
          <PermissionControls request={awaitingPermission} onRespond={onRespond} />
        ) : null}
      </div>

      {annotation || (open && hasBody) ? (
        <Card className="relative mt-2 gap-2 rounded-md border-border/60 bg-code-surface py-0">
          {annotation ? (
            <div className="px-3 pt-2 text-xs leading-5 text-foreground-subtlest">{annotation}</div>
          ) : null}

          {open && hasBody ? (
            <>
              <div
                className={cn(
                  'relative flex select-text flex-col gap-1 overflow-hidden rounded-md',
                  renderer.flushBody ? '' : 'px-3 py-2',
                )}
                data-testid="tool-item-body"
              >
                {specialBody ? (
                  specialBody
                ) : renderer.bodyView ? (
                  renderer.bodyView(input, result, images, toolUseResult)
                ) : (
                  <>
                    {input ? (
                      <div className="flex flex-col gap-0.5">
                        <SectionLabel>{t('tools.section.input')}</SectionLabel>
                        {renderer.inputView(input)}
                      </div>
                    ) : null}
                    {result ? (
                      <div className="flex flex-col gap-0.5">
                        <SectionLabel>{t('tools.section.output')}</SectionLabel>
                        <HeightCollapsible text={result} mono edgeOverlay />
                      </div>
                    ) : null}
                    {images && images.length ? (
                      <div className="flex flex-col gap-0.5">
                        <SectionLabel>{t('tools.section.output')}</SectionLabel>
                        <ImageGallery images={images} />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              {footer ? (
                renderer.floatingFooter ? (
                  <div className="pointer-events-none absolute bottom-1 right-2 z-10">{footer}</div>
                ) : (
                  <div className="px-3 pb-2">{footer}</div>
                )
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}
      {open && hasBody && errorMessage && !specialBody ? (
        <div className="mt-1">
          <ToolResultNote note={errorMessage} />
        </div>
      ) : null}
    </div>
  )
}

function PermissionControls({
  request,
  onRespond,
}: {
  request: ClaudeToolRequest
  onRespond?: (result: ClaudeToolResult) => Promise<void>
}) {
  const { t } = useTranslation()
  const [submittingBehavior, setSubmittingBehavior] = useState<'allow' | 'deny' | null>(null)
  const [responseError, setResponseError] = useState<string | null>(null)
  const label = request.displayName ?? request.toolName ?? t('tools.permission.defaultLabel')

  async function respond(result: ClaudeToolResult) {
    if (!onRespond || submittingBehavior) return
    setSubmittingBehavior(result.behavior === 'allow' ? 'allow' : 'deny')
    setResponseError(null)
    try {
      await onRespond(result)
    } catch {
      setResponseError(t('tools.permission.respondFailed'))
    } finally {
      setSubmittingBehavior(null)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <Button
          disabled={Boolean(submittingBehavior)}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void respond({ behavior: 'allow' })}
        >
          {submittingBehavior === 'allow' ? <Spinner data-icon="inline-start" /> : null}
          {t('tools.permission.allow')}
        </Button>
        <Button
          disabled={Boolean(submittingBehavior)}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() =>
            void respond({
              behavior: 'deny',
              message: t('tools.permission.deniedMessage', { label }),
            })
          }
        >
          {submittingBehavior === 'deny' ? <Spinner data-icon="inline-start" /> : null}
          {t('tools.permission.deny')}
        </Button>
      </div>
      {responseError ? <FieldError>{responseError}</FieldError> : null}
    </div>
  )
}
