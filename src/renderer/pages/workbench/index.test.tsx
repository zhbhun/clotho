import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/shadcn/sidebar'
import { Toaster, toast } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'
import type { ShortcutOverrides } from '@/shared/shortcuts'

import { ShortcutHost } from '../../components/shortcut-host'
import { ShortcutScope } from '../../components/shortcut-scope'
import { ThemeProvider } from '../../components/theme-provider'
import { LanguageProvider } from '../../i18n/language-provider'
import { type LanguagePreference } from '../../i18n/languages'
import { appI18n, initializeAppI18n } from '../../i18n/runtime'
import type { ClaudeModelInfo, ModelProvider } from '../../services/claude/claude'
import { MOCK_PROJECT_ID } from '../../services/claude/mock'
import { requestFromDesktop } from '../../services/desktop/client'
import { commandCatalog } from '../../services/shortcuts/catalog'
import { ShortcutRuntimeProvider, createShortcutRuntime } from '../../services/shortcuts/runtime'
import { readUiState, updateUiState } from '../../services/ui-storage'
import { useProjects } from './hooks/use-projects'
import { WorkbenchPage } from './index'
import { sessionPersistence } from './services/session-persistence'
import { ConversationHeader } from './session/header'
import { saveSessionPreferences } from './session/stores/session-preferences'
import { SessionSidebar } from './sidebar'
import { type WorkbenchSession, useWorkbenchStore } from './stores/workbench-store'
import { buildSessionTimeline } from './utils/session-list'

vi.mock('../../services/desktop/client', () => ({
  isDesktopRuntime: () => true,
  requestFromDesktop: vi.fn(async () => null),
  listenDesktopEvent: vi.fn(() => Promise.resolve(() => {})),
}))

const originalScrollTo = HTMLElement.prototype.scrollTo
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
const SDK_STARTUP_WAIT_OPTIONS = { timeout: 3_000 }

function isSidebarSessionViewport(element: HTMLElement) {
  return (
    element.dataset.slot === 'scroll-area-viewport' &&
    element.closest('.sidebar-session-scroll') !== null
  )
}

beforeEach(async () => {
  vi.setSystemTime(new Date('2026-06-25T12:00:00Z'))
  HTMLElement.prototype.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return isSidebarSessionViewport(this) ? 500 : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return isSidebarSessionViewport(this) ? 240 : 0
    },
  })
  localStorage.clear()
  await Promise.all(sessionPersistence.all().map((record) => sessionPersistence.remove(record.id)))
  document.documentElement.classList.remove('dark', 'light')
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      disconnect = vi.fn()
      observe = vi.fn()
      takeRecords = vi.fn(() => [])
      unobserve = vi.fn()
    },
  )
  vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
    if (command === 'claudeListProjects' || command === 'claudeListSessions') return []
    if (command === 'claudeGetProjectGitBranch') return null
    if (command === 'claudeStartup') {
      return { cwd: '/Users/test', commands: [], agents: [], models: [] }
    }
    return null
  })
})

afterEach(() => {
  toast.close()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  }
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
  }
  if (originalScrollTo) {
    HTMLElement.prototype.scrollTo = originalScrollTo
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
  }
  vi.mocked(requestFromDesktop).mockReset()
  useWorkbenchStore.getState().reset()
})

/** Adds an attachment through the composer "+" menu; labels cover the en and zh catalogs. */
async function addComposerAttachment() {
  const trigger = await screen.findByLabelText(/^(Add|添加)$/, undefined, SDK_STARTUP_WAIT_OPTIONS)
  await userEvent.click(trigger)
  fireEvent.click(
    await screen.findByRole('menuitem', { name: /^(Attachment|附件)$/ }, SDK_STARTUP_WAIT_OPTIONS),
  )
}

function renderWorkbenchPage(shortcutOverrides: ShortcutOverrides = {}) {
  let overrides = shortcutOverrides
  const runtime = createShortcutRuntime({
    catalog: commandCatalog,
    client: {
      async load() {
        return overrides
      },
      async reset(commandId) {
        const remaining = { ...overrides }
        delete remaining[commandId]
        overrides = remaining
        return overrides
      },
      async set(commandId, bindings) {
        overrides = { ...overrides, [commandId]: bindings }
        return overrides
      },
    },
    platform: 'mac',
  })

  return render(
    <LanguageProvider
      initialPreference={(appI18n.resolvedLanguage ?? 'en') as LanguagePreference}
      instance={appI18n}
    >
      <ThemeProvider>
        <ShortcutRuntimeProvider runtime={runtime}>
          <ShortcutScope scope="workbench">
            <ShortcutHost />
            <TooltipProvider>
              <WorkbenchPage />
              <Toaster />
            </TooltipProvider>
          </ShortcutScope>
        </ShortcutRuntimeProvider>
      </ThemeProvider>
    </LanguageProvider>,
  )
}

async function openNewChat() {
  await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).not.toBeNull())
}

async function startAnotherChat() {
  const actions = await screen.findAllByRole('button', {
    name: new RegExp(`^${appI18n.t('workbench.session.new')}$`, 'i'),
  })
  fireEvent.click(actions[0])
}

function renderHeader({
  activeSessionId = null,
  defaultOpen = true,
  sessions = [],
}: {
  activeSessionId?: string | null
  defaultOpen?: boolean
  sessions?: WorkbenchSession[]
} = {}) {
  const runtime = createShortcutRuntime({
    catalog: commandCatalog,
    client: {
      async load() {
        return {}
      },
      async reset() {
        return {}
      },
      async set() {
        return {}
      },
    },
    platform: 'mac',
  })

  return render(
    <ThemeProvider>
      <ShortcutRuntimeProvider runtime={runtime}>
        <ShortcutScope scope="workbench">
          <ShortcutHost />
          <SidebarProvider defaultOpen={defaultOpen}>
            <ConversationHeader
              activeSessionId={activeSessionId}
              historyOpen={false}
              historySessions={[]}
              isContentScrolled={false}
              projectMode="home"
              projectName="Claude"
              projectSwitcherOpen={false}
              projects={[]}
              pinnedSessionIds={new Set()}
              sessionActivity={{}}
              sessions={sessions}
              onAddProject={vi.fn()}
              onCloseSession={vi.fn()}
              onDeleteSession={vi.fn()}
              onHistoryOpenChange={vi.fn()}
              onProjectSwitcherOpenChange={vi.fn()}
              onRenameSession={vi.fn()}
              onSelectProject={vi.fn()}
              onSelectSession={vi.fn()}
              onStartNewSession={vi.fn()}
              onTogglePinSession={vi.fn()}
            />
          </SidebarProvider>
        </ShortcutScope>
      </ShortcutRuntimeProvider>
    </ThemeProvider>,
  )
}

function createSidebarTestRuntime() {
  return createShortcutRuntime({
    catalog: commandCatalog,
    client: {
      async load() {
        return {}
      },
      async reset() {
        return {}
      },
      async set() {
        return {}
      },
    },
    platform: 'mac',
  })
}

function setupShortcutSessions() {
  const project = {
    id: 'shortcut-project',
    path: '/Users/test/shortcut-project',
    sessions: ['shortcut-1', 'shortcut-2', 'shortcut-3'],
    created_at: 0,
  }
  const sessions = [
    {
      id: 'shortcut-1',
      claudeSessionId: 'shortcut-1',
      project_id: project.id,
      project_path: project.path,
      created_at: 1,
      title: 'Shortcut one',
    },
    {
      id: 'shortcut-2',
      claudeSessionId: 'shortcut-2',
      project_id: project.id,
      project_path: project.path,
      created_at: 2,
      title: 'Shortcut two',
    },
    {
      id: 'shortcut-3',
      claudeSessionId: 'shortcut-3',
      project_id: project.id,
      project_path: project.path,
      created_at: 3,
      title: 'Shortcut three',
    },
  ]
  useWorkbenchStore.setState({
    currentProjectId: project.id,
    currentSessionId: sessions[0].id,
    tabsByWorkspace: { [`project:${project.id}`]: sessions.map((session) => session.id) },
    activeSessionByWorkspace: { [`project:${project.id}`]: sessions[0].id },
    projectMode: 'project',
    projects: { [project.id]: project },
    sessions: Object.fromEntries(sessions.map((session) => [session.id, session])),
  })
  vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
    if (command === 'claudeListProjects') return [project]
    if (command === 'claudeListSessions') return sessions
    if (command === 'claudeGetProjectGitBranch') return null
    if (command === 'claudeGetSessionMessages') return []
    if (command === 'claudeStartup') {
      return { cwd: project.path, commands: [], agents: [], models: TEST_MODELS }
    }
    return null
  })

  return { project, sessions }
}

function getPromptComposerCard() {
  const textarea = screen.getByLabelText('Prompt')
  const card = textarea.closest('[data-slot="card"]')

  expect(card).not.toBeNull()

  return card as HTMLElement
}

function sendPromptComposer() {
  fireEvent.click(screen.getByLabelText(appI18n.t('workbench.prompt.send')))
}

const TEST_MODELS = [
  {
    value: 'glm-5.2',
    displayName: 'GLM-5.2',
    description: '',
    providerId: 'glm',
    providerName: 'GLM',
    contextWindow: 200000,
  },
]

function providersFromModels(models: ClaudeModelInfo[]): ModelProvider[] {
  const groupedModels = new Map<string, ClaudeModelInfo[]>()
  for (const model of models) {
    if (!model.providerId || model.providerId === 'claude') continue
    groupedModels.set(model.providerId, [...(groupedModels.get(model.providerId) ?? []), model])
  }

  return Array.from(groupedModels, ([providerId, providerModels]) => ({
    id: providerId,
    name: providerModels[0]?.providerName ?? providerId,
    baseURL: `https://${providerId}.test/anthropic`,
    authToken: 'test-token',
    authField: 'ANTHROPIC_AUTH_TOKEN' as const,
    models: providerModels.map((model) => ({
      id: model.value,
      displayName: model.displayName,
      contextWindow: model.contextWindow ?? 200_000,
    })),
  }))
}

describe('ConversationHeader', () => {
  it('does not render a top-right theme menu', () => {
    renderHeader()

    expect(screen.queryByRole('button', { name: /切换主题/i })).not.toBeInTheDocument()
  })

  it('omits the session tab row when the current workspace has no open tabs', () => {
    renderHeader()

    expect(document.querySelector('.session-tabs')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: appI18n.t('workbench.session.new') }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: appI18n.t('workbench.history.title') }),
    ).not.toBeInTheDocument()
  })

  it('skips session tabs and close buttons while keeping tab actions focusable', () => {
    const sessions: WorkbenchSession[] = [
      {
        id: 'session-1',
        claudeSessionId: 'session-1',
        project_id: '',
        project_path: '',
        created_at: 1,
        title: 'First session',
      },
      {
        id: 'session-2',
        claudeSessionId: 'session-2',
        project_id: '',
        project_path: '',
        created_at: 2,
        title: 'Second session',
      },
    ]
    renderHeader({ activeSessionId: sessions[0].id, sessions })

    const tabs = document.querySelectorAll<HTMLElement>('[data-session-tab]')
    const closeButtons = document.querySelectorAll<HTMLButtonElement>(
      '.session-tab button[aria-label]',
    )

    expect(tabs).toHaveLength(2)
    expect(closeButtons).toHaveLength(2)
    for (const tab of tabs) expect(tab).toHaveAttribute('tabindex', '-1')
    for (const button of closeButtons) expect(button).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('button', { name: appI18n.t('workbench.session.new') })).toHaveProperty(
      'tabIndex',
      0,
    )
    expect(
      screen.getByRole('button', { name: appI18n.t('workbench.history.title') }),
    ).toHaveProperty('tabIndex', 0)
  })

  it('tabs through the collapsed-sidebar toggle, project switcher, and tab actions', async () => {
    const user = userEvent.setup()
    const session: WorkbenchSession = {
      id: 'session-1',
      claudeSessionId: 'session-1',
      project_id: '',
      project_path: '',
      created_at: 1,
      title: 'First session',
    }
    renderHeader({ activeSessionId: session.id, defaultOpen: false, sessions: [session] })

    const sidebarToggle = screen.getByRole('button', { name: 'Toggle Sidebar' })
    const projectSwitcher = document.querySelector('[data-window-project-title]')
    const newSession = screen.getByRole('button', {
      name: appI18n.t('workbench.session.new'),
    })
    const history = screen.getByRole('button', {
      name: appI18n.t('workbench.history.title'),
    })

    await user.tab()
    expect(sidebarToggle).toHaveFocus()
    await user.tab()
    expect(projectSwitcher).toHaveFocus()
    await user.tab()
    expect(newSession).toHaveFocus()
    await user.tab()
    expect(history).toHaveFocus()
  })
})

describe('resizable sidebar', () => {
  it('uses the configured shortcut instead of the shadcn sidebar default', async () => {
    await initializeAppI18n('en', ['en-US'])
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'claudeListProjects') return []
      if (command === 'claudeStartup') {
        return { cwd: '/Users/test', commands: [], agents: [], models: [] }
      }
      return null
    })
    renderWorkbenchPage({
      'workbench.sidebar.toggle': [{ modifiers: ['primary'], key: 'u' }],
    })
    await screen.findByRole('button', { name: 'Toggle Sidebar' })
    const sidebar = document.querySelector('[data-slot="sidebar"]')

    fireEvent.keyDown(document, { key: 'b', metaKey: true })
    expect(sidebar).toHaveAttribute('data-state', 'expanded')

    fireEvent.keyDown(document, { key: 'u', metaKey: true })
    await waitFor(() => expect(sidebar).toHaveAttribute('data-state', 'collapsed'))
  })

  it('opens settings with the configurable workbench command', async () => {
    await initializeAppI18n('en', ['en-US'])
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'claudeListProjects') return []
      if (command === 'claudeStartup') {
        return { cwd: '/Users/test', commands: [], agents: [], models: [] }
      }
      if (command === 'claudeListProviders') return []
      if (command === 'claudeListModelMappings') return {}
      return null
    })
    renderWorkbenchPage()
    await screen.findByLabelText('Prompt')

    fireEvent.keyDown(document, { key: ',', metaKey: true })

    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })

  it('tracks the pointer and clamps the width between 256 and 400 pixels', async () => {
    renderWorkbenchPage()

    const handle = await screen.findByRole('separator', { name: '调整侧边栏宽度' })

    fireEvent.pointerDown(handle, { button: 0, clientX: 318, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 360, pointerId: 1 })
    expect(handle).toHaveAttribute('aria-valuenow', '360')

    fireEvent.pointerMove(window, { clientX: 480, pointerId: 1 })
    expect(handle).toHaveAttribute('aria-valuenow', '400')

    fireEvent.pointerMove(window, { clientX: 200, pointerId: 1 })
    expect(handle).toHaveAttribute('aria-valuenow', '256')

    fireEvent.pointerUp(window, { pointerId: 1 })
  })

  it('collapses below 128 pixels and expands again before the pointer is released', async () => {
    renderWorkbenchPage()

    const handle = await screen.findByRole('separator', { name: '调整侧边栏宽度' })
    const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"]')

    expect(sidebar).toHaveAttribute('data-state', 'expanded')

    fireEvent.pointerDown(handle, { button: 0, clientX: 318, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 128, pointerId: 1 })
    expect(sidebar).toHaveAttribute('data-state', 'expanded')
    expect(handle).toHaveAttribute('aria-valuenow', '256')

    fireEvent.pointerMove(window, { clientX: 127, pointerId: 1 })
    expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    expect(handle).toHaveAttribute('aria-valuenow', '256')

    fireEvent.pointerMove(window, { clientX: 128, pointerId: 1 })
    expect(sidebar).toHaveAttribute('data-state', 'expanded')

    fireEvent.pointerMove(window, { clientX: 300, pointerId: 1 })
    expect(handle).toHaveAttribute('aria-valuenow', '300')

    fireEvent.pointerUp(window, { pointerId: 1 })
  })

  it('restores the last completed drag after remounting', async () => {
    const firstRender = renderWorkbenchPage()
    const handle = await screen.findByRole('separator', { name: '调整侧边栏宽度' })

    fireEvent.pointerDown(handle, { button: 0, clientX: 318, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 372, pointerId: 1 })
    fireEvent.pointerUp(window, { pointerId: 1 })
    firstRender.unmount()

    renderWorkbenchPage()

    expect(await screen.findByRole('separator', { name: '调整侧边栏宽度' })).toHaveAttribute(
      'aria-valuenow',
      '372',
    )
  })

  it('falls back from invalid stored widths and clamps out-of-range values', async () => {
    localStorage.setItem('clotho-ui:v1', JSON.stringify({ sidebarWidth: 'not-a-number' }))
    const invalidRender = renderWorkbenchPage()
    let handle = await screen.findByRole('separator', { name: '调整侧边栏宽度' })
    expect(handle).toHaveAttribute('aria-valuenow', '318')
    invalidRender.unmount()

    updateUiState({ sidebarWidth: 100 })
    const narrowRender = renderWorkbenchPage()
    handle = await screen.findByRole('separator', { name: '调整侧边栏宽度' })
    expect(handle).toHaveAttribute('aria-valuenow', '256')
    narrowRender.unmount()

    updateUiState({ sidebarWidth: 500 })
    renderWorkbenchPage()
    handle = await screen.findByRole('separator', { name: '调整侧边栏宽度' })
    expect(handle).toHaveAttribute('aria-valuenow', '400')
  })

  it('supports keyboard resizing with range semantics', async () => {
    renderWorkbenchPage()

    const handle = await screen.findByRole('separator', { name: '调整侧边栏宽度' })
    expect(handle).toHaveAttribute('aria-valuemin', '256')
    expect(handle).toHaveAttribute('aria-valuemax', '400')
    expect(handle).toHaveAttribute('aria-valuenow', '318')
    expect(handle).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(handle).toHaveAttribute('aria-valuenow', '310')

    fireEvent.keyDown(handle, { key: 'Home' })
    expect(handle).toHaveAttribute('aria-valuenow', '256')

    fireEvent.keyDown(handle, { key: 'End' })
    expect(handle).toHaveAttribute('aria-valuenow', '400')
    expect(readUiState().sidebarWidth).toBe(400)
  })

  it('captures the pointer and finishes resizing when the window loses focus', async () => {
    renderWorkbenchPage()

    const handle = await screen.findByRole('separator', { name: '调整侧边栏宽度' })
    const wrapper = document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')
    const setPointerCapture = vi.fn()
    const releasePointerCapture = vi.fn()
    Object.assign(handle, {
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture,
      setPointerCapture,
    })

    fireEvent.pointerDown(handle, { button: 0, clientX: 318, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 360, pointerId: 1 })

    expect(setPointerCapture).toHaveBeenCalledWith(1)
    expect(wrapper).toHaveAttribute('data-sidebar-resizing', 'true')

    fireEvent.blur(window)

    expect(releasePointerCapture).toHaveBeenCalledWith(1)
    expect(wrapper).not.toHaveAttribute('data-sidebar-resizing')
    expect(readUiState().sidebarWidth).toBe(360)
  })
})

describe('workbench shortcuts', () => {
  it('starts a new conversation in the current session project from the shortcut', async () => {
    const { project } = setupShortcutSessions()
    renderWorkbenchPage()
    await screen.findByRole('tab', { name: 'Shortcut one' })

    fireEvent.keyDown(document, { key: 'n', metaKey: true })

    await waitFor(() =>
      expect(useWorkbenchStore.getState()).toMatchObject({
        currentProjectId: project.id,
        currentSessionId: expect.any(String),
        projectMode: 'project',
      }),
    )
    const currentId = useWorkbenchStore.getState().currentSessionId
    expect(currentId).not.toBeNull()
    expect(useWorkbenchStore.getState().sessions[currentId!]?.isDraft).toBe(true)
  })

  it('starts a new conversation without a project from the shortcut in home mode', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })
    useWorkbenchStore.setState({
      currentProjectId: null,
      currentSessionId: null,
      projectMode: 'home',
      projects: {},
      sessions: {},
    })
    renderWorkbenchPage()
    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).not.toBeNull())

    fireEvent.keyDown(document, { key: 'n', metaKey: true })

    await waitFor(() =>
      expect(useWorkbenchStore.getState()).toMatchObject({
        currentProjectId: null,
        currentSessionId: expect.any(String),
        projectMode: 'home',
      }),
    )
    const currentId = useWorkbenchStore.getState().currentSessionId
    expect(currentId).not.toBeNull()
    expect(useWorkbenchStore.getState().sessions[currentId!]?.isDraft).toBe(true)
  })

  it('closes the current tab without deleting its saved conversation', async () => {
    const { project, sessions } = setupShortcutSessions()
    renderWorkbenchPage()
    await screen.findByRole('tab', { name: 'Shortcut one' })

    fireEvent.keyDown(document, { key: 'w', metaKey: true })

    await waitFor(() => {
      expect(useWorkbenchStore.getState().tabsByWorkspace[`project:${project.id}`]).not.toContain(
        sessions[0].id,
      )
    })
    expect(useWorkbenchStore.getState().sessions[sessions[0].id]).toBeDefined()
  })

  it('cycles conversation tabs in both directions', async () => {
    const { sessions } = setupShortcutSessions()
    renderWorkbenchPage()
    await screen.findByRole('tab', { name: 'Shortcut one' })

    fireEvent.keyDown(document, { ctrlKey: true, key: 'Tab', shiftKey: true })
    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[2].id))

    fireEvent.keyDown(document, { ctrlKey: true, key: 'Tab' })
    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[0].id))
  })

  it('activates an open conversation by its exact tab number', async () => {
    const { sessions } = setupShortcutSessions()
    renderWorkbenchPage()
    await screen.findByRole('tab', { name: 'Shortcut one' })

    fireEvent.keyDown(document, { key: '3', metaKey: true })

    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[2].id))
  })

  it('moves through sidebar conversations without wrapping at the boundary', async () => {
    const { sessions } = setupShortcutSessions()
    useWorkbenchStore.setState({ currentSessionId: sessions[1].id })
    renderWorkbenchPage()
    await screen.findByRole('tab', { name: 'Shortcut two' })

    fireEvent.keyDown(document, { key: 'ArrowLeft', metaKey: true, shiftKey: true })
    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[2].id))

    fireEvent.keyDown(document, { key: 'ArrowLeft', metaKey: true, shiftKey: true })
    expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[2].id)

    fireEvent.keyDown(document, { key: 'ArrowRight', metaKey: true, shiftKey: true })
    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[1].id))
  })

  it('moves backward and forward through visited conversations', async () => {
    const { sessions } = setupShortcutSessions()
    const user = userEvent.setup()
    renderWorkbenchPage()
    await user.click(await screen.findByRole('tab', { name: 'Shortcut two' }))
    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[1].id))
    await user.click(screen.getByRole('tab', { name: 'Shortcut three' }))
    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[2].id))

    fireEvent.keyDown(document, { key: '[', metaKey: true })
    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[1].id))
    fireEvent.keyDown(document, { key: '[', metaKey: true })
    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[0].id))
    fireEvent.keyDown(document, { key: ']', metaKey: true })
    await waitFor(() => expect(useWorkbenchStore.getState().currentSessionId).toBe(sessions[1].id))
  })
})

describe('workbench catalog loading states', () => {
  afterEach(async () => {
    await initializeAppI18n('zh-CN', ['zh-CN'])
  })

  it('keeps the application shell hidden until the initial catalog has loaded', async () => {
    await initializeAppI18n('en', ['en-US'])
    let finishProjects: ((projects: []) => void) | undefined
    const projects = new Promise<[]>((resolve) => {
      finishProjects = resolve
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'claudeListProjects') return projects
      if (command === 'claudeStartup') {
        return { cwd: '/Users/test', commands: [], agents: [], models: [] }
      }
      return null
    })

    renderWorkbenchPage()

    expect(screen.getByRole('img', { name: 'Clotho' })).toBeInTheDocument()
    expect(screen.queryByText('New chat')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', {
        name: 'What would you like to make together today?',
      }),
    ).not.toBeInTheDocument()

    finishProjects?.([])

    expect(await screen.findByRole('button', { name: 'New Chat' })).toBeInTheDocument()
  })

  it('shows a full-window retry state when the project catalog cannot load', async () => {
    await initializeAppI18n('en', ['en-US'])
    let attempt = 0
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'claudeListProjects') {
        attempt += 1
        if (attempt === 1) throw new Error('Project catalog failed')
        return []
      }
      if (command === 'claudeStartup') {
        return { cwd: '/Users/test', commands: [], agents: [], models: [] }
      }
      return null
    })

    renderWorkbenchPage()

    expect(await screen.findByText('Unable to load projects. Try again.')).toBeInTheDocument()
    expect(screen.queryByText('New chat')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('button', { name: 'New Chat' })).toBeInTheDocument()
    expect(screen.queryByText('Unable to load projects. Try again.')).not.toBeInTheDocument()
  })

  it('keeps a single project session failure inside the selected project', async () => {
    await initializeAppI18n('en', ['en-US'])
    const project = {
      id: 'project-1',
      path: '/Users/test/project',
      sessions: [],
      created_at: 0,
    }
    useWorkbenchStore.setState({
      currentProjectId: project.id,
      currentWorkspaceKey: `project:${project.id}`,
      projectMode: 'project',
      projects: { [project.id]: project },
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'claudeListProjects') return [project]
      if (command === 'claudeListSessions') throw new Error('Project sessions failed')
      if (command === 'claudeGetProjectGitBranch') return null
      return null
    })

    renderWorkbenchPage()

    expect(
      await screen.findByText(
        'Unable to load chats for this project. It may have moved or you may not have access.',
        undefined,
        SDK_STARTUP_WAIT_OPTIONS,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'New Chat' })).not.toBeInTheDocument()
    expect(screen.queryByText('Unable to load projects. Try again.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('keeps the active conversation visible when its project session list cannot refresh', async () => {
    await initializeAppI18n('en', ['en-US'])
    const { project } = setupShortcutSessions()
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'claudeListProjects') return [project]
      if (command === 'claudeListSessions') throw new Error('Project sessions failed')
      if (command === 'claudeGetProjectGitBranch') return null
      if (command === 'claudeGetSessionMessages') return []
      if (command === 'claudeStartup') {
        return { cwd: project.path, commands: [], agents: [], models: TEST_MODELS }
      }
      return null
    })

    const user = userEvent.setup()
    renderWorkbenchPage()

    await user.click(await screen.findByRole('button', { name: 'History' }))
    expect(
      await screen.findByText("Unable to load this project's chat history. Try again."),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Prompt')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Unable to load chats for this project. It may have moved or you may not have access.',
      ),
    ).not.toBeInTheDocument()
  })
})

describe('blank new chat surface', () => {
  afterEach(async () => {
    await initializeAppI18n('zh-CN', ['zh-CN'])
  })

  it('keeps the open blank chat hidden from the tab bar when starting another new session', async () => {
    await initializeAppI18n('en', ['en-US'])
    renderWorkbenchPage()
    await openNewChat()
    const blankSessionId = useWorkbenchStore.getState().currentSessionId

    await startAnotherChat()

    expect(useWorkbenchStore.getState().currentSessionId).toBe(blankSessionId)
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Prompt')).toBeInTheDocument()
  })

  it('keeps existing tabs visible without a highlight while a blank chat is open', async () => {
    await initializeAppI18n('en', ['en-US'])
    setupShortcutSessions()
    renderWorkbenchPage()
    await screen.findByRole('tab', { name: 'Shortcut one' })

    await startAnotherChat()

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.queryByRole('tab', { name: 'New Chat' })).not.toBeInTheDocument()
    expect(document.querySelector('.session-tab[data-active="true"]')).toBeNull()
    expect(document.querySelector('.session-tab-active-surface[data-visible="true"]')).toBeNull()
    expect(await screen.findByLabelText('Prompt')).toBeInTheDocument()
  })

  it('returns to a tab-less blank chat with a composer after the last tab closes', async () => {
    await initializeAppI18n('en', ['en-US'])
    setupShortcutSessions()
    renderWorkbenchPage()
    await screen.findByRole('tab', { name: 'Shortcut one' })

    for (const title of ['Shortcut three', 'Shortcut two', 'Shortcut one']) {
      fireEvent.click(screen.getByRole('button', { name: `Close chat: ${title}` }))
    }

    expect(await screen.findByLabelText('Prompt')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    const state = useWorkbenchStore.getState()
    expect(state.sessions[state.currentSessionId ?? '']).toMatchObject({
      isDraft: true,
      isUnsavedDraft: true,
    })
  })
})

describe('prompt composer surface', () => {
  it('shows setup only after startup confirms there is no Claude login or provider', async () => {
    await initializeAppI18n('en', ['en-US'])
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'claudeListProjects') return []
      if (command === 'claudeStartup') {
        return {
          cwd: '/Users/test',
          commands: [],
          agents: [],
          models: [],
          hasClaudeAuthentication: false,
          hasConfiguredProviders: false,
        }
      }
      return null
    })

    renderWorkbenchPage()
    await openNewChat()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Connect a model provider' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Set up later' }))
    expect(await screen.findByLabelText('Prompt')).toBeInTheDocument()
  })

  it('shows a toast when the attachment file picker cannot be opened', async () => {
    await initializeAppI18n('en', ['en-US'])
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: TEST_MODELS }
        case 'claudeSelectFiles':
          throw new Error('Picker unavailable')
        default:
          return null
      }
    })

    renderWorkbenchPage()
    await openNewChat()

    await addComposerAttachment()

    expect(await screen.findByText('Unable to open the file picker')).toBeInTheDocument()
  })

  it('ignores the context status action when no conversation exists', async () => {
    await initializeAppI18n('en', ['en-US'])
    let sampleRequested = false
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
        case 'claudeListSessions':
          return []
        case 'claudeStartup':
          return {
            cwd: '/Users/test',
            commands: [
              { name: 'compact', description: 'Compact the context' },
              { name: 'clear', description: 'Clear the context' },
            ],
            agents: [],
            models: TEST_MODELS,
          }
        case 'claudeSampleContextUsage':
          sampleRequested = true
          return null
        default:
          return null
      }
    })

    renderWorkbenchPage()
    await openNewChat()

    fireEvent.click(await screen.findByLabelText('Add'))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Status/ }))

    expect(sampleRequested).toBe(false)
    expect(screen.queryByLabelText('Checking context usage')).toBeNull()
  })

  it('renders project controls before the branded elevated composer', async () => {
    await initializeAppI18n('en', ['en-US'])
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()
    await openNewChat()

    expect(
      await screen.findByRole('heading', {
        name: 'What would you like to make together today?',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Clotho' })).toBeInTheDocument()

    const composer = getPromptComposerCard()
    const projectTrigger = screen.getByLabelText('Switch project')
    const emptyControls = projectTrigger.closest('.bg-project-switcher-surface')
    expect(composer).toHaveAttribute('data-elevated', 'true')
    expect(composer.querySelector('[data-slot="card-footer"]')).toBeInTheDocument()
    expect(composer).not.toContainElement(projectTrigger)
    expect(emptyControls).toContainElement(projectTrigger)
    expect(
      projectTrigger.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('creates an empty draft as a normal session', async () => {
    await initializeAppI18n('en', ['en-US'])
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()
    await openNewChat()

    expect(await screen.findByLabelText('Prompt')).not.toBeDisabled()
    const draftId = useWorkbenchStore.getState().currentSessionId
    expect(draftId).not.toBeNull()
    expect(useWorkbenchStore.getState().sessions[draftId!]).toMatchObject({
      id: draftId,
      title: 'New Chat',
      isDraft: true,
    })
    expect(useWorkbenchStore.getState().tabsByWorkspace.claude).toContain(draftId)
  })

  it('keeps the current project when starting a new conversation from the sidebar', async () => {
    const project = {
      id: 'project-1',
      path: '/Users/test/project',
      sessions: [],
      created_at: 0,
    }
    useWorkbenchStore.setState({
      currentProjectId: project.id,
      currentSessionId: null,
      projectMode: 'project',
      projects: { [project.id]: project },
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [project]
        case 'claudeListSessions':
          return []
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeStartup':
          return { cwd: '/Users/test/project', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await openNewChat()

    await waitFor(() => {
      expect(useWorkbenchStore.getState()).toMatchObject({
        currentProjectId: project.id,
        currentSessionId: expect.any(String),
        projectMode: 'project',
      })
    })
    expect(document.querySelector('[data-window-project-title]')).toHaveTextContent('project')
  })

  it('saves meaningful draft input when starting another chat', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({ projectMode: 'home' })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeStartup':
          return {
            cwd: '/Users/test',
            commands: [],
            agents: [],
            models: TEST_MODELS,
            modelMappings: { fallback: 'glm/glm-5.2' },
          }
        case 'claudeSelectFiles':
          return ['/Users/test/review-the-api-migration.md']
        default:
          return null
      }
    })

    renderWorkbenchPage()
    await openNewChat()

    await screen.findByLabelText('Prompt')
    await addComposerAttachment()
    await waitFor(() => expect(screen.getByLabelText('Send')).not.toBeDisabled())
    await startAnotherChat()

    await waitFor(() => {
      const drafts = Object.values(useWorkbenchStore.getState().sessions).filter(
        (session) => session.isDraft,
      )
      expect(drafts).toHaveLength(2)
      expect(drafts.map((draft) => draft.title)).toEqual(
        expect.arrayContaining(['review-the-api-migration.md', 'New Chat']),
      )
      expect(useWorkbenchStore.getState().tabsByWorkspace.claude).toEqual(
        expect.arrayContaining(drafts.map((draft) => draft.id)),
      )
      expect(useWorkbenchStore.getState().currentSessionId).toBe(
        drafts.find((draft) => draft.title === 'New Chat')?.id,
      )
    })
    // The materialized draft shows both as an inactive tab and in the sidebar
    // history (see 'refreshes a draft last-edited time when its prompt changes').
    expect(screen.getAllByText('review-the-api-migration.md')).toHaveLength(2)
    expect(screen.getByLabelText('Prompt')).toHaveTextContent('')
    // The composer record lands on the materialized draft (the one that gained
    // content); the blank new chat stays in memory by design. The write goes
    // through an async queue, so wait for it.
    const materializedDraft = Object.values(useWorkbenchStore.getState().sessions).find(
      (session) => session.isDraft && session.title === 'review-the-api-migration.md',
    )
    await waitFor(() => {
      expect(sessionPersistence.get(materializedDraft!.id)?.composer).toMatchObject({
        selectedProviderId: null,
        selectedModelId: null,
      })
    })
    const savedDraft = Object.values(useWorkbenchStore.getState().sessions).find(
      (session) => session.isDraft && session.title === 'New Chat',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close chat: review-the-api-migration.md' }))
    await waitFor(() => {
      expect(useWorkbenchStore.getState().sessions[savedDraft!.id]).toBeDefined()
      expect(useWorkbenchStore.getState().sessions[savedDraft!.id]?.isDraft).toBe(true)
    })
  })

  it('keeps a draft when selecting another conversation', async () => {
    await initializeAppI18n('en', ['en-US'])
    const user = userEvent.setup()
    const project = {
      id: 'project-1',
      path: '/Users/test/project',
      sessions: ['session-1', 'session-2'],
      created_at: 0,
    }
    const firstSession = {
      id: 'session-1',
      claudeSessionId: 'session-1',
      project_id: project.id,
      project_path: project.path,
      created_at: 1,
      title: 'First session',
    }
    const secondSession = {
      id: 'session-2',
      claudeSessionId: 'session-2',
      project_id: project.id,
      project_path: project.path,
      created_at: 2,
      title: 'Second session',
    }
    useWorkbenchStore.setState({
      currentProjectId: project.id,
      currentSessionId: null,
      tabsByWorkspace: { 'project:project-1': [firstSession.id, secondSession.id] },
      activeSessionByWorkspace: { 'project:project-1': null },
      projectMode: 'project',
      projects: { [project.id]: project },
      sessions: { [firstSession.id]: firstSession, [secondSession.id]: secondSession },
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [project]
        case 'claudeListSessions':
          return [firstSession, secondSession]
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeGetSessionMessages':
          return []
        case 'claudeSelectFiles':
          return ['/Users/test/review-the-api-migration.md']
        case 'claudeStartup':
          return { cwd: project.path, commands: [], agents: [], models: TEST_MODELS }
        default:
          return null
      }
    })

    renderWorkbenchPage()
    await openNewChat()
    await startAnotherChat()

    await screen.findByRole('textbox', { name: 'Prompt' })
    expect(screen.queryByRole('tab', { name: '新会话' })).not.toBeInTheDocument()
    await addComposerAttachment()
    await waitFor(() => expect(screen.getByLabelText('Send')).not.toBeDisabled())
    await user.click(await screen.findByRole('tab', { name: 'Second session' }))

    await waitFor(() => {
      expect(useWorkbenchStore.getState().currentSessionId).toBe(secondSession.id)
    })
    const drafts = Object.values(useWorkbenchStore.getState().sessions).filter(
      (session) => session.isDraft,
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      title: 'review-the-api-migration.md',
      project_id: project.id,
    })
    expect(screen.getByRole('tab', { name: 'review-the-api-migration.md' })).toBeInTheDocument()
  })

  it('refreshes a draft last-edited time when its prompt changes', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({ projectMode: 'home' })
    let selectedFile = 0
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: [] }
        case 'claudeSelectFiles':
          selectedFile += 1
          return [selectedFile === 1 ? '/Users/test/first.md' : '/Users/test/second.md']
        default:
          return null
      }
    })

    renderWorkbenchPage()
    await openNewChat()

    await screen.findByLabelText('Prompt')
    await addComposerAttachment()
    await waitFor(() => expect(screen.getByLabelText('Send')).not.toBeDisabled())
    await startAnotherChat()

    const draftItem = (await screen.findAllByText('first.md'))
      .find((element) => element.closest('[data-sidebar="menu-button"]'))
      ?.closest('[data-sidebar="menu-button"]')
    expect(draftItem).not.toBeNull()
    const draft = Object.values(useWorkbenchStore.getState().sessions).find(
      (session) => session.isDraft,
    )
    expect(draft).toBeDefined()
    const initialTime = draft?.created_at ?? 0

    fireEvent.click(draftItem!)
    await waitFor(() => {
      expect(screen.getByLabelText('first.md')).toBeInTheDocument()
    })

    vi.setSystemTime(new Date('2026-06-25T12:02:00Z'))
    await addComposerAttachment()

    await waitFor(() => {
      expect(screen.getByLabelText('second.md')).toBeInTheDocument()
      expect(useWorkbenchStore.getState().sessions[draft!.id]?.created_at).toBe(initialTime)
      expect(useWorkbenchStore.getState().sessions[draft!.id]?.updated_at).toBe(initialTime + 120)
    })
  })

  it('clears the composer after sending a typed prompt from a draft', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({ projectMode: 'home' })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeListProviders':
          return providersFromModels(TEST_MODELS)
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: TEST_MODELS }
        case 'claudeQueryStart':
          return undefined
        default:
          return null
      }
    })

    // ProseMirror reads caret geometry while typing; jsdom does not provide it.
    const rect = new DOMRect(0, 0, 120, 24)
    const rectList = {
      0: rect,
      length: 1,
      item: () => rect,
      [Symbol.iterator]: function* () {
        yield rect
      },
    } as unknown as DOMRectList
    const originalElementRects = Element.prototype.getClientRects
    const originalRangeRects = Range.prototype.getClientRects
    Element.prototype.getClientRects = () => rectList
    Range.prototype.getClientRects = () => rectList
    try {
      renderWorkbenchPage()
      await openNewChat()

      const prompt = await screen.findByLabelText('Prompt')
      prompt.focus()
      await userEvent.setup().keyboard('hello world')
      await waitFor(() => {
        expect(screen.getByLabelText('Send')).not.toBeDisabled()
      })
      sendPromptComposer()

      await waitFor(() => {
        expect(requestFromDesktop).toHaveBeenCalledWith(
          'claudeQueryStart',
          expect.objectContaining({ prompt: 'hello world' }),
        )
      })
      await waitFor(() => {
        expect(screen.getByLabelText('Prompt')).toHaveTextContent('')
      })
    } finally {
      Element.prototype.getClientRects = originalElementRects
      Range.prototype.getClientRects = originalRangeRects
    }
  })

  it('opens model settings instead of waiting for a slow startup on send', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({ projectMode: 'home' })
    let resolveStartup!: (value: {
      cwd: string
      commands: []
      agents: []
      models: typeof TEST_MODELS
    }) => void
    const startup = new Promise<{
      cwd: string
      commands: []
      agents: []
      models: typeof TEST_MODELS
    }>((resolve) => {
      resolveStartup = resolve
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeStartup':
          return startup
        case 'claudeSelectFiles':
          return ['/Users/test/wait-for-startup.md']
        case 'claudeQueryStart':
          return undefined
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await screen.findByLabelText('Prompt', undefined, SDK_STARTUP_WAIT_OPTIONS)
    await addComposerAttachment()
    await waitFor(() => expect(screen.getByLabelText('Send')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Send'))

    expect(await screen.findByText('Sign in to Claude or configure a model provider')).toBeVisible()
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    const draftId = useWorkbenchStore.getState().currentSessionId
    expect(draftId).not.toBeNull()
    expect(useWorkbenchStore.getState().sessions[draftId!]?.isDraft).toBe(true)
    expect(requestFromDesktop).not.toHaveBeenCalledWith('claudeQueryStart', expect.anything())

    resolveStartup({
      cwd: '/Users/test',
      commands: [],
      agents: [],
      models: TEST_MODELS,
    })

    await waitFor(() => {
      expect(requestFromDesktop).toHaveBeenCalledWith('claudeStartup', expect.anything())
    })
    expect(requestFromDesktop).not.toHaveBeenCalledWith('claudeQueryStart', expect.anything())
    expect(useWorkbenchStore.getState().currentSessionId).toBe(draftId)
  })

  it('sends with a configured provider without waiting for catalog startup', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({ projectMode: 'home' })
    let resolveStartup!: (value: {
      cwd: string
      commands: []
      agents: []
      models: typeof TEST_MODELS
    }) => void
    const startup = new Promise<{
      cwd: string
      commands: []
      agents: []
      models: typeof TEST_MODELS
    }>((resolve) => {
      resolveStartup = resolve
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeListProviders':
          return providersFromModels(TEST_MODELS)
        case 'claudeStartup':
          return startup
        case 'claudeSelectFiles':
          return ['/Users/test/keep-in-home.md']
        case 'claudeQueryStart':
          return undefined
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await screen.findByLabelText('Prompt', undefined, SDK_STARTUP_WAIT_OPTIONS)
    await addComposerAttachment()
    await waitFor(() => expect(screen.getByLabelText('Send')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Send'))

    await waitFor(() => {
      expect(requestFromDesktop).toHaveBeenCalledWith('claudeQueryStart', expect.anything())
      expect(useWorkbenchStore.getState().currentSessionId).toMatch(/^[A-Za-z0-9-]+$/)
    })
    resolveStartup({
      cwd: '/Users/test',
      commands: [],
      agents: [],
      models: TEST_MODELS,
    })
  })

  it('keeps Workbench open when a late startup result has no usable model', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({ projectMode: 'home' })
    let resolveStartup!: (value: {
      cwd: string
      commands: []
      agents: []
      models: []
      hasClaudeAuthentication: false
      hasConfiguredProviders: false
    }) => void
    const startup = new Promise<{
      cwd: string
      commands: []
      agents: []
      models: []
      hasClaudeAuthentication: false
      hasConfiguredProviders: false
    }>((resolve) => {
      resolveStartup = resolve
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeStartup':
          return startup
        case 'claudeSelectFiles':
          return ['/Users/test/configure-a-model.md']
        case 'claudeQueryStart':
          return undefined
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await screen.findByLabelText('Prompt', undefined, SDK_STARTUP_WAIT_OPTIONS)
    expect(screen.queryByRole('button', { name: 'Select model' })).not.toBeInTheDocument()

    await act(async () => {
      resolveStartup({
        cwd: '/Users/test',
        commands: [],
        agents: [],
        models: [],
        hasClaudeAuthentication: false,
        hasConfiguredProviders: false,
      })
    })

    expect(
      screen.queryByRole('heading', { level: 1, name: 'Connect a model provider' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Prompt')).toBeInTheDocument()
    await addComposerAttachment()
    await waitFor(() => expect(screen.getByLabelText('Send')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Send'))

    await screen.findByText('Sign in to Claude or configure a model provider')
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(requestFromDesktop).not.toHaveBeenCalledWith('claudeQueryStart', expect.anything())
    const draftId = useWorkbenchStore.getState().currentSessionId
    expect(draftId).not.toBeNull()
    expect(useWorkbenchStore.getState().sessions[draftId!]?.isDraft).toBe(true)
    expect(screen.getByLabelText('configure-a-model.md')).toBeInTheDocument()
  })

  it('keeps catalog startup failures from blocking a configured provider send', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({ projectMode: 'home' })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeListProviders':
          return providersFromModels(TEST_MODELS)
        case 'claudeStartup':
          throw new Error('Startup failed')
        case 'claudeSelectFiles':
          return ['/Users/test/retry-after-startup.md']
        case 'claudeQueryStart':
          return undefined
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await screen.findByLabelText('Prompt', undefined, SDK_STARTUP_WAIT_OPTIONS)
    await addComposerAttachment()
    await waitFor(() => expect(screen.getByLabelText('Send')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Send'))

    await waitFor(() => {
      expect(requestFromDesktop).toHaveBeenCalledWith('claudeQueryStart', expect.anything())
      expect(useWorkbenchStore.getState().currentSessionId).toMatch(/^[A-Za-z0-9-]+$/)
    })
    expect(screen.queryByText('Startup failed')).not.toBeInTheDocument()
  })

  it('displays the same configured fallback model that a new task will send', async () => {
    useWorkbenchStore.setState({
      currentProjectId: 'project-1',
      projectMode: 'project',
    })
    const models = [
      {
        value: 'model-a',
        displayName: 'Model A',
        description: '',
        providerId: 'first',
        providerName: 'First',
        contextWindow: 200_000,
      },
      {
        value: 'model-b',
        displayName: 'Model B',
        description: '',
        providerId: 'fallback',
        providerName: 'Fallback',
        contextWindow: 200_000,
      },
    ]
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: [],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return []
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeListProviders':
          return providersFromModels(models)
        case 'claudeListModelMappings':
          return { fallback: 'fallback/model-b' }
        case 'claudeStartup':
          return {
            cwd: '/Users/test/project',
            commands: [],
            agents: [],
            models,
            modelMappings: { fallback: 'fallback/model-b' },
          }
        case 'claudeSelectFiles':
          return ['/Users/test/use-fallback.md']
        case 'claudeQueryStart':
          return undefined
        default:
          return null
      }
    })

    renderWorkbenchPage()

    expect(
      await screen.findByRole('button', { name: /Model B/ }, SDK_STARTUP_WAIT_OPTIONS),
    ).toBeInTheDocument()
    await addComposerAttachment()
    await waitFor(() => expect(screen.getByLabelText('发送')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('发送'))

    await waitFor(() => {
      expect(requestFromDesktop).toHaveBeenCalledWith(
        'claudeQueryStart',
        expect.objectContaining({
          options: expect.objectContaining({ model: 'fallback/model-b' }),
        }),
      )
    })
    expect(requestFromDesktop).not.toHaveBeenCalledWith('claudeSetProjectModel', expect.anything())
  })

  it('uses a newly selected project model when starting the next task immediately', async () => {
    useWorkbenchStore.setState({
      currentProjectId: 'project-1',
      currentSessionId: 'session-1',
      tabsByWorkspace: { 'project:project-1': ['session-1'] },
      activeSessionByWorkspace: { 'project:project-1': 'session-1' },
      projectMode: 'project',
      projects: {
        'project-1': {
          id: 'project-1',
          path: '/Users/test/project',
          sessions: ['session-1'],
          created_at: 0,
          default_provider_id: 'provider',
          default_model_id: 'model-a',
        },
      },
      sessions: {
        'session-1': {
          id: 'session-1',
          claudeSessionId: 'session-1',
          project_id: 'project-1',
          project_path: '/Users/test/project',
          created_at: 1,
          title: 'Existing session',
        },
      },
    })
    const models = [
      {
        value: 'model-a',
        displayName: 'Model A',
        description: '',
        providerId: 'provider',
        providerName: 'Provider',
        contextWindow: 200_000,
      },
      {
        value: 'model-b',
        displayName: 'Model B',
        description: '',
        providerId: 'provider',
        providerName: 'Provider',
        contextWindow: 200_000,
      },
    ]
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: ['session-1'],
              created_at: 0,
              default_provider_id: 'provider',
              default_model_id: 'model-a',
            },
          ]
        case 'claudeListSessions':
          return [
            {
              id: 'session-1',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: 1,
              title: 'Existing session',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeGetSessionMessages':
          return []
        case 'claudeListProviders':
          return providersFromModels(models)
        case 'claudeStartup':
          return {
            cwd: '/Users/test/project',
            commands: [],
            agents: [],
            models,
          }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await waitFor(() => {
      expect(requestFromDesktop).toHaveBeenCalledWith(
        'claudeStartup',
        expect.objectContaining({
          options: expect.objectContaining({ cwd: '/Users/test/project' }),
        }),
      )
    })
    fireEvent.click(await screen.findByRole('button', { name: /Model A/ }))
    const modelOptions = await screen.findByRole('dialog', { name: '模型选择' })
    fireEvent.click(within(modelOptions).getByRole('option', { name: /Model B/ }))

    expect(useWorkbenchStore.getState().projects['project-1']).toMatchObject({
      default_provider_id: 'provider',
      default_model_id: 'model-b',
    })
    fireEvent.click(screen.getAllByRole('button', { name: '新建对话' })[0])

    expect(
      await screen.findByRole('button', { name: /Model B/ }, SDK_STARTUP_WAIT_OPTIONS),
    ).toBeInTheDocument()
  })

  it('shows a project-name switcher without the full path before a conversation starts', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: [],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return []
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeStartup':
          return { cwd: '/Users/test/project', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })
    useWorkbenchStore.setState({ currentProjectId: 'project-1', projectMode: 'project' })

    renderWorkbenchPage()

    const switcher = await screen.findByLabelText('切换项目')

    expect(switcher).toHaveTextContent('project')
    expect(switcher).not.toHaveTextContent('/Users/test/project')
  })

  it('starts a draft after switching to a project', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: [],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return []
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeStartup':
          return { cwd: '/Users/test/project', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    fireEvent.click(await screen.findByLabelText('切换项目', undefined, SDK_STARTUP_WAIT_OPTIONS))
    const projectOption = await screen.findByText('/Users/test/project')
    fireEvent.click(projectOption)

    await waitFor(() => {
      expect(useWorkbenchStore.getState()).toMatchObject({
        currentProjectId: 'project-1',
        currentSessionId: expect.any(String),
        projectMode: 'project',
      })
    })
    const draftId = useWorkbenchStore.getState().currentSessionId
    expect(useWorkbenchStore.getState().sessions[draftId!]).toMatchObject({
      isDraft: true,
      project_id: 'project-1',
    })
    expect(screen.getByLabelText('切换项目')).toHaveTextContent('project')
  })

  it('shows the selected project branch before a conversation starts', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: [],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return []
        case 'claudeGetProjectGitBranch':
          return 'main'
        case 'claudeStartup':
          return { cwd: '/Users/test/project', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })
    useWorkbenchStore.setState({ currentProjectId: 'project-1', projectMode: 'project' })

    renderWorkbenchPage()

    const branchLabel = await screen.findByText('main')
    expect(branchLabel).toBeInTheDocument()
  })

  it('opens project actions from the empty conversation switcher', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: [],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return []
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeStartup':
          return { cwd: '/Users/test/project', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    fireEvent.click(await screen.findByLabelText('切换项目'))

    expect(await screen.findByPlaceholderText('搜索项目')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: '切换项目' })
    expect(within(dialog).getByRole('button', { name: '添加项目' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '不使用项目' })).not.toBeInTheDocument()
    expect(within(dialog).getByText('tools-preview')).toBeInTheDocument()
  })

  it('opens the shared project form from the project switcher', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await userEvent.click(await screen.findByRole('button', { name: '切换项目' }))
    const switcher = screen.getByRole('dialog', { name: '切换项目' })
    await userEvent.click(within(switcher).getByRole('button', { name: '添加项目' }))

    expect(screen.getByRole('dialog', { name: '添加项目' })).toBeInTheDocument()
  })

  it('returns home after removing the current project from settings', async () => {
    await initializeAppI18n('en', ['en-US'])
    let isRemoved = false
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return isRemoved
            ? []
            : [
                {
                  id: 'project-1',
                  name: 'Alpha',
                  path: '/Users/test/alpha',
                  sessions: [],
                  created_at: 0,
                },
              ]
        case 'claudeListSessions':
          return []
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeRemoveProject':
          isRemoved = true
          return undefined
        case 'claudeStartup':
          return { cwd: '/Users/test/alpha', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })
    useWorkbenchStore.setState({ currentProjectId: 'project-1', projectMode: 'project' })

    renderWorkbenchPage()
    await waitFor(() => expect(useWorkbenchStore.getState().projects['project-1']).toBeDefined())
    await userEvent.click(await screen.findByText('Settings', undefined, SDK_STARTUP_WAIT_OPTIONS))
    await userEvent.click(screen.getByRole('button', { name: 'Projects' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'Remove project?' })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Remove project' }))

    await waitFor(() =>
      expect(useWorkbenchStore.getState()).toMatchObject({
        currentProjectId: null,
        projectMode: 'home',
      }),
    )
    expect(requestFromDesktop).toHaveBeenCalledWith('claudeRemoveProject', {
      projectId: 'project-1',
    })
  })

  it('keeps the removal confirmation open when the catalog cannot refresh', async () => {
    await initializeAppI18n('en', ['en-US'])
    let isRemoved = false
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          if (isRemoved) throw new Error('Project list refresh failed')
          return [
            {
              id: 'project-1',
              name: 'Alpha',
              path: '/Users/test/alpha',
              sessions: [],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return []
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeRemoveProject':
          isRemoved = true
          return undefined
        case 'claudeStartup':
          return { cwd: '/Users/test/alpha', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()
    await waitFor(() => expect(useWorkbenchStore.getState().projects['project-1']).toBeDefined())
    await userEvent.click(await screen.findByText('Settings', undefined, SDK_STARTUP_WAIT_OPTIONS))
    await userEvent.click(screen.getByRole('button', { name: 'Projects' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'Remove project?' })
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Remove project' }))

    expect(
      await screen.findByText('Project could not be removed. Please try again.'),
    ).toBeInTheDocument()
    expect(confirmation).toBeInTheDocument()
  })

  it('hides the project switcher after conversation content is loaded', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: ['session-1'],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return [
            {
              id: 'session-1',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: Math.floor(Date.now() / 1000) - 60 * 60,
              title: 'Existing work',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeGetSessionMessages':
          return [
            {
              type: 'user',
              timestamp: '2026-06-25T12:00:00Z',
              message: { role: 'user', content: 'Already talking' },
            },
          ]
        case 'claudeStartup':
          return { cwd: '/Users/test/project', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    fireEvent.click(await screen.findByText('Existing work'))
    await screen.findByText('Already talking')

    expect(screen.queryByLabelText('切换项目')).not.toBeInTheDocument()
  })

  it('allows home-mode prompts without sending a cwd', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({
      projectMode: 'home',
      currentProjectId: null,
      currentSessionId: null,
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeListProviders':
          return providersFromModels(TEST_MODELS)
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: TEST_MODELS }
        case 'claudeSelectFiles':
          return ['/Users/test/home.md']
        case 'claudeQueryStart':
          return undefined
        default:
          return null
      }
    })

    renderWorkbenchPage()

    expect(await screen.findByLabelText('Switch project')).toHaveTextContent('Select project')
    const prompt = screen.getByLabelText('Prompt')
    expect(prompt).not.toBeDisabled()

    await addComposerAttachment()
    await waitFor(() => {
      expect(screen.getByLabelText('Send')).not.toBeDisabled()
    })
    sendPromptComposer()

    await waitFor(() => {
      expect(requestFromDesktop).toHaveBeenCalledWith(
        'claudeQueryStart',
        expect.objectContaining({
          prompt: '',
          attachments: [expect.objectContaining({ name: 'home.md', path: '/Users/test/home.md' })],
          options: expect.not.objectContaining({
            cwd: expect.any(String),
          }),
        }),
      )
    })
  })

  it('shows a Thinking placeholder before the first assistant event', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({
      projectMode: 'home',
      currentProjectId: null,
      currentSessionId: null,
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeListProviders':
          return providersFromModels(TEST_MODELS)
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: TEST_MODELS }
        case 'claudeSelectFiles':
          return ['/Users/test/home.md']
        case 'claudeQueryStart':
          return undefined
        default:
          return null
      }
    })

    renderWorkbenchPage()

    expect(await screen.findByLabelText('Switch project')).toHaveTextContent('Select project')
    await addComposerAttachment()
    await waitFor(() => {
      expect(screen.getByLabelText('Send')).not.toBeDisabled()
    })
    sendPromptComposer()

    await screen.findByText('Thinking…')
    expect(screen.queryByText('0s')).not.toBeInTheDocument()
  })

  it('adds selected files as attachments and sends them alongside the prompt', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: [],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return []
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeListProviders':
          return providersFromModels(TEST_MODELS)
        case 'claudeStartup':
          return { cwd: '/Users/test/project', commands: [], agents: [], models: TEST_MODELS }
        case 'claudeSelectFiles':
          return ['/Users/test/project/docs/temp.md']
        case 'claudeQueryStart':
          return undefined
        default:
          return null
      }
    })
    useWorkbenchStore.setState({ currentProjectId: 'project-1', projectMode: 'project' })

    renderWorkbenchPage()

    await addComposerAttachment()
    await waitFor(() => {
      expect(screen.getByLabelText('发送')).not.toBeDisabled()
    })
    sendPromptComposer()

    await waitFor(() => {
      expect(requestFromDesktop).toHaveBeenCalledWith('claudeSelectFiles', {
        allowsMultipleSelection: true,
        startingFolder: '/Users/test/project',
      })
      expect(requestFromDesktop).toHaveBeenCalledWith(
        'claudeQueryStart',
        expect.objectContaining({
          prompt: '',
          attachments: [
            expect.objectContaining({ name: 'temp.md', path: '/Users/test/project/docs/temp.md' }),
          ],
        }),
      )
    })
  })

  it('does not show project context above the composer after conversation content is loaded', async () => {
    await initializeAppI18n('en', ['en-US'])
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: ['session-1'],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return [
            {
              id: 'session-1',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: Math.floor(Date.now() / 1000) - 60 * 60,
              title: 'Context visibility',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return 'main'
        case 'claudeGetSessionMessages':
          return [
            {
              type: 'user',
              timestamp: '2026-06-25T12:00:00Z',
              message: { role: 'user', content: 'Conversation is running' },
            },
          ]
        case 'claudeStartup':
          return { cwd: '/Users/test/project', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    fireEvent.click(await screen.findByText('Context visibility'))
    await screen.findByText('Conversation is running')

    expect(getPromptComposerCard()).toHaveAttribute('data-elevated', 'true')
    const composerStack = getPromptComposerCard().parentElement
    expect(composerStack).not.toBeNull()
    expect(within(composerStack as HTMLElement).queryByText('project')).not.toBeInTheDocument()
    expect(within(composerStack as HTMLElement).queryByText('main')).not.toBeInTheDocument()
  })

  it('updates conversation chrome from content scroll events', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: ['session-1'],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return [
            {
              id: 'session-1',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: Math.floor(Date.now() / 1000) - 60 * 60,
              title: 'Scrollable conversation',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return 'main'
        case 'claudeGetSessionMessages':
          return [
            {
              type: 'user',
              timestamp: '2026-06-25T12:00:00Z',
              message: { role: 'user', content: 'Conversation scroll content' },
            },
          ]
        case 'claudeStartup':
          return { cwd: '/Users/test/project', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    fireEvent.click(await screen.findByText('Scrollable conversation'))
    const message = await screen.findByText('Conversation scroll content')
    const viewport = message.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')

    expect(viewport).not.toBeNull()
    expect(viewport).toHaveAttribute('tabindex', '-1')

    ;(viewport as HTMLElement).scrollTop = 3
    fireEvent.scroll(viewport as HTMLElement)

    await waitFor(() => {
      expect(document.querySelector('.session-tabs')).toHaveAttribute(
        'data-content-scrolled',
        'true',
      )
    })
  })
})

describe('session list item', () => {
  it('moves session focus from keyboard input on the session list', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: ['newer-session', 'older-session'],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return [
            {
              id: 'newer-session',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: Math.floor(Date.now() / 1000),
              title: 'Newer session',
            },
            {
              id: 'older-session',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: Math.floor(Date.now() / 1000) - 60,
              title: 'Older session',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return 'main'
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    const newerSession = (await screen.findAllByText('Newer session'))
      .find((element) => element.closest('[data-session-item]'))
      ?.closest('[data-session-item]')
    const olderSession = (await screen.findAllByText('Older session'))
      .find((element) => element.closest('[data-session-item]'))
      ?.closest('[data-session-item]')
    const viewport = document.querySelector<HTMLElement>(
      '.sidebar-session-scroll [data-slot="scroll-area-viewport"]',
    )

    await waitFor(() => {
      expect(newerSession).toHaveAttribute('data-focused', 'true')
      expect(olderSession).not.toHaveAttribute('data-focused')
    })

    fireEvent.keyDown(viewport as HTMLElement, { key: 'ArrowDown' })

    await waitFor(() => {
      expect(newerSession).not.toHaveAttribute('data-focused')
      expect(olderSession).toHaveAttribute('data-focused', 'true')
      expect(olderSession?.querySelector('[data-sidebar="menu-button"]')).toHaveFocus()
    })
  })

  it('shows a home-mode session without a no-project metadata label', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return []
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })
    useWorkbenchStore.setState({
      currentProjectId: null,
      currentSessionId: 'local:home',
      tabsByWorkspace: { claude: ['local:home'] },
      activeSessionByWorkspace: { claude: 'local:home' },
      projectMode: 'home',
      projects: {},
      sessionActivity: {},
      sessions: {
        'local:home': {
          id: 'local:home',
          claudeSessionId: null,
          isDraft: false,
          project_id: '',
          project_path: '',
          created_at: Math.floor(Date.now() / 1000),
          title: 'Home mode session',
        },
      },
    })

    renderWorkbenchPage()

    await screen.findByRole('separator', { name: '调整侧边栏宽度' })
    const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"]')
    expect(sidebar).not.toBeNull()
    expect(await within(sidebar!).findByText('Home mode session')).toBeInTheDocument()
    expect(within(sidebar!).getAllByText('Clotho')).not.toHaveLength(0)
  })

  it('keeps existing sessions visible while the sidebar refreshes in the background', () => {
    const project = {
      id: 'project-1',
      path: '/Users/test/project',
      sessions: ['session-1'],
      created_at: 0,
    }
    const session = {
      id: 'session-1',
      claudeSessionId: 'session-1',
      project_id: 'project-1',
      project_path: '/Users/test/project',
      created_at: Math.floor(Date.now() / 1000) - 60 * 60,
      title: 'Visible while refreshing',
    }

    render(
      <ShortcutRuntimeProvider runtime={createSidebarTestRuntime()}>
        <TooltipProvider>
          <SidebarProvider>
            <SessionSidebar
              focusedSessionId={session.id}
              selectedSession={null}
              sessionTimeline={buildSessionTimeline({
                projects: { [project.id]: project },
                sessionActivity: {},
                sessions: { [session.id]: session },
              })}
              onDeleteSession={vi.fn()}
              onListKeyDown={vi.fn()}
              onOpenSettings={vi.fn()}
              onRenameSession={vi.fn()}
              onSelectSession={vi.fn()}
              onStartNewSession={vi.fn()}
              onTogglePinSession={vi.fn()}
            />
          </SidebarProvider>
        </TooltipProvider>
      </ShortcutRuntimeProvider>,
    )

    expect(screen.getByText('Visible while refreshing')).toBeInTheDocument()
  })

  it('marks the selected session active inside its project group', () => {
    const project = {
      id: 'project-1',
      path: '/Users/test/project',
      sessions: ['session-1'],
      created_at: 0,
    }
    const session = {
      id: 'session-1',
      claudeSessionId: 'session-1',
      project_id: 'project-1',
      project_path: '/Users/test/project',
      created_at: Math.floor(Date.now() / 1000) - 60 * 60,
      title: 'Active session',
    }

    render(
      <ShortcutRuntimeProvider runtime={createSidebarTestRuntime()}>
        <TooltipProvider>
          <SidebarProvider>
            <SessionSidebar
              focusedSessionId={session.id}
              selectedSession={session}
              sessionTimeline={buildSessionTimeline({
                projects: { [project.id]: project },
                sessionActivity: {},
                sessions: { [session.id]: session },
              })}
              onDeleteSession={vi.fn()}
              onListKeyDown={vi.fn()}
              onOpenSettings={vi.fn()}
              onRenameSession={vi.fn()}
              onSelectSession={vi.fn()}
              onStartNewSession={vi.fn()}
              onTogglePinSession={vi.fn()}
            />
          </SidebarProvider>
        </TooltipProvider>
      </ShortcutRuntimeProvider>,
    )

    const sessionItem = document.querySelector(
      '[data-session-item="session-1"] [data-sidebar="menu-button"]',
    )

    expect(sessionItem).toHaveAttribute('data-active')
    expect(screen.getByText('project')).toBeInTheDocument()
  })

  it('toggles the sidebar from the header trigger', async () => {
    render(
      <ShortcutRuntimeProvider runtime={createSidebarTestRuntime()}>
        <TooltipProvider>
          <SidebarProvider>
            <SessionSidebar
              focusedSessionId={null}
              selectedSession={null}
              sessionTimeline={buildSessionTimeline({
                projects: {},
                sessionActivity: {},
                sessions: {},
              })}
              onDeleteSession={vi.fn()}
              onListKeyDown={vi.fn()}
              onOpenSettings={vi.fn()}
              onRenameSession={vi.fn()}
              onSelectSession={vi.fn()}
              onStartNewSession={vi.fn()}
              onTogglePinSession={vi.fn()}
            />
          </SidebarProvider>
        </TooltipProvider>
      </ShortcutRuntimeProvider>,
    )

    const sidebar = document.querySelector('[data-slot="sidebar"]')
    const trigger = screen.getByRole('button', { name: 'Toggle Sidebar' })

    expect(sidebar).toHaveAttribute('data-state', 'expanded')

    fireEvent.click(trigger)

    await waitFor(() => {
      expect(sidebar).toHaveAttribute('data-state', 'collapsed')
      expect(sidebar).toHaveAttribute('data-collapsible', 'offcanvas')
    })
  })

  it('renders project metadata without session row actions', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: ['session-1'],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return [
            {
              id: 'session-1',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: Math.floor(Date.now() / 1000) - 60 * 60,
              title: 'Pinned layout work',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeStartup':
          return {
            cwd: '/Users/test/project',
            commands: [],
            agents: [],
            models: [{ value: 'sonnet', displayName: 'Sonnet', description: 'Balanced' }],
          }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await screen.findByText('Pinned layout work')

    expect(screen.getByText('project')).toBeInTheDocument()
    expect(screen.queryByText('1小时')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Rename')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument()
  })
})

describe('session actions', () => {
  it('pins a session from the sidebar and moves it into the pinned group', async () => {
    const user = userEvent.setup()
    setupShortcutSessions()
    renderWorkbenchPage()
    await screen.findAllByText('Shortcut one')
    const sessionItem = document.querySelector<HTMLElement>('[data-session-item="shortcut-1"]')

    expect(sessionItem).not.toBeNull()
    fireEvent.contextMenu(sessionItem as HTMLElement)
    await user.click(screen.getByText('置顶'))

    expect(useWorkbenchStore.getState().pinnedSessionIds).toEqual(['shortcut-1'])
    expect(screen.getByText('置顶')).toBeInTheDocument()
  })

  it('renames a session from the sidebar dialog', async () => {
    const user = userEvent.setup()
    setupShortcutSessions()
    renderWorkbenchPage()
    await screen.findAllByText('Shortcut one')
    const sessionItem = document.querySelector<HTMLElement>('[data-session-item="shortcut-1"]')

    fireEvent.contextMenu(sessionItem as HTMLElement)
    await user.click(screen.getByText('重命名'))

    const dialog = screen.getByRole('dialog', { name: '重命名对话' })
    const input = within(dialog).getByRole('textbox', { name: '对话名称' })
    expect(input).toHaveValue('Shortcut one')
    await user.clear(input)
    await user.type(input, 'Renamed from menu')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(requestFromDesktop).toHaveBeenCalledWith('claudeRenameSession', {
        projectId: 'shortcut-project',
        sessionId: 'shortcut-1',
        title: 'Renamed from menu',
      }),
    )
    expect(useWorkbenchStore.getState().sessions['shortcut-1']?.title).toBe('Renamed from menu')
    expect(screen.queryByRole('dialog', { name: '重命名对话' })).not.toBeInTheDocument()
  })

  it('deletes a session from its tab after confirmation', async () => {
    const user = userEvent.setup()
    setupShortcutSessions()
    renderWorkbenchPage()
    await screen.findAllByText('Shortcut one')
    const tab = document.querySelector<HTMLElement>(
      '[data-session-tab="shortcut-1"]',
    )?.parentElement

    expect(tab).not.toBeNull()
    fireEvent.contextMenu(tab as HTMLElement)
    await user.click(screen.getByText('删除'))

    const dialog = screen.getByRole('alertdialog', { name: '删除对话' })
    expect(within(dialog).getByText(/Shortcut one/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '删除' }))

    await waitFor(() =>
      expect(requestFromDesktop).toHaveBeenCalledWith('claudeDeleteSession', {
        projectId: 'shortcut-project',
        sessionId: 'shortcut-1',
      }),
    )
    expect(useWorkbenchStore.getState().sessions['shortcut-1']).toBeUndefined()
    expect(screen.queryByRole('alertdialog', { name: '删除对话' })).not.toBeInTheDocument()
  })

  it('closes the other tabs from the clicked tab menu', async () => {
    const user = userEvent.setup()
    const { project, sessions } = setupShortcutSessions()
    renderWorkbenchPage()
    await screen.findAllByText('Shortcut two')
    const tab = document.querySelector<HTMLElement>(
      '[data-session-tab="shortcut-2"]',
    )?.parentElement

    expect(tab).not.toBeNull()
    fireEvent.contextMenu(tab as HTMLElement)
    await user.click(
      screen.getByRole('menuitem', {
        name: appI18n.t('workbench.session.closeOtherTabs'),
      }),
    )

    expect(useWorkbenchStore.getState()).toMatchObject({
      currentSessionId: sessions[1].id,
      tabsByWorkspace: {
        [`project:${project.id}`]: [sessions[1].id],
      },
    })
  })
})

describe('sidebar initial reveal', () => {
  const project = {
    id: 'project-1',
    path: '/Users/test/project',
    sessions: ['focused-session', 'selected-session'],
    created_at: 0,
  }
  const catalogSessions = [
    {
      id: 'focused-session',
      project_id: 'project-1',
      project_path: '/Users/test/project',
      created_at: Math.floor(Date.now() / 1000),
      title: 'Focused session',
    },
    {
      id: 'selected-session',
      project_id: 'project-1',
      project_path: '/Users/test/project',
      created_at: Math.floor(Date.now() / 1000) - 60,
      title: 'Selected session',
    },
  ]

  function seedRestoredWorkbench(currentSessionId: string | null = 'selected-session') {
    useWorkbenchStore.setState({
      currentProjectId: project.id,
      currentSessionId,
      projectMode: 'project',
      projects: { [project.id]: project },
      sessionActivity: {},
      sessions: Object.fromEntries(
        catalogSessions.map((session) => [session.id, { ...session, claudeSessionId: session.id }]),
      ),
      tabsByWorkspace: { 'project:project-1': ['focused-session', 'selected-session'] },
      activeSessionByWorkspace: { 'project:project-1': currentSessionId },
    })
  }

  function mockCatalogRpc() {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [project]
        case 'claudeListSessions':
          return catalogSessions
        case 'claudeGetProjectGitBranch':
          return 'main'
        case 'claudeStartup':
          return { cwd: '/Users/test', commands: [], agents: [], models: [] }
        default:
          return null
      }
    })
  }

  function focusNavigationScrollCalls() {
    const viewport = document.querySelector<HTMLElement>(
      '.sidebar-session-scroll [data-slot="scroll-area-viewport"]',
    )
    if (!viewport) return []

    const calls = vi.mocked(viewport.scrollTo).mock.calls as unknown as Array<
      [ScrollToOptions | number | undefined, number?]
    >
    return calls.filter(([options]) => typeof options === 'object' && options?.behavior === 'auto')
  }

  // Render only the sidebar and useProjects so session restoration cannot leak runtime async work into other tests.
  function SessionSidebarHarness() {
    const workbench = useProjects()
    return (
      <SessionSidebar
        focusNavigationRevision={workbench.focusNavigationRevision}
        focusedSessionId={workbench.focusedSessionId}
        selectedSession={workbench.selectedSession}
        sessionTimeline={workbench.sessionTimeline}
        onDeleteSession={() => {}}
        onListKeyDown={workbench.handleListKeyDown}
        onOpenSettings={() => {}}
        onRenameSession={() => {}}
        onSelectSession={() => {}}
        onStartNewSession={() => {}}
        onTogglePinSession={() => {}}
      />
    )
  }

  function renderSidebarHarness() {
    return render(
      <ThemeProvider>
        <ShortcutRuntimeProvider runtime={createSidebarTestRuntime()}>
          <TooltipProvider>
            <SidebarProvider>
              <SessionSidebarHarness />
            </SidebarProvider>
          </TooltipProvider>
        </ShortcutRuntimeProvider>
      </ThemeProvider>,
    )
  }

  it('does not scroll the keyboard focus item over the restored session on startup', async () => {
    seedRestoredWorkbench()
    mockCatalogRpc()

    renderSidebarHarness()

    await screen.findAllByText('Selected session')

    expect(focusNavigationScrollCalls()).toHaveLength(0)
  })

  it('uses the current open session as the initial keyboard focus target', async () => {
    seedRestoredWorkbench()
    mockCatalogRpc()

    renderSidebarHarness()

    const focusedItem = (await screen.findByText('Focused session')).closest('[data-session-item]')
    const selectedItem = (await screen.findByText('Selected session')).closest(
      '[data-session-item]',
    )

    await waitFor(() => {
      expect(focusedItem?.querySelector('[data-sidebar="menu-button"]')).toHaveAttribute(
        'tabindex',
        '-1',
      )
      expect(selectedItem).toHaveAttribute('data-focused', 'true')
      expect(selectedItem?.querySelector('[data-sidebar="menu-button"]')).toHaveAttribute(
        'tabindex',
        '0',
      )
    })
  })

  it('falls back to the first session when there is no current open session', async () => {
    seedRestoredWorkbench(null)
    mockCatalogRpc()

    renderSidebarHarness()

    const firstItem = (await screen.findByText('Focused session')).closest('[data-session-item]')

    await waitFor(() => {
      expect(firstItem).toHaveAttribute('data-focused', 'true')
      expect(firstItem?.querySelector('[data-sidebar="menu-button"]')).toHaveAttribute(
        'tabindex',
        '0',
      )
    })
  })

  it('still scrolls the keyboard focus item after arrow-key navigation', async () => {
    seedRestoredWorkbench()
    mockCatalogRpc()

    renderSidebarHarness()

    const viewport = document.querySelector<HTMLElement>(
      '.sidebar-session-scroll [data-slot="scroll-area-viewport"]',
    )
    expect(viewport).not.toBeNull()
    fireEvent.keyDown(viewport as HTMLElement, { key: 'ArrowUp' })

    await waitFor(() => {
      expect(focusNavigationScrollCalls().length).toBeGreaterThan(0)
    })
  })

  it('does not scroll focus when a catalog insertion moves the focused session', async () => {
    seedRestoredWorkbench()
    mockCatalogRpc()

    renderSidebarHarness()

    await screen.findAllByText('Selected session')
    const viewport = document.querySelector<HTMLElement>(
      '.sidebar-session-scroll [data-slot="scroll-area-viewport"]',
    )
    expect(viewport).not.toBeNull()
    fireEvent.keyDown(viewport as HTMLElement, { key: 'ArrowUp' })

    await waitFor(() => {
      expect(focusNavigationScrollCalls().length).toBeGreaterThan(0)
    })
    vi.mocked((viewport as HTMLElement).scrollTo).mockClear()

    const insertedSession = {
      id: 'inserted-session',
      claudeSessionId: 'inserted-session',
      project_id: project.id,
      project_path: project.path,
      created_at: catalogSessions[0].created_at + 60,
      title: 'Inserted session',
    }
    act(() => {
      useWorkbenchStore.setState((state) => ({
        projects: {
          ...state.projects,
          [project.id]: {
            ...state.projects[project.id],
            sessions: [...state.projects[project.id].sessions, insertedSession.id],
          },
        },
        sessions: { ...state.sessions, [insertedSession.id]: insertedSession },
      }))
    })

    await screen.findByText('Inserted session')
    expect(focusNavigationScrollCalls()).toHaveLength(0)
  })
})

describe('mock project history', () => {
  it('renders mock work summaries without starting the native runtime', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({
      currentProjectId: MOCK_PROJECT_ID,
      currentSessionId: 'mock-web',
      tabsByWorkspace: { [`project:${MOCK_PROJECT_ID}`]: ['mock-web'] },
      activeSessionByWorkspace: { [`project:${MOCK_PROJECT_ID}`]: 'mock-web' },
      projectMode: 'project',
      projects: {
        [MOCK_PROJECT_ID]: {
          id: MOCK_PROJECT_ID,
          path: '/mock/tools-preview',
          sessions: ['mock-web'],
          created_at: 0,
        },
      },
      sessions: {
        'mock-web': {
          id: 'mock-web',
          claudeSessionId: 'mock-web',
          project_id: MOCK_PROJECT_ID,
          project_path: '/mock/tools-preview',
          created_at: 0,
          title: 'Web · Web search',
          isDraft: false,
        },
      },
      sessionActivity: {},
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'claudeListProjects') return []
      if (command === 'claudeStartup') {
        throw new Error('Claude Code native binary is unavailable')
      }
      return null
    })

    renderWorkbenchPage()

    await waitFor(() => {
      expect(
        screen.getByText(
          /Vite 8's core features are summarized: stable Environment API, Rolldown integration/,
        ),
      ).toBeInTheDocument()
    })
    const workToggle = await screen.findByRole('button', { name: /Worked/i })
    expect(workToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText(/^WebSearch /)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^WebFetch /)).not.toBeInTheDocument()

    fireEvent.click(workToggle)

    expect(workToggle).toHaveAttribute('aria-expanded', 'true')
    // Standalone WebSearch/WebFetch steps sit between text replies and stay directly visible.
    expect(await screen.findAllByLabelText(/^WebSearch /)).toHaveLength(1)
    expect(await screen.findAllByLabelText(/^WebFetch /)).toHaveLength(1)
    // The trailing consecutive pair folds into a collapsed run summary line.
    const runToggle = await screen.findByRole('button', { name: /visited 2 web page/i })
    expect(runToggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(runToggle)

    expect(await screen.findAllByLabelText(/^WebSearch /)).toHaveLength(2)
    expect(await screen.findAllByLabelText(/^WebFetch /)).toHaveLength(2)
    // Run tools stay collapsed until clicked; the two standalone tools keep their open bodies.
    expect(screen.getAllByTestId('tool-item-body')).toHaveLength(2)
    fireEvent.click(screen.getAllByLabelText(/^WebSearch /)[1])
    expect(await screen.findAllByTestId('tool-item-body')).toHaveLength(3)
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveAttribute(
      'contenteditable',
      'false',
    )
    expect(requestFromDesktop).not.toHaveBeenCalledWith('claudeStartup', expect.anything())
  })

  it('keeps the viewport fixed when expanding historical agent work', async () => {
    await initializeAppI18n('en', ['en-US'])
    useWorkbenchStore.setState({
      currentProjectId: MOCK_PROJECT_ID,
      currentSessionId: 'mock-web',
      tabsByWorkspace: { [`project:${MOCK_PROJECT_ID}`]: ['mock-web'] },
      activeSessionByWorkspace: { [`project:${MOCK_PROJECT_ID}`]: 'mock-web' },
      projectMode: 'project',
      projects: {
        [MOCK_PROJECT_ID]: {
          id: MOCK_PROJECT_ID,
          path: '/mock/tools-preview',
          sessions: ['mock-web'],
          created_at: 0,
        },
      },
      sessions: {
        'mock-web': {
          id: 'mock-web',
          claudeSessionId: 'mock-web',
          project_id: MOCK_PROJECT_ID,
          project_path: '/mock/tools-preview',
          created_at: 0,
          title: 'Web · Web search',
          isDraft: false,
        },
      },
      sessionActivity: {},
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'claudeListProjects') return []
      if (command === 'claudeStartup') {
        throw new Error('Claude Code native binary is unavailable')
      }
      return null
    })

    renderWorkbenchPage()

    const workToggle = await screen.findByRole('button', { name: /Worked/i })
    const viewport = workToggle.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
    expect(viewport).not.toBeNull()
    Object.defineProperties(viewport!, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1_000 },
    })
    viewport!.scrollTop = 320

    fireEvent.click(workToggle)

    await waitFor(() => expect(viewport!.scrollTop).toBe(320))
  })
})

describe('Claude runtime claudeStartup', () => {
  function seedForkSourceSession() {
    useWorkbenchStore.setState({
      currentProjectId: 'project-1',
      currentSessionId: 'source-session',
      tabsByWorkspace: { 'project:project-1': ['source-session'] },
      activeSessionByWorkspace: { 'project:project-1': 'source-session' },
      projectMode: 'project',
      projects: {
        'project-1': {
          id: 'project-1',
          path: '/Users/test/project',
          sessions: ['source-session'],
          created_at: 0,
        },
      },
      sessions: {
        'source-session': {
          id: 'source-session',
          claudeSessionId: 'source-session',
          project_id: 'project-1',
          project_path: '/Users/test/project',
          created_at: 0,
          title: 'Source session',
          isDraft: false,
        },
      },
      sessionActivity: {},
    })
  }

  it('refreshes the catalog and selects a newly forked session', async () => {
    seedForkSourceSession()
    let hasForked = false
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: hasForked ? ['forked-session', 'source-session'] : ['source-session'],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return [
            ...(hasForked
              ? [
                  {
                    id: 'forked-session',
                    project_id: 'project-1',
                    project_path: '/Users/test/project',
                    created_at: 1,
                    title: 'Source session (fork)',
                  },
                ]
              : []),
            {
              id: 'source-session',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: 0,
              title: 'Source session',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeGetSessionMessages':
          return [
            {
              type: 'user',
              uuid: 'user-message-uuid',
              timestamp: '2026-06-25T11:59:00Z',
              message: { role: 'user', content: 'Prompt to branch' },
            },
            {
              type: 'assistant',
              uuid: 'assistant-message-uuid',
              timestamp: '2026-06-25T12:00:00Z',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'Reply to branch from' }],
              },
            },
          ]
        case 'claudeStartup':
          return {
            cwd: '/Users/test/project',
            commands: [],
            agents: [],
            models: [{ value: 'sonnet', displayName: 'Sonnet', description: 'Balanced' }],
          }
        case 'claudeForkSession':
          hasForked = true
          return { sessionId: 'forked-session' }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    const branchButton = await screen.findByRole('button', {
      name: '基于此回复创建分支',
    })
    expect(branchButton).toBeEnabled()
    fireEvent.click(branchButton)

    await waitFor(() => {
      expect(useWorkbenchStore.getState().currentSessionId).toBe('forked-session')
    })
    expect(requestFromDesktop).toHaveBeenCalledWith('claudeForkSession', {
      sessionId: 'source-session',
      projectId: 'project-1',
      messageId: 'assistant-message-uuid',
    })
    expect(await screen.findAllByText('Source session (fork)')).not.toHaveLength(0)
    expect(useWorkbenchStore.getState().sessions['source-session']).toBeDefined()
  })

  it('keeps the source session selected and shows the existing error row when forking fails', async () => {
    await initializeAppI18n('en', ['en-US'])
    seedForkSourceSession()
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: ['source-session'],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return [
            {
              id: 'source-session',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: 0,
              title: 'Source session',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeGetSessionMessages':
          return [
            {
              type: 'user',
              uuid: 'user-message-uuid',
              message: { role: 'user', content: 'Prompt to branch' },
            },
            {
              type: 'assistant',
              uuid: 'assistant-message-uuid',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'Reply to branch from' }],
              },
            },
          ]
        case 'claudeStartup':
          return {
            cwd: '/Users/test/project',
            commands: [],
            agents: [],
            models: [{ value: 'sonnet', displayName: 'Sonnet', description: 'Balanced' }],
          }
        case 'claudeForkSession':
          throw new Error('Unable to create branch')
        default:
          return null
      }
    })

    renderWorkbenchPage()

    const branchButton = await screen.findByRole(
      'button',
      {
        name: 'Create a branch from this reply',
      },
      SDK_STARTUP_WAIT_OPTIONS,
    )
    expect(branchButton).toBeEnabled()
    fireEvent.click(branchButton)

    expect(await screen.findByText('Branch creation failed')).toBeInTheDocument()
    expect(useWorkbenchStore.getState().currentSessionId).toBe('source-session')

    await userEvent.click(screen.getByText('Settings'))
    await userEvent.click(screen.getByRole('button', { name: 'Projects' }))
    expect(screen.getByRole('button', { name: 'Edit project' })).toBeInTheDocument()
    expect(screen.queryByText('无法加载项目')).not.toBeInTheDocument()
  })

  it('does not refresh the project list when selecting a session', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: ['session-1', 'session-2'],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return [
            {
              id: 'session-1',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: Math.floor(Date.now() / 1000) - 60 * 60,
              title: 'First session',
            },
            {
              id: 'session-2',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: Math.floor(Date.now() / 1000) - 30 * 60,
              title: 'Second session',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeGetSessionMessages':
          return [
            {
              type: 'user',
              timestamp: '2026-06-25T12:00:00Z',
              message: { role: 'user', content: 'Only load history' },
            },
          ]
        case 'claudeStartup':
          return {
            cwd: '/Users/test/project',
            commands: [],
            agents: [],
            models: [{ value: 'sonnet', displayName: 'Sonnet', description: 'Balanced' }],
          }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    fireEvent.click(await screen.findByText('Second session'))

    await screen.findByText('Only load history')
    expect(requestFromDesktop).toHaveBeenCalledWith('claudeGetSessionMessages', {
      sessionId: 'session-2',
      projectId: 'project-1',
    })
    expect(
      vi
        .mocked(requestFromDesktop)
        .mock.calls.filter(([command]) => command === 'claudeListProjects'),
    ).toHaveLength(1)
  })

  it('keeps the tab transition surface mounted when selecting a session', async () => {
    const user = userEvent.setup()
    const project = {
      id: 'project-1',
      path: '/Users/test/project',
      sessions: ['session-1', 'session-2'],
      created_at: 0,
    }
    const firstSession = {
      id: 'session-1',
      claudeSessionId: 'session-1',
      project_id: project.id,
      project_path: project.path,
      created_at: 1,
      title: 'First session',
    }
    const secondSession = {
      id: 'session-2',
      claudeSessionId: 'session-2',
      project_id: project.id,
      project_path: project.path,
      created_at: 2,
      title: 'Second session',
    }
    useWorkbenchStore.setState({
      currentProjectId: project.id,
      currentSessionId: firstSession.id,
      tabsByWorkspace: { 'project:project-1': [firstSession.id, secondSession.id] },
      activeSessionByWorkspace: { 'project:project-1': firstSession.id },
      projectMode: 'project',
      projects: { [project.id]: project },
      sessions: { [firstSession.id]: firstSession, [secondSession.id]: secondSession },
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [project]
        case 'claudeListSessions':
          return [firstSession, secondSession]
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeGetSessionMessages':
          return []
        case 'claudeStartup':
          return { cwd: project.path, commands: [], agents: [], models: [] }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await screen.findByRole('tab', { name: 'First session' })
    const activeSurface = document.querySelector('[data-session-tab-active-surface]')

    expect(activeSurface).not.toBeNull()

    await user.click(screen.getByRole('tab', { name: 'Second session' }))
    await waitFor(() => {
      expect(useWorkbenchStore.getState().currentSessionId).toBe(secondSession.id)
    })

    expect(document.querySelector('[data-session-tab-active-surface]')).toBe(activeSurface)
  })

  it('shares model settings across retained sessions', async () => {
    const user = userEvent.setup()

    useWorkbenchStore.setState({
      currentProjectId: 'project-1',
      currentSessionId: 'session-1',
      tabsByWorkspace: { 'project:project-1': ['session-1', 'session-2'] },
      activeSessionByWorkspace: { 'project:project-1': 'session-1' },
      projectMode: 'project',
      projects: {
        'project-1': {
          id: 'project-1',
          path: '/Users/test/project',
          sessions: ['session-1', 'session-2'],
          created_at: 0,
        },
      },
      sessions: {
        'session-1': {
          id: 'session-1',
          claudeSessionId: 'session-1',
          project_id: 'project-1',
          project_path: '/Users/test/project',
          created_at: 1,
          title: 'First session',
        },
        'session-2': {
          id: 'session-2',
          claudeSessionId: 'session-2',
          project_id: 'project-1',
          project_path: '/Users/test/project',
          created_at: 2,
          title: 'Second session',
        },
      },
    })
    const fallbackModel = 'provider/model-a'
    const models = [
      {
        value: 'model-a',
        displayName: 'Model A',
        description: '',
        providerId: 'provider',
        providerName: 'Provider',
        contextWindow: 200_000,
      },
      {
        value: 'model-b',
        displayName: 'Model B',
        description: '',
        providerId: 'provider',
        providerName: 'Provider',
        contextWindow: 200_000,
      },
    ]
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: ['session-1', 'session-2'],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return [
            {
              id: 'session-1',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: 1,
              title: 'First session',
            },
            {
              id: 'session-2',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: 2,
              title: 'Second session',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeGetSessionMessages':
          return []
        case 'claudeListProviders':
          return providersFromModels(models)
        case 'claudeListModelMappings':
          return { fallback: fallbackModel }
        case 'claudeStartup':
          return {
            cwd: '/Users/test/project',
            commands: [],
            agents: [],
            models,
            modelMappings: { fallback: fallbackModel },
          }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await waitFor(() => {
      expect(requestFromDesktop).toHaveBeenCalledWith(
        'claudeStartup',
        expect.objectContaining({
          options: expect.objectContaining({ cwd: '/Users/test/project' }),
        }),
      )
    })
    expect(await screen.findByRole('button', { name: /Model A/ })).toBeInTheDocument()
    const secondTab = document.querySelector<HTMLElement>('[data-session-tab="session-2"]')
    expect(secondTab).not.toBeNull()
    await user.click(secondTab!)
    await waitFor(() => {
      expect(useWorkbenchStore.getState().currentSessionId).toBe('session-2')
    })
    expect(await screen.findByRole('button', { name: /Model A/ })).toBeInTheDocument()

    const firstTab = document.querySelector<HTMLElement>('[data-session-tab="session-1"]')
    expect(firstTab).not.toBeNull()
    await user.click(firstTab!)
    await waitFor(() => {
      expect(useWorkbenchStore.getState().currentSessionId).toBe('session-1')
    })
    expect(await screen.findByRole('button', { name: /Model A/ })).toBeInTheDocument()
  })

  it('restores the persisted provider/model selection and renders the model label', async () => {
    saveSessionPreferences('session-1', {
      prompt: '',
      selectedProviderId: 'glm',
      selectedModelId: 'glm-5.2[1M]',
      selectedAgent: null,
      permissionMode: 'bypassPermissions',
    })
    useWorkbenchStore.setState({
      currentProjectId: 'project-1',
      currentSessionId: 'session-1',
    })
    const models = [
      {
        value: 'glm-5.2[1M]',
        displayName: 'GLM-5.2 1M',
        description: '',
        providerId: 'glm',
        providerName: 'GLM',
        contextWindow: 1048576,
      },
    ]
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      switch (command) {
        case 'claudeListProjects':
          return [
            {
              id: 'project-1',
              path: '/Users/test/project',
              sessions: ['session-1'],
              created_at: 0,
            },
          ]
        case 'claudeListSessions':
          return [
            {
              id: 'session-1',
              project_id: 'project-1',
              project_path: '/Users/test/project',
              created_at: Math.floor(Date.now() / 1000) - 60 * 60,
              title: 'Restored session',
            },
          ]
        case 'claudeGetProjectGitBranch':
          return null
        case 'claudeGetSessionMessages':
          return []
        case 'claudeListProviders':
          return providersFromModels(models)
        case 'claudeStartup':
          return {
            cwd: '/Users/test/project',
            commands: [],
            agents: [],
            models,
          }
        default:
          return null
      }
    })

    renderWorkbenchPage()

    await waitFor(() => {
      expect(requestFromDesktop).toHaveBeenCalledWith('claudeStartup', {
        options: {
          agent: undefined,
          cwd: '/Users/test/project',
          permissionMode: 'bypassPermissions',
        },
        initializeTimeoutMs: expect.any(Number),
      })
    })
    expect(await screen.findByText('GLM-5.2 1M')).toBeInTheDocument()
  })
})
