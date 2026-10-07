import { GitBranch } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'

import { Menu, MenuTrigger } from '../../../components/menu'
import type { WorkbenchProject } from '../stores/workbench-store'
import { BranchSwitcherMenuContent } from './branch-switcher-menu'
import { CreateBranchDialog } from './create-branch-dialog'

export type BranchSwitcherButtonProps = {
  project?: WorkbenchProject
  projectName: string
}

/** Branch button shown next to the project button; clicking opens the dropdown
    branch menu. Hidden when the active workspace is not a git-backed project. */
export function BranchSwitcherButton({ project, projectName }: BranchSwitcherButtonProps) {
  const { t } = useTranslation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  if (!project?.path || !project.gitBranch) return null

  return (
    <>
      <Menu
        open={isMenuOpen}
        onOpenChange={(next, details) => {
          // Menu items close through a synthetic "item-select" reason; branch
          // actions keep the popup open until they settle so a failure can
          // surface inline instead of vanishing with the menu.
          if (!next && (details.reason as string) === 'item-select') return
          setIsMenuOpen(next)
        }}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <Button
                    aria-label={t('workbench.branch.switch')}
                    className="ml-1 max-w-56 shrink-0 rounded-xl !pl-2 !pr-2.5"
                    type="button"
                    variant="surface"
                  >
                    <GitBranch className="size-3.5 shrink-0" strokeWidth={1.5} />
                    <span className="min-w-0 truncate">{project.gitBranch}</span>
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="bottom">{t('workbench.branch.switch')}</TooltipContent>
        </Tooltip>
        <BranchSwitcherMenuContent
          onCreate={() => {
            setIsMenuOpen(false)
            setIsCreateOpen(true)
          }}
          onDismiss={() => setIsMenuOpen(false)}
          projectId={project.id}
          projectName={projectName}
          projectPath={project.path}
        />
      </Menu>
      <CreateBranchDialog
        onOpenChange={setIsCreateOpen}
        open={isCreateOpen}
        projectId={project.id}
        projectPath={project.path}
      />
    </>
  )
}
