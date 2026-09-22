import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/shadcn/sidebar'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import { commandCatalog } from '../../../services/shortcuts/catalog'
import { ShortcutRuntimeProvider, createShortcutRuntime } from '../../../services/shortcuts/runtime'
import type { WorkbenchProject } from '../stores/workbench-store'
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

function renderHeader(
  {
    projectMode = 'home',
    selectedProject,
  }: {
    projectMode?: 'project' | 'home'
    selectedProject?: WorkbenchProject
  } = {},
  { isMobile = false }: { isMobile?: boolean } = {},
) {
  const onSelectProject = vi.fn()
  const onProjectSwitcherOpenChange = vi.fn()
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
        <SidebarProvider defaultOpen>
          <ConversationHeader
            activeSessionId={null}
            historyOpen={false}
            historySessions={[]}
            isContentScrolled={false}
            projectMode={projectMode}
            projectName={selectedProject ? 'Demo' : 'Clotho'}
            projectSwitcherOpen={false}
            projects={selectedProject ? [selectedProject] : []}
            pinnedSessionIds={new Set()}
            selectedProject={selectedProject}
            sessionActivity={{}}
            sessions={[]}
            onAddProject={vi.fn()}
            onCloseSession={vi.fn()}
            onDeleteSession={vi.fn()}
            onHistoryOpenChange={vi.fn()}
            onProjectSwitcherOpenChange={onProjectSwitcherOpenChange}
            onRenameSession={vi.fn()}
            onSelectProject={onSelectProject}
            onSelectSession={vi.fn()}
            onTogglePinSession={vi.fn()}
          />
        </SidebarProvider>
      </TooltipProvider>
    </ShortcutRuntimeProvider>,
  )

  return { onSelectProject, onProjectSwitcherOpenChange }
}

describe('ConversationHeader', () => {
  it('exits to the home workspace when the close button is clicked in project mode', async () => {
    await appI18n.changeLanguage('zh-CN')
    const { onSelectProject, onProjectSwitcherOpenChange } = renderHeader({
      projectMode: 'project',
      selectedProject: project,
    })

    fireEvent.click(screen.getByRole('button', { name: appI18n.t('workbench.project.exit') }))

    expect(onSelectProject).toHaveBeenCalledWith(null)
    expect(onProjectSwitcherOpenChange).toHaveBeenCalledWith(false)
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
})
