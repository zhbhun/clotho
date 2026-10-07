import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SidebarProvider, useSidebar } from '@/shadcn/sidebar'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import { commandCatalog } from '../../../services/shortcuts/catalog'
import { ShortcutRuntimeProvider, createShortcutRuntime } from '../../../services/shortcuts/runtime'
import type { WorkbenchProject, WorkbenchSession } from '../stores/workbench-store'
import { ConversationHeader } from './header'

const project: WorkbenchProject = {
  id: 'project-1',
  path: '/tmp/demo',
  name: 'Demo',
  sessions: [],
  created_at: 0,
}

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
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })
})

function HoverPreviewStateProbe() {
  const { hoverPreview, setOpen } = useSidebar()
  return (
    <>
      <div data-hover-preview-open={hoverPreview ? 'true' : 'false'} />
      <button data-testid="collapse-probe" type="button" onClick={() => setOpen(false)}>
        collapse
      </button>
    </>
  )
}

function renderHeader(
  {
    activeSessionId = null,
    projectMode = 'home',
    selectedProject,
    sessions = [],
  }: {
    activeSessionId?: string | null
    projectMode?: 'project' | 'home'
    selectedProject?: WorkbenchProject
    sessions?: WorkbenchSession[]
  } = {},
  { defaultOpen = true, isMobile = false }: { defaultOpen?: boolean; isMobile?: boolean } = {},
) {
  const onSelectProject = vi.fn()
  Object.defineProperty(window, 'innerWidth', {
    value: isMobile ? 500 : 1200,
    configurable: true,
  })
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: isMobile && query.includes('max-width'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
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

  render(
    <ShortcutRuntimeProvider runtime={runtime}>
      <TooltipProvider delay={0}>
        <SidebarProvider defaultOpen={defaultOpen}>
          <HoverPreviewStateProbe />
          <ConversationHeader
            activeSessionId={activeSessionId}
            historyError={null}
            historyIsLoading={false}
            historySessions={sessions}
            isContentScrolled={false}
            projectMode={projectMode}
            projectName={selectedProject ? 'Demo' : 'Clotho'}
            projects={selectedProject ? [selectedProject] : []}
            pinnedSessionIds={new Set()}
            selectedProject={selectedProject}
            sessionActivity={{}}
            sessions={sessions}
            onAddProject={vi.fn()}
            onCloseSession={vi.fn()}
            onDeleteSession={vi.fn()}
            onRenameSession={vi.fn()}
            onSelectProject={onSelectProject}
            onSelectSession={vi.fn()}
            onRetryHistory={vi.fn()}
            onTogglePinSession={vi.fn()}
          />
        </SidebarProvider>
      </TooltipProvider>
    </ShortcutRuntimeProvider>,
  )

  return { onSelectProject }
}

describe('ConversationHeader', () => {
  it('exits to the home workspace when the close button is clicked in project mode', async () => {
    await appI18n.changeLanguage('zh-CN')
    const { onSelectProject } = renderHeader({
      projectMode: 'project',
      selectedProject: project,
    })

    fireEvent.click(screen.getByRole('button', { name: appI18n.t('workbench.project.exit') }))

    expect(onSelectProject).toHaveBeenCalledWith(null)
  })

  it('offers no exit outside project mode', async () => {
    await appI18n.changeLanguage('zh-CN')
    renderHeader()

    expect(screen.queryByRole('button', { name: appI18n.t('workbench.project.exit') })).toBeNull()
  })

  it('reserves the macOS traffic-light inset when the narrow-window sheet replaces the sidebar', () => {
    renderHeader({}, { isMobile: true })

    const header = document.querySelector('header')
    expect(header).not.toBeNull()
    expect(header).toHaveClass('pl-[84px]')
    expect(document.querySelector('[data-sidebar="trigger"]')).not.toBeNull()
  })

  it('drops the project and history controls while a tab-less new-chat draft is active', async () => {
    await appI18n.changeLanguage('zh-CN')
    renderHeader({ activeSessionId: 'draft-1' })

    expect(document.querySelector('[data-window-project-title]')).toBeNull()
    expect(screen.queryByRole('button', { name: appI18n.t('workbench.history.title') })).toBeNull()
    expect(document.querySelector('.session-tab-actions')).toBeNull()
  })

  it('opens the sidebar hover preview after the pointer rests on the collapsed trigger', () => {
    vi.useFakeTimers()
    try {
      renderHeader({}, { defaultOpen: false })
      const probe = document.querySelector('[data-hover-preview-open]')
      if (!probe) throw new Error('hover preview probe not found')
      expect(probe).toHaveAttribute('data-hover-preview-open', 'false')

      fireEvent.mouseOver(screen.getByRole('button', { name: 'Toggle Sidebar' }))
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(probe).toHaveAttribute('data-hover-preview-open', 'false')

      act(() => {
        vi.advanceTimersByTime(50)
      })
      expect(probe).toHaveAttribute('data-hover-preview-open', 'true')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the collapsed sidebar hidden when the pointer leaves before the delay', () => {
    vi.useFakeTimers()
    try {
      renderHeader({}, { defaultOpen: false })
      const probe = document.querySelector('[data-hover-preview-open]')
      if (!probe) throw new Error('hover preview probe not found')

      fireEvent.mouseOver(screen.getByRole('button', { name: 'Toggle Sidebar' }))
      act(() => {
        vi.advanceTimersByTime(100)
      })
      fireEvent.mouseOut(screen.getByRole('button', { name: 'Toggle Sidebar' }))
      act(() => {
        vi.advanceTimersByTime(200)
      })

      expect(probe).toHaveAttribute('data-hover-preview-open', 'false')
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds the hover preview after a collapse until the pointer moves again', () => {
    vi.useFakeTimers()
    try {
      renderHeader()
      fireEvent.click(screen.getByTestId('collapse-probe'))
      const trigger = screen.getByRole('button', { name: 'Toggle Sidebar' })
      const probe = document.querySelector('[data-hover-preview-open]')
      if (!probe) throw new Error('hover preview probe not found')

      // Collapsing remounts the trigger under the stationary pointer; its
      // synthesized hover must not reopen the panel.
      fireEvent.mouseOver(trigger)
      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(probe).toHaveAttribute('data-hover-preview-open', 'false')

      // A real move plus a fresh entry onto the trigger arms the preview.
      fireEvent.mouseMove(document, { clientX: 40, clientY: 40 })
      fireEvent.mouseOut(trigger)
      fireEvent.mouseOver(trigger)
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(probe).toHaveAttribute('data-hover-preview-open', 'true')
    } finally {
      vi.useRealTimers()
    }
  })
})
