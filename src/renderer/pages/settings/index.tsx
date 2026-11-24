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

import { APP_CONTENT_CONTAINER_CLASS, APP_SIDEBAR_DEFAULT_WIDTH } from '../../components/app-layout'
import { ClaudeRuntimePanel } from '../../components/claude-runtime'
import { ErrorBoundary } from '../../components/error-boundary'
import { FailureEmpty } from '../../components/failure-empty'
import { DiscardChangesDialog } from '../../components/marketplace/discard-changes-dialog'
import {
  type MarketplaceEntryTab,
  MarketplaceSettings,
} from '../../components/marketplace/marketplace-settings'
import {
  type SettingsCategoryId,
  useSettingsDetailStore,
} from '../../components/marketplace/settings-detail-store'
import { useSidebarResize } from '../../components/resizable-sidebar'
import { ShortcutDialog } from '../../components/shortcut-dialog'
import { ShortcutScope } from '../../components/shortcut-scope'
import { TransientScrollArea } from '../../components/transient-scroll-area'
import type { ClaudeProject } from '../../services/claude/claude'
import { AgentMcpSettings } from './components/agent-mcp-settings'
import { AgentPluginSettings } from './components/agent-plugin-settings'
import { AgentSkillSettings } from './components/agent-skill-settings'
import { AgentSubagentSettings } from './components/agent-subagent-settings'
import { AppearanceSettings } from './components/appearance-settings'
import { LanguageSettings } from './components/language-settings'
import { PermissionSettings } from './components/permission-settings'
import { ProjectSettings } from './components/project-settings'
import { ProviderSettings } from './components/provider-settings'
import { SessionSettings } from './components/session-settings'
import { ShortcutSettings } from './components/shortcut-settings'

const BASE_CATEGORIES = [
  { id: 'general', labelKey: 'settings.categories.general', icon: Settings2 },
  { id: 'models', labelKey: 'settings.categories.models', icon: Library },
  { id: 'appearance', labelKey: 'settings.categories.appearance', icon: Palette },
  { id: 'shortcuts', labelKey: 'settings.categories.shortcuts', icon: Keyboard },
  { id: 'projects', labelKey: 'settings.categories.projects', icon: FolderKanban },
] as const

const AGENT_CATEGORIES = [
  { id: 'agent-plugins', labelKey: 'settings.categories.agentPlugins', icon: Puzzle },
  { id: 'agent-subagents', labelKey: 'settings.categories.agentSubagents', icon: Bot },
  { id: 'agent-mcp', labelKey: 'settings.categories.agentMcp', icon: Server },
  { id: 'agent-skills', labelKey: 'settings.categories.agentSkills', icon: Sparkles },
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

export type { SettingsCategoryId } from '../../components/marketplace/settings-detail-store'

type SettingsPageProps = {
  error?: string | null
  fallbackFocusRef?: RefObject<HTMLElement | null>
  isProjectLoading?: boolean
  initialCategory?: SettingsCategoryId
  open: boolean
  projects?: ClaudeProject[]
  returnFocusRef?: RefObject<HTMLElement | null>
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

function SettingsPageContent({
  error,
  fallbackFocusRef,
  isProjectLoading = false,
  initialCategory = 'general',
  open,
  projects = [],
  returnFocusRef,
  onOpenChange,
  onReloadProjects,
  onRemoveProject = () => {},
}: SettingsPageProps) {
  const { t } = useTranslation()
  const [categoryId, setCategoryId] = useState<SettingsCategoryId>(initialCategory)
  const [installTab, setInstallTab] = useState<MarketplaceEntryTab | null>(null)
  const [focusedCategoryId, setFocusedCategoryId] = useState<SettingsCategoryId>(initialCategory)
  const categoryRefs = useRef<Array<HTMLButtonElement | null>>([])
  const dialogRef = useRef<HTMLDivElement>(null)
  const category = CATEGORIES.find((item) => item.id === categoryId) ?? CATEGORIES[0]
  const settingsSidebarWidth = useSidebarResize()?.width ?? APP_SIDEBAR_DEFAULT_WIDTH

  const detail = useSettingsDetailStore()
  const isDetailOpen = detail.view.kind === 'detail'
  const detailCategoryId = detail.view.kind === 'detail' ? detail.view.categoryId : null
  const detailLeaf = isDetailOpen ? detail.leaf : ''
  const detailSubLeaf = isDetailOpen ? detail.subLeaf : ''
  const detailCategory = detailCategoryId
    ? (CATEGORIES.find((item) => item.id === detailCategoryId) ?? null)
    : null
  let detailRoot = detailCategory ? t(detailCategory.labelKey) : ''
  if (
    detail.view.kind === 'detail' &&
    detail.view.categoryId === 'agent-marketplace' &&
    detail.view.file
  ) {
    if (detail.view.page === 'skills' || detail.view.page === 'skill-section')
      detailRoot = t('settings.agent.title.skills')
    if (detail.view.page === 'install' || detail.view.page === 'install-section')
      detailRoot = t('settings.agent.title.plugins')
    if (detail.view.page === 'marketplaces') detailRoot = t('settings.agent.plugins.marketplaces')
  }

  /**
   * Sidebar navigation while any detail page is open: with unsaved changes the
   * store gates the leave behind the discard dialog and the clicked category
   * stays inactive; a clean detail closes and the category activates.
   */
  const selectCategory = (id: SettingsCategoryId) => {
    if (isDetailOpen) {
      if (detail.isDirty) {
        detail.requestLeave()
        return
      }
      detail.backToList()
    }
    setInstallTab(null)
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
      setInstallTab(null)
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
                      className="px-2 text-sm font-normal text-foreground-subtlest [&_svg]:size-3.5"
                      onClick={() => onOpenChange(false)}
                      tabIndex={0}
                    >
                      <ArrowLeft />
                      <span>{t('settings.back')}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarHeader>

              <SidebarContent className="gap-3 pt-2">
                {CATEGORY_GROUPS.map((group) => (
                  <SidebarGroup className="py-0" key={group.labelKey}>
                    <SidebarGroupLabel className="h-7 px-2 text-sm text-foreground-subtlest">
                      {t(group.labelKey)}
                    </SidebarGroupLabel>
                    <SidebarGroupContent className="mt-1.5">
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
                                className="px-2 text-sm font-normal [&_svg]:size-3.5"
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
              {isDetailOpen || installTab ? (
                <div
                  className="app-region-drag flex h-10 shrink-0 items-center px-4"
                  data-settings-breadcrumb-bar
                >
                  <Breadcrumb className="app-region-no-drag">
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink
                          className="cursor-pointer text-foreground-subtlest"
                          data-testid="settings-breadcrumb-root"
                          onClick={() => {
                            // The root always returns to the category list;
                            // the dirty guard still applies first.
                            if (detail.isDirty) detail.requestLeave()
                            else {
                              detail.backToList()
                              setInstallTab(null)
                            }
                          }}
                        >
                          {installTab
                            ? t(
                                installTab === 'plugins'
                                  ? 'settings.agent.title.plugins'
                                  : 'settings.agent.title.skills',
                              )
                            : detailRoot}
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      {installTab && isDetailOpen ? (
                        <>
                          <BreadcrumbItem>
                            <BreadcrumbLink
                              className="cursor-pointer text-foreground-subtlest"
                              onClick={detail.requestLeave}
                            >
                              {t(
                                installTab === 'plugins'
                                  ? 'settings.agent.plugins.installPageTitle'
                                  : 'settings.agent.skillMarket.open',
                              )}
                            </BreadcrumbLink>
                          </BreadcrumbItem>
                          <BreadcrumbSeparator />
                        </>
                      ) : null}
                      <BreadcrumbItem className="min-w-0">
                        {detail.view.kind === 'detail' && detail.view.sub ? (
                          <BreadcrumbLink
                            className="cursor-pointer text-foreground-subtlest"
                            onClick={detail.requestLeave}
                          >
                            <span className="max-w-80 truncate">{detailLeaf}</span>
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage className="max-w-80 truncate">
                            {installTab && !isDetailOpen
                              ? t(
                                  installTab === 'plugins'
                                    ? 'settings.agent.plugins.installPageTitle'
                                    : 'settings.agent.skillMarket.open',
                                )
                              : detailLeaf}
                          </BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                      {detail.view.kind === 'detail' && detail.view.sub ? (
                        <>
                          <BreadcrumbSeparator />
                          <BreadcrumbItem className="min-w-0">
                            <BreadcrumbPage className="max-w-80 truncate">
                              {detailSubLeaf}
                            </BreadcrumbPage>
                          </BreadcrumbItem>
                        </>
                      ) : null}
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
              ) : null}
              <TransientScrollArea
                className={isDetailOpen || installTab ? 'min-h-0 flex-1' : 'h-svh'}
              >
                <div className={cn('px-6', isDetailOpen || installTab ? 'pb-12 pt-10' : 'py-12')}>
                  <div
                    className={cn(APP_CONTENT_CONTAINER_CLASS, 'flex flex-col gap-8')}
                    data-settings-content
                  >
                    {/* A detail page renders its own h1 (entry name or create
                        label); the category header would duplicate the
                        breadcrumb root above it. */}
                    {!isDetailOpen && !installTab ? (
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
                        <ClaudeRuntimePanel />
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
                        onReload={onReloadProjects}
                        onRemoveProject={onRemoveProject}
                      />
                    </SettingsCategory>
                    {installTab ? <MarketplaceSettings initialTab={installTab} hideTabs /> : null}
                    <SettingsCategory isActive={category.id === 'agent-plugins' && !installTab}>
                      <AgentPluginSettings onOpenMarketplace={() => setInstallTab('plugins')} />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'agent-subagents'}>
                      <AgentSubagentSettings />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'agent-mcp'}>
                      <AgentMcpSettings />
                    </SettingsCategory>
                    <SettingsCategory isActive={category.id === 'agent-skills' && !installTab}>
                      {category.id === 'agent-skills' && !installTab ? (
                        <AgentSkillSettings onOpenMarketplace={() => setInstallTab('skills')} />
                      ) : null}
                    </SettingsCategory>
                  </div>
                </div>
              </TransientScrollArea>
            </SidebarInset>
          </SidebarProvider>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog
        open={detail.isLeavePending}
        subject={detail.view.kind === 'detail' && detail.view.sub ? detailSubLeaf : detailLeaf}
        onOpenChange={(next) => {
          if (!next) detail.cancelLeave()
        }}
        onDiscard={detail.confirmLeave}
      />
    </ShortcutScope>
  )
}
