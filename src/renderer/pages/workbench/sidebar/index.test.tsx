import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/shadcn/sidebar'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import { commandCatalog } from '../../../services/shortcuts/catalog'
import { ShortcutRuntimeProvider, createShortcutRuntime } from '../../../services/shortcuts/runtime'
import type { WorkbenchSession } from '../stores/workbench-store'
import { buildSessionTimeline } from '../utils/session-list'
import { SessionSidebar } from './index'

const session: WorkbenchSession = {
  id: 'session-1',
  claudeSessionId: 'session-1',
  project_id: '',
  project_path: '',
  created_at: Math.floor(new Date(2026, 7, 7, 12).getTime() / 1000),
  title: 'Selected session',
}
const originalScrollTo = HTMLElement.prototype.scrollTo

beforeEach(() => {
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
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(240)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(500)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(240)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(10_000)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 240, 500))
  HTMLElement.prototype.scrollTo = vi.fn(function (
    this: HTMLElement,
    optionsOrX?: ScrollToOptions | number,
    y?: number,
  ) {
    this.scrollTop =
      typeof optionsOrX === 'number' ? (y ?? this.scrollTop) : (optionsOrX?.top ?? this.scrollTop)
    this.dispatchEvent(new Event('scroll'))
  }) as typeof HTMLElement.prototype.scrollTo
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalScrollTo) {
    HTMLElement.prototype.scrollTo = originalScrollTo
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
  }
})

function renderSidebar({
  defaultOpen = true,
  focusedSessionId = session.id,
  selectedSession = null,
  sessions = [session],
}: {
  defaultOpen?: boolean
  focusedSessionId?: string | null
  selectedSession?: WorkbenchSession | null
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
  const onDeleteSession = vi.fn()
  const onOpenSettings = vi.fn()
  const onRenameSession = vi.fn()
  const onSelectSession = vi.fn()
  const onStartNewSession = vi.fn()
  const onTogglePinSession = vi.fn()
  const sessionTimeline = buildSessionTimeline({
    locale: appI18n.resolvedLanguage ?? appI18n.language,
    now: new Date(2026, 7, 7, 18),
    pinnedSessionIds: new Set(),
    projects: {},
    sessionActivity: {},
    sessions: Object.fromEntries(sessions.map((entry) => [entry.id, entry])),
    t: appI18n.t,
  })

  render(
    <ShortcutRuntimeProvider runtime={runtime}>
      <TooltipProvider delay={0}>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SessionSidebar
            focusNavigationRevision={0}
            focusedSessionId={focusedSessionId}
            selectedSession={selectedSession}
            sessionTimeline={sessionTimeline}
            onDeleteSession={onDeleteSession}
            onListKeyDown={vi.fn()}
            onOpenSettings={onOpenSettings}
            onRenameSession={onRenameSession}
            onSelectSession={onSelectSession}
            onStartNewSession={onStartNewSession}
            onTogglePinSession={onTogglePinSession}
          />
        </SidebarProvider>
      </TooltipProvider>
    </ShortcutRuntimeProvider>,
  )

  return { onSelectSession, onTogglePinSession }
}

describe('SessionSidebar', () => {
  it('shows the sidebar shortcut when hovering the titlebar trigger', async () => {
    await appI18n.changeLanguage('zh-CN')
    const user = userEvent.setup()
    renderSidebar()

    await user.hover(screen.getByRole('button', { name: 'Toggle Sidebar' }))

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('切换边栏')
    expect(tooltip).toHaveTextContent('⌘B')
  })

  it('shows the empty conversation state when there are no sessions', async () => {
    await appI18n.changeLanguage('zh-CN')
    renderSidebar({ sessions: [] })

    expect(screen.getByText('暂无对话')).toBeInTheDocument()
  })

  it('tabs between the sidebar controls in both directions', async () => {
    const user = userEvent.setup()
    renderSidebar({ selectedSession: session })
    const viewport = document.querySelector<HTMLElement>(
      '.sidebar-session-scroll [data-slot="scroll-area-viewport"]',
    )
    const newConversation = screen.getByText(appI18n.t('workbench.session.new')).closest('button')
    const locateAction = document.querySelector<HTMLButtonElement>(
      '[data-sidebar="locate-current-session"]',
    )
    const scrollTopAction = document.querySelector<HTMLButtonElement>(
      '[data-sidebar="scroll-to-top"]',
    )
    const sessionButton = document.querySelector<HTMLButtonElement>(
      `[data-session-item="${session.id}"] [data-sidebar="menu-button"]`,
    )
    const settings = screen.getByText(appI18n.t('workbench.nav.settings')).closest('button')
    const resizeHandle = screen.getByRole('separator')
    const expandedSidebarToggle = screen.getByRole('button', { name: 'Toggle Sidebar' })
    if (!newConversation || !locateAction || !scrollTopAction) {
      throw new Error('sidebar controls not found')
    }

    expect(viewport).toHaveAttribute('tabindex', '-1')
    expect(newConversation).toHaveAttribute('tabindex', '0')
    expect(sessionButton).toHaveAttribute('tabindex', '0')
    expect(settings).toHaveAttribute('tabindex', '0')
    expect(expandedSidebarToggle).toHaveAttribute('tabindex', '0')

    await user.tab()
    expect(expandedSidebarToggle).toHaveFocus()
    await user.tab()
    expect(newConversation).toHaveFocus()
    await user.tab()
    expect(locateAction).toHaveFocus()
    await user.tab()
    expect(scrollTopAction).toHaveFocus()
    await user.tab()
    expect(sessionButton).toHaveFocus()
    await user.tab()
    expect(settings).toHaveFocus()
    await user.tab()
    expect(resizeHandle).toHaveFocus()

    await user.tab({ shift: true })
    expect(settings).toHaveFocus()
    await user.tab({ shift: true })
    expect(sessionButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(scrollTopAction).toHaveFocus()
    await user.tab({ shift: true })
    expect(locateAction).toHaveFocus()
    await user.tab({ shift: true })
    expect(newConversation).toHaveFocus()
    await user.tab({ shift: true })
    expect(expandedSidebarToggle).toHaveFocus()
  })

  it('moves focus from a session back through the list actions on Shift+Tab', async () => {
    const user = userEvent.setup()
    renderSidebar({ selectedSession: session })
    const newConversation = screen.getByText(appI18n.t('workbench.session.new')).closest('button')
    const locateAction = document.querySelector<HTMLButtonElement>(
      '[data-sidebar="locate-current-session"]',
    )
    const scrollTopAction = document.querySelector<HTMLButtonElement>(
      '[data-sidebar="scroll-to-top"]',
    )
    const sessionButton = document.querySelector<HTMLButtonElement>(
      `[data-session-item="${session.id}"] [data-sidebar="menu-button"]`,
    )
    if (!newConversation || !locateAction || !scrollTopAction || !sessionButton) {
      throw new Error('sidebar controls not found')
    }

    sessionButton.focus()
    await user.tab({ shift: true })
    expect(scrollTopAction).toHaveFocus()
    await user.tab({ shift: true })
    expect(locateAction).toHaveFocus()
    await user.tab({ shift: true })
    expect(newConversation).toHaveFocus()
  })

  it('makes the offscreen sidebar inert while collapsed', () => {
    renderSidebar({ defaultOpen: false })

    expect(document.querySelector('[data-slot="sidebar-container"]')).toHaveAttribute('inert')
  })

  it('scrolls and focuses the current session when it is outside the virtual window', async () => {
    const user = userEvent.setup()
    const sessions = Array.from({ length: 30 }, (_, index) => ({
      ...session,
      id: `session-${index}`,
      claudeSessionId: `session-${index}`,
      created_at: session.created_at - index,
      title: `Session ${index}`,
    }))
    const currentSession = sessions.at(-1)
    if (!currentSession) throw new Error('current session not found')
    renderSidebar({
      focusedSessionId: currentSession.id,
      selectedSession: currentSession,
      sessions,
    })
    const newConversation = screen.getByText(appI18n.t('workbench.session.new')).closest('button')
    const viewport = document.querySelector<HTMLElement>(
      '.sidebar-session-scroll [data-slot="scroll-area-viewport"]',
    )
    if (!newConversation || !viewport) throw new Error('sidebar controls not found')

    expect(screen.queryByText(currentSession.title)).not.toBeInTheDocument()
    vi.mocked(viewport.scrollTo).mockClear()
    newConversation.focus()
    // New Conversation → locate → scroll-to-top; the last Tab is intercepted to scroll
    // the list and focus the roving session outside the virtual window.
    await user.keyboard('{Tab}')
    await user.keyboard('{Tab}')
    await user.keyboard('{Tab}')

    const currentButton = await screen.findByText(currentSession.title)
    await waitFor(() => {
      expect(currentButton.closest('[data-sidebar="menu-button"]')).toHaveFocus()
    })
    expect(viewport.scrollTo).toHaveBeenCalled()
  })

  it('scrolls the list to the selected session from the locate action', async () => {
    const user = userEvent.setup()
    const sessions = Array.from({ length: 30 }, (_, index) => ({
      ...session,
      id: `session-${index}`,
      claudeSessionId: `session-${index}`,
      created_at: session.created_at - index,
      title: `Session ${index}`,
    }))
    const currentSession = sessions.at(-1)
    if (!currentSession) throw new Error('current session not found')
    renderSidebar({ focusedSessionId: null, selectedSession: currentSession, sessions })
    const viewport = document.querySelector<HTMLElement>(
      '.sidebar-session-scroll [data-slot="scroll-area-viewport"]',
    )
    const locateButton = document.querySelector<HTMLButtonElement>(
      '[data-sidebar="locate-current-session"]',
    )
    if (!viewport || !locateButton) throw new Error('sidebar controls not found')

    expect(screen.queryByText(currentSession.title)).not.toBeInTheDocument()
    vi.mocked(viewport.scrollTo).mockClear()

    await user.click(locateButton)

    expect(await screen.findByText(currentSession.title)).toBeInTheDocument()
    expect(viewport.scrollTo).toHaveBeenCalled()
    // Row 29 starts at 32 + 29 * 50 = 1482; centered in the 500px mock viewport lands at 1257.
    expect(viewport.scrollTop).toBe(1257)
  })

  it('disables the locate action when the selected session is not in the list', () => {
    renderSidebar({ selectedSession: { ...session, id: 'draft-session' } })

    expect(
      document.querySelector<HTMLButtonElement>('[data-sidebar="locate-current-session"]'),
    ).toBeDisabled()
  })

  it('releases focus after activating a list action', async () => {
    const user = userEvent.setup()
    renderSidebar()
    const scrollTopButton = document.querySelector<HTMLButtonElement>(
      '[data-sidebar="scroll-to-top"]',
    )
    if (!scrollTopButton) throw new Error('scroll action not found')

    await user.click(scrollTopButton)

    expect(scrollTopButton).not.toHaveFocus()
  })

  it('scrolls the list back to the top from the list action', async () => {
    const user = userEvent.setup()
    const sessions = Array.from({ length: 30 }, (_, index) => ({
      ...session,
      id: `session-${index}`,
      claudeSessionId: `session-${index}`,
      created_at: session.created_at - index,
      title: `Session ${index}`,
    }))
    renderSidebar({ focusedSessionId: null, sessions })
    const viewport = document.querySelector<HTMLElement>(
      '.sidebar-session-scroll [data-slot="scroll-area-viewport"]',
    )
    const scrollTopButton = document.querySelector<HTMLButtonElement>(
      '[data-sidebar="scroll-to-top"]',
    )
    if (!viewport || !scrollTopButton) throw new Error('sidebar controls not found')

    viewport.scrollTop = 900
    viewport.dispatchEvent(new Event('scroll'))

    await user.click(scrollTopButton)

    expect(viewport.scrollTop).toBe(0)
  })

  it('keeps group headers mounted beyond the virtual window while scrolling', async () => {
    const sessions = Array.from({ length: 30 }, (_, index) => ({
      ...session,
      id: `session-${index}`,
      claudeSessionId: `session-${index}`,
      created_at: session.created_at - (index < 15 ? index : 5 * 24 * 60 * 60 + index),
      title: `Session ${index}`,
    }))
    renderSidebar({ focusedSessionId: null, sessions })
    const viewport = document.querySelector<HTMLElement>(
      '.sidebar-session-scroll [data-slot="scroll-area-viewport"]',
    )
    if (!viewport) throw new Error('scroll viewport not found')

    expect(screen.getByText('今天')).toBeInTheDocument()
    expect(screen.getByText('8月2日')).toBeInTheDocument()

    // Past today's 15 sessions (32 + 15 * 50 = 782) deep into the August 2 group;
    // both headers must stay rendered for the CSS sticky pinning to survive.
    viewport.scrollTop = 900
    viewport.dispatchEvent(new Event('scroll'))

    await waitFor(() => {
      expect(screen.queryByText('Session 3')).not.toBeInTheDocument()
    })
    expect(screen.getByText('今天')).toBeInTheDocument()
    expect(screen.getByText('8月2日')).toBeInTheDocument()
    expect(screen.queryAllByText('8月2日')).toHaveLength(1)
  })

  it('freezes hover tracking while the list scrolls and resumes after it settles', () => {
    vi.useFakeTimers()
    try {
      renderSidebar()
      const viewport = document.querySelector<HTMLElement>(
        '.sidebar-session-scroll [data-slot="scroll-area-viewport"]',
      )
      if (!viewport) throw new Error('scroll viewport not found')

      fireEvent.scroll(viewport)
      expect(document.querySelector('[data-session-list-scrolling="true"]')).not.toBeNull()

      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(document.querySelector('[data-session-list-scrolling="true"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('selects a session from the timeline', async () => {
    const user = userEvent.setup()
    const { onSelectSession } = renderSidebar()
    const item = document.querySelector<HTMLElement>(
      `[data-session-item="${session.id}"] [data-sidebar="menu-button"]`,
    )
    if (!item) throw new Error('session item not found')

    await user.click(item)

    expect(onSelectSession).toHaveBeenCalledWith(session)
  })

  it('selects the focused session with Enter', async () => {
    const user = userEvent.setup()
    const { onSelectSession } = renderSidebar()
    const item = document.querySelector<HTMLElement>(
      `[data-session-item="${session.id}"] [data-sidebar="menu-button"]`,
    )
    if (!item) throw new Error('session item not found')

    item.focus()
    await user.keyboard('{Enter}')

    expect(onSelectSession).toHaveBeenCalledTimes(1)
    expect(onSelectSession).toHaveBeenCalledWith(session)
  })

  it('runs the pin action from the shared session context menu', async () => {
    const user = userEvent.setup()
    const { onTogglePinSession } = renderSidebar()
    const item = document.querySelector<HTMLElement>(`[data-session-item="${session.id}"]`)
    if (!item) throw new Error('session item not found')

    fireEvent.contextMenu(item)
    await user.click(screen.getByText('置顶'))

    expect(onTogglePinSession).toHaveBeenCalledWith(session)
  })
})
