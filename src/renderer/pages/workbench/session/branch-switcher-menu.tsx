import { GitBranch, Plus, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/shadcn/skeleton'

import {
  MenuContent,
  MenuEmpty,
  MenuGroup,
  MenuItem,
  MenuList,
  MenuSearch,
  MenuSeparator,
} from '../../../components/menu'
import { claude } from '../../../services/claude/claude'
import type { GitBranchRef } from '../../../services/claude/claude'
import { useWorkbenchStore } from '../stores/workbench-store'

export type BranchSwitcherMenuContentProps = {
  align?: 'start' | 'end'
  onCreate: () => void
  onDismiss: () => void
  projectId: string
  projectName: string
  projectPath: string
}

/** Dropdown body for the branch button: searchable local branch rows plus the
    create action pinned below the list. */
export function BranchSwitcherMenuContent({
  align = 'start',
  onCreate,
  onDismiss,
  projectId,
  projectName,
  projectPath,
}: BranchSwitcherMenuContentProps) {
  const { t } = useTranslation()
  const [branches, setBranches] = useState<GitBranchRef[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadFailed, setIsLoadFailed] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const isSwitchingRef = useRef(false)

  const loadBranches = useCallback(async () => {
    setIsLoading(true)
    setIsLoadFailed(false)
    try {
      // null means the path is not a usable git repository; surface it like a
      // load failure so the retry row offers a way back.
      const result = await claude.listProjectGitBranches(projectPath)
      setBranches(result)
      setIsLoadFailed(result === null)
    } catch {
      setIsLoadFailed(true)
    } finally {
      setIsLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    void loadBranches()
  }, [loadBranches])

  const switchBranch = useCallback(
    async (branch: string) => {
      if (isSwitchingRef.current) return
      isSwitchingRef.current = true
      setSwitchError(null)
      try {
        const result = await claude.switchProjectGitBranch({ branch, projectPath })
        if (!result.branch) {
          setSwitchError(result.error ?? t('workbench.branch.switchFailed'))
          return
        }
        useWorkbenchStore.getState().setProjectGitBranch(projectId, result.branch)
        onDismiss()
      } finally {
        isSwitchingRef.current = false
      }
    },
    [onDismiss, projectId, projectPath, t],
  )

  return (
    <MenuContent
      align={align}
      aria-label={t('workbench.branch.switch')}
      className="w-[min(360px,calc(100vw-2rem))] shadow-float"
      glass
    >
      <MenuSearch
        disabled={isLoading}
        placeholder={t('workbench.branch.search', { name: projectName })}
      />
      <MenuSeparator />
      <MenuList aria-busy={isLoading}>
        {isLoading ? (
          <BranchListSkeleton />
        ) : isLoadFailed ? (
          <MenuItem forceMount value="branch-menu-retry" onSelect={() => void loadBranches()}>
            <span className="flex size-5 shrink-0 items-center justify-center">
              <RotateCcw className="size-4" strokeWidth={1.5} />
            </span>
            {t('workbench.branch.loadFailed')}
          </MenuItem>
        ) : (
          <>
            <MenuEmpty>{t('workbench.branch.empty')}</MenuEmpty>
            <MenuGroup heading={t('workbench.branch.title')}>
              {(branches ?? []).map((branch) => (
                <MenuItem
                  key={branch.name}
                  selected={branch.isCurrent}
                  value={branch.name}
                  onSelect={() => void switchBranch(branch.name)}
                >
                  <GitBranch className="size-4 shrink-0" strokeWidth={1.5} />
                  <span className="min-w-0 truncate text-sm/5">{branch.name}</span>
                </MenuItem>
              ))}
            </MenuGroup>
          </>
        )}
      </MenuList>
      {switchError ? (
        <div className="mx-1 mb-1 line-clamp-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs/5 text-destructive">
          {switchError}
        </div>
      ) : null}
      {!isLoading && !isLoadFailed ? (
        <>
          <MenuSeparator />
          <MenuItem forceMount value="branch-menu-create" onSelect={onCreate}>
            <span className="flex size-5 shrink-0 items-center justify-center">
              <Plus className="size-4" strokeWidth={1.5} />
            </span>
            {t('workbench.branch.create')}
          </MenuItem>
        </>
      ) : null}
    </MenuContent>
  )
}

function BranchListSkeleton() {
  return (
    <div aria-hidden="true" data-branch-list-skeleton>
      {[56, 72, 48].map((width) => (
        <div className="flex min-h-8 items-center gap-2 rounded-md px-2.5" key={width}>
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className="h-3.5" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  )
}
