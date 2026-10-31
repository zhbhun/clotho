import {
  ArrowLeft,
  Bot,
  FolderKanban,
  Keyboard,
  Library,
  Palette,
  Puzzle,
  Server,
  Settings2,
  Sparkles,
  Webhook,
  Workflow,
} from 'lucide-react'
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shadcn/alert-dialog'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shadcn/breadcrumb'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/shadcn/sidebar'
import { cn } from '@/shadcn/utils'

import { AppAlertDialog, AppAlertDialogContent } from '../../components/app-dialog'
import { APP_CONTENT_CONTAINER_CLASS, APP_SIDEBAR_DEFAULT_WIDTH } from '../../components/app-layout'
import { ErrorBoundary } from '../../components/error-boundary'
import { FailureEmpty } from '../../components/failure-empty'
import { useSidebarResize } from '../../components/resizable-sidebar'
import { ShortcutDialog } from '../../components/shortcut-dialog'
import { ShortcutScope } from '../../components/shortcut-scope'
import { TransientScrollArea } from '../../components/transient-scroll-area'
import type { ClaudeProject } from '../../services/claude/claude'
import { AgentHookSettings } from './components/agent-hook-settings'
import { AgentMcpSettings } from './components/agent-mcp-settings'
import { AgentPluginSettings } from './components/agent-plugin-settings'
import { AgentSkillSettings } from './components/agent-skill-settings'
import { AgentSubagentSettings } from './components/agent-subagent-settings'
import { AgentWorkflowSettings } from './components/agent-workflow-settings'
import { AppearanceSettings } from './components/appearance-settings'
import { LanguageSettings } from './components/language-settings'
import { PermissionSettings } from './components/permission-settings'
import { ProjectSettings } from './components/project-settings'
import { ProviderSettings } from './components/provider-settings'
import { SessionSettings } from './components/session-settings'
import { ShortcutSettings } from './components/shortcut-settings'
import { useSubagentDetailStore } from './components/subagent-detail-store'

const BASE_CATEGORIES = [
  { id: 'general', labelKey: 'settings.categories.general', icon: Settings2 },
  { id: 'models', labelKey: 'settings.categories.models', icon: Library },
  { id: 'appearance', labelKey: 'settings.categories.appearance', icon: Palette },
  { id: 'shortcuts', labelKey: 'settings.categories.shortcuts', icon: Keyboard },
  { id: 'projects', labelKey: 'settings.categories.projects', icon: FolderKanban },
] as const

const AGENT_CATEGORIES = [
  { id: 'agent-subagents', labelKey: 'settings.categories.agentSubagents', icon: Bot },
  { id: 'agent-plugins', labelKey: 'settings.categories.agentPlugins', icon: Puzzle },
  { id: 'agent-mcp', labelKey: 'settings.categories.agentMcp', icon: Server },
  { id: 'agent-skills', labelKey: 'settings.categories.agentSkills', icon: Sparkles },
  { id: 'agent-hooks', labelKey: 'settings.categories.agentHooks', icon: Webhook },
  { id: 'agent-workflows', labelKey: 'settings.categories.agentWorkflows', icon: Workflow },
] as const

/**
 * Sidebar groups in display order; flattened, they are the arrow-key navigation
 * order (design D9 — grouping never changes the keyboard contract).
 */
const CATEGORY_GROUPS = [
  { labelKey: 'settings.groups.base', categories: BASE_CATEGORIES },
  { labelKey: 'settings.groups.agent', categories: AGENT_CATEGORIES },
] as const

const CATEGORIES = [...BASE_CATEGORIES, ...AGENT_CATEGORIES] as const

export type SettingsCategoryId = (typeof CATEGORIES)[number]['id']

type SettingsPageProps = {
  error?: string | null
  fallbackFocusRef?: RefObject<HTMLElement | null>
  isProjectLoading?: boolean
  initialCategory?: SettingsCategoryId
  open: boolean
  projects?: ClaudeProject[]
  returnFocusRef?: RefObject<HTMLElement | null>
  onCreateProject?: () => void
  onEditProject?: (project: ClaudeProject) => void
  onOpenChange: (open: boolean) => void
  onReloadProjects?: () => Promise<void> | void
  onRemoveProject?: (project: ClaudeProject) => Promise<void> | void
}

export function SettingsPage(props: SettingsPageProps) {
  return (
    <ErrorBoundary
      resetKeys={[props.open]}
      fallback={(reset) => (
        <SettingsPageFailure
          fallbackFocusRef={props.fallbackFocusRef}
          open={props.open}
          returnFocusRef={props.returnFocusRef}
          onBack={() => {
            props.onOpenChange(false)
            reset()
          }}
        />
      )}
    >
      <SettingsPageContent {...props} />
    </ErrorBoundary>
  )
}

function resolveFinalFocus(
  returnFocusRef?: RefObject<HTMLElement | null>,
  fallbackFocusRef?: RefObject<HTMLElement | null>,
) {
  const returnTarget = returnFocusRef?.current
  if (returnTarget?.isConnected && returnTarget.tabIndex >= 0) return returnTarget

  const fallbackTarget = returnTarget?.isConnected ? returnTarget : fallbackFocusRef?.current
  if (fallbackTarget?.isConnected) {
    queueMicrotask(() => {
      if (fallbackTarget.isConnected) fallbackTarget.focus({ preventScroll: true })
    })
    return false
  }

  return true
}

function SettingsPageFailure({
  fallbackFocusRef,
  open,
  returnFocusRef,
  onBack,
}: {
  fallbackFocusRef?: RefObject<HTMLElement | null>
  open: boolean
  returnFocusRef?: RefObject<HTMLElement | null>
  onBack: () => void
}) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)

  return (
    <ShortcutDialog open={open} onOpenChange={(next) => !next && onBack()}>
      <DialogContent
        className="top-0 left-0 flex h-svh max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none p-6 ring-0 sm:max-w-none"
        finalFocus={() => resolveFinalFocus(returnFocusRef, fallbackFocusRef)}
        initialFocus={dialogRef}
        isFullscreen
        ref={dialogRef}
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('settings.boundary.pageTitle')}</DialogTitle>
          <DialogDescription>{t('settings.boundary.pageDescription')}</DialogDescription>
        </DialogHeader>
        <FailureEmpty
          actionLabel={t('settings.back')}
          className="max-w-2xl border"
          description={t('settings.boundary.pageDescription')}
          title={t('settings.boundary.pageTitle')}
          onAction={onBack}
        />
      </DialogContent>
    </ShortcutDialog>
  )
}

function SettingsCategory({ children, isActive }: { children: ReactNode; isActive: boolean }) {
  const { t } = useTranslation()

  return (
    <div hidden={!isActive}>
      <ErrorBoundary
        fallback={(reset) => (
          <FailureEmpty
            actionLabel={t('workbench.action.retry')}
            className="border"
            description={t('settings.boundary.contentDescription')}
            title={t('settings.boundary.contentTitle')}
            onAction={reset}
          />
        )}
      >
        {children}
      </ErrorBoundary>
    </div>
  )
}

/**
 * Unsaved-changes guard for the subagent detail page: confirming discards the
 * edits and runs the pending navigation; declining keeps editing (design D4/D5).
 */
function DiscardChangesDialog({
  open,
  subject,
  onOpenChange,
  onDiscard,
}: {
  open: boolean
  subject: string
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
}) {
  const { t } = useTranslation()
  return (
    <AppAlertDialog onOpenChange={onOpenChange} open={open}>
      <AppAlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.agent.subagent.discardTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.agent.subagent.discardDescription', { subject })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('settings.agent.subagent.discardKeepEditing')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false)
              onDiscard()
            }}
          >
            {t('settings.agent.subagent.discardConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AppAlertDialog>
  )
}

function SettingsPageContent({
  error,
  fallbackFocusRef,
  isProjectLoading = false,
  initialCategory = 'general',
  open,
  projects = [],
  returnFocusRef,
  onCreateProject = () => {},
  onEditProject = () => {},
  onOpenChange,
  onReloadProjects,
  onRemoveProject = () => {},
}: SettingsPageProps) {
  const { t } = useTranslation()
  const [categoryId, setCategoryId] = useState<SettingsCategoryId>(initialCategory)
  const [focusedCategoryId, setFocusedCategoryId] = useState<SettingsCategoryId>(initialCategory)
  const categoryRefs = useRef<Array<HTMLButtonElement | null>>([])
  const dialogRef = useRef<HTMLDivElement>(null)
  const category = CATEGORIES.find((item) => item.id === categoryId) ?? CATEGORIES[0]
  const settingsSidebarWidth = useSidebarResize()?.width ?? APP_SIDEBAR_DEFAULT_WIDTH

  const subagentDetail = useSubagentDetailStore()
  const isSubagentDetailOpen = subagentDetail.view.kind === 'detail'
  const subagentLeaf =
    subagentDetail.view.kind === 'detail'
      ? (subagentDetail.view.file ?? t('settings.agent.subagent.new'))
      : ''

  /**
   * Sidebar navigation while the detail page is open: with unsaved changes the
   * store gates the leave behind the discard dialog and the clicked category
   * stays inactive (D4); a clean detail closes and the category activates.
   */
  const selectCategory = (id: SettingsCategoryId) => {
    if (isSubagentDetailOpen) {
      if (subagentDetail.isDirty) {
        subagentDetail.requestLeave()
        return
      }
      subagentDetail.backToList()
    }
    setCategoryId(id)
    setFocusedCategoryId(id)
  }

  const handleCategoryKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number

    switch (event.key) {
      case 'ArrowDown':
        nextIndex = (index + 1) % CATEGORIES.length
        break
      case 'ArrowUp':
        nextIndex = (index - 1 + CATEGORIES.length) % CATEGORIES.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = CATEGORIES.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    setFocusedCategoryId(CATEGORIES[nextIndex].id)
    categoryRefs.current[nextIndex]?.focus({ preventScroll: true, focusVisible: true })
  }

  useEffect(() => {
    if (open) {
      setCategoryId(initialCategory)
      setFocusedCategoryId(initialCategory)
    }
  }, [initialCategory, open])

  return (
    <ShortcutScope scope={open ? 'settings' : null}>
      <Dialog disablePointerDismissal open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="top-0 left-0 flex h-svh max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none p-0 ring-0 sm:max-w-none"
          finalFocus={() => resolveFinalFocus(returnFocusRef, fallbackFocusRef)}
          initialFocus={dialogRef}
          isFullscreen
          ref={dialogRef}
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t('settings.title')}</DialogTitle>
            <DialogDescription>{t('settings.description')}</DialogDescription>
          </DialogHeader>

          <SidebarProvider
            className="app-sidebar-layout h-svh min-h-0 overflow-hidden"
            style={
              {
                '--sidebar-width': `${settingsSidebarWidth}px`,
              } as CSSProperties
            }
          >
            <Sidebar className="border-r" collapsible="none" data-app-sidebar-panel>
              <SidebarHeader className="gap-0 p-0">
                <div className="app-region-drag h-10 shrink-0" />
                <SidebarMenu className="h-10 justify-center px-2">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className="h-[30px] px-2 text-sm font-normal text-foreground-subtlest"
                      onClick={() => onOpenChange(false)}
                      tabIndex={0}
                    >
                      <ArrowLeft />
                      <span>{t('settings.back')}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarHeader>

              <SidebarContent className="pt-2">
                {CATEGORY_GROUPS.map((group) => (
                  <SidebarGroup className="py-0" key={group.labelKey}>
                    <SidebarGroupLabel className="h-7 px-2 text-sm text-foreground-subtlest">
                      {t(group.labelKey)}
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu className="app-region-no-drag gap-0.5">
                        {group.categories.map((item) => {
                          const index = CATEGORIES.findIndex(
                            (candidate) => candidate.id === item.id,
                          )
                          const Icon = item.icon

                          return (
                            <SidebarMenuItem key={item.id}>
                              <SidebarMenuButton
                                aria-current={item.id === categoryId ? 'page' : undefined}
                                className="h-[30px] px-2 text-sm font-normal"
                                isActive={item.id === categoryId}
                                onClick={() => selectCategory(item.id)}
                                onKeyDown={(event) => handleCategoryKeyDown(event, index)}
                                ref={(node) => {
                                  categoryRefs.current[index] = node
                                }}
                                tabIndex={item.id === focusedCategoryId ? 0 : -1}
                              >
                                <Icon />
                                <span>{t(item.labelKey)}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          )
                        })}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                ))}
              </SidebarContent>
            </Sidebar>

            <SidebarInset className="min-w-0 overflow-hidden">
              {isSubagentDetailOpen ? (
                <div className="shrink-0 px-6 pb-3 pt-8" data-subagent-breadcrumb-bar>
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink
                          className="cursor-pointer text-foreground-subtlest"
                          data-testid="subagent-breadcrumb-root"
                          onClick={subagentDetail.requestLeave}
                        >
                          {t('settings.categories.agentSubagents')}
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem className="min-w-0">
                        <BreadcrumbPage className="max-w-80 truncate">
                          {subagentLeaf}
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
              ) : null}
              <TransientScrollArea className={isSubagentDetailOpen ? 'min-h-0 flex-1' : 'h-svh'}>
                <div className="px-6 py-12">
                  <div
                    className={cn(APP_CONTENT_CONTAINER_CLASS, 'flex flex-col gap-8')}
                    data-settings-content
                  >
                    {/* The subagent detail page renders its own h1 (subagent
                        name or New subagent); the category header would
                        duplicate the breadcrumb root above it. */}
                    {!isSubagentDetailOpen ? (
                      <header>
                        <h1 className="text-xl font-medium tracking-tight">
                          {t(category.labelKey)}
                        </h1>
                      </header>
                    ) : null}

                    <SettingsCategory isActive={category.id === 'general'}>
                      <div className="flex flex-col gap-8">
                        <LanguageSettings />
                        <PermissionSettings />
                        <SessionSettings />
                      </div>
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'models'}>
                      <ProviderSettings />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'appearance'}>
                      <AppearanceSettings />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'shortcuts'}>
                      <ShortcutSettings isActive={category.id === 'shortcuts'} />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'projects'}>
                      <ProjectSettings
                        error={error}
                        isLoading={isProjectLoading}
                        projects={projects}
                        onCreateProject={onCreateProject}
                        onEditProject={onEditProject}
                        onReload={onReloadProjects}
                        onRemoveProject={onRemoveProject}
                      />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'agent-subagents'}>
                      <AgentSubagentSettings />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'agent-plugins'}>
                      <AgentPluginSettings />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'agent-mcp'}>
                      <AgentMcpSettings />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'agent-skills'}>
                      <AgentSkillSettings />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'agent-hooks'}>
                      <AgentHookSettings />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'agent-workflows'}>
                      <AgentWorkflowSettings />
                    </SettingsCategory>
                  </div>
                </div>
              </TransientScrollArea>
            </SidebarInset>
          </SidebarProvider>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={subagentDetail.isLeavePending}
        subject={subagentLeaf}
        onOpenChange={(next) => {
          if (!next) subagentDetail.cancelLeave()
        }}
        onDiscard={subagentDetail.confirmLeave}
      />
    </ShortcutScope>
  )
}
