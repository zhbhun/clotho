import { ChevronRight, ListPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { ToolHeading, ToolIcon } from '../tools/shared/content'
import { TaskSummary } from '../tools/task-summary'
import type { ClaudeTaskItem } from './types'

/**
 * Collapsible row for a merged task card: one summary line (created task count)
 * expanding to the task list built by task-items.ts.
 */
export function TaskCardRow({ tasks }: { tasks: ClaudeTaskItem[] }) {
  const { t } = useTranslation()
  const translate = t as unknown as (key: string, options?: Record<string, unknown>) => string
  const [open, setOpen] = useState(false)

  return (
    <div className="min-w-0">
      <button
        aria-expanded={open}
        className="group inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-1 text-left leading-6 text-foreground-subtle outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        <ToolIcon
          className="text-foreground-subtlest transition-colors group-hover:text-foreground"
          description={translate('tools.taskCreate.description')}
          icon={ListPlus}
        />
        <ToolHeading
          name={translate('tools.TaskCreate.label')}
          summary={translate('tools.taskCreate.createdCount', { count: tasks.length })}
          summaryClassName="transition-colors group-hover:text-foreground"
        />
        <ChevronRight
          className={cn(
            'pointer-events-none size-3 shrink-0 text-foreground-subtlest opacity-0 transition-[opacity,transform] group-hover:opacity-100 group-focus-visible:opacity-100',
            open && 'rotate-90 opacity-100',
          )}
        />
      </button>
      {open ? (
        <div className="mt-2">
          <TaskSummary tasks={tasks} />
        </div>
      ) : null}
    </div>
  )
}
