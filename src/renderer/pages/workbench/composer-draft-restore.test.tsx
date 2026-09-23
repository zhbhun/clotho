import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalSession } from '@/shared/session'

import { ShortcutHost } from '../../components/shortcut-host'
import { ShortcutScope } from '../../components/shortcut-scope'
import { ThemeProvider } from '../../components/theme-provider'
import { LanguageProvider } from '../../i18n/language-provider'
import { type LanguagePreference } from '../../i18n/languages'
import { appI18n, initializeAppI18n } from '../../i18n/runtime'
import { requestFromDesktop } from '../../services/desktop/client'
import { commandCatalog } from '../../services/shortcuts/catalog'
import { ShortcutRuntimeProvider, createShortcutRuntime } from '../../services/shortcuts/runtime'
import { updateUiState } from '../../services/ui-storage'
import { WorkbenchPage } from './index'
import { sessionPersistence } from './services/session-persistence'
import { useWorkbenchStore } from './stores/workbench-store'

vi.mock('../../services/desktop/client', () => ({
  isDesktopRuntime: () => true,
  requestFromDesktop: vi.fn(async () => null),
  listenDesktopEvent: vi.fn(() => Promise.resolve(() => {})),
}))

const PROJECT = {
  id: 'proj-1',
  path: '/Users/test/proj-1',
  workspace_id: 'proj-1',
  name: 'Project One',
  created_at: 1,
  sessions: ['hist-1'],
}

const HIST_SESSION = {
  id: 'hist-1',
  claudeSessionId: 'hist-1',
  project_id: 'proj-1',
  project_path: PROJECT.path,
  created_at: 10,
  title: 'Historical session',
}

const HIST_FILE: LocalSession = {
  id: 'hist-1',
  projectId: 'proj-1',
  projectPath: PROJECT.path,
  claudeSessionId: 'hist-1',
  input: {
    prompt: 'saved draft text',
    attachments: [],
    model: null,
    permissionMode: 'auto',
    agent: null,
  },
}

const sessionWrites: Array<{ sessionId: string; data: LocalSession }> = []

describe('composer draft restore on startup', () => {
  beforeEach(async () => {
    await initializeAppI18n('en', ['en-US'])
    localStorage.clear()
    await Promise.all(
      sessionPersistence.all().map((record) => sessionPersistence.remove(record.id)),
    )
    useWorkbenchStore.getState().reset()
    sessionWrites.length = 0
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

    // The previous run left the historical session open and active.
    updateUiState({
      currentWorkspaceKey: `project:${PROJECT.id}`,
      tabsByWorkspace: { [`project:${PROJECT.id}`]: ['hist-1'] },
      activeSessionByWorkspace: { [`project:${PROJECT.id}`]: 'hist-1' },
      pinnedSessionIds: [],
      unreadSessionActivity: {},
    })
    // The store singleton rehydrated at import time; replay rehydration the
    // way a fresh app start applies the persisted UI state.
    await useWorkbenchStore.persist.rehydrate()

    vi.mocked(requestFromDesktop).mockImplementation(async (command, params) => {
      if (command === 'claudeListProjects') return [PROJECT]
      if (command === 'claudeListSessions') {
        const projectId = (params as { projectId?: string }).projectId
        return projectId === PROJECT.id ? [HIST_SESSION] : []
      }
      if (command === 'claudeGetProjectGitBranch') return null
      if (command === 'sessionListDrafts') return {}
      if (command === 'sessionRead') {
        const sessionId = (params as { sessionId?: string }).sessionId
        return sessionId === 'hist-1' ? HIST_FILE : null
      }
      if (command === 'sessionWrite') {
        const { sessionId, data } = params as { sessionId: string; data: LocalSession }
        sessionWrites.push({ sessionId, data })
        return undefined
      }
      if (command === 'claudeGetSessionMessages') return []
      if (command === 'claudeStartup') {
        return { cwd: PROJECT.path, commands: [], agents: [], models: [] }
      }
      return null
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(requestFromDesktop).mockReset()
    useWorkbenchStore.getState().reset()
  })

  it('restores the persisted prompt and never rewrites it as empty', async () => {
    const runtime = createShortcutRuntime({
      catalog: commandCatalog,
      client: { load: async () => ({}), reset: async () => ({}), set: async () => ({}) },
      platform: 'mac',
    })
    const { container } = render(
      <LanguageProvider
        initialPreference={(appI18n.resolvedLanguage ?? 'en') as LanguagePreference}
        instance={appI18n}
      >
        <ThemeProvider>
          <ShortcutRuntimeProvider runtime={runtime}>
            <ShortcutScope scope="workbench">
              <ShortcutHost />
              <WorkbenchPage />
            </ShortcutScope>
          </ShortcutRuntimeProvider>
        </ThemeProvider>
      </LanguageProvider>,
    )

    await waitFor(
      () => {
        expect(useWorkbenchStore.getState().currentSessionId).toBe('hist-1')
      },
      { timeout: 3000 },
    )

    // Hydration applies the persisted composer from the local session file,
    // and the editor's editable handling never echoes an empty document over
    // it (mount, loading flip, or disabled transition).
    await waitFor(
      () => {
        const editor = container.querySelector('[data-prompt-editor]')
        expect(editor?.textContent).toContain('saved draft text')
      },
      { timeout: 3000 },
    )
    await new Promise((resolve) => setTimeout(resolve, 300))

    const writes = sessionWrites.filter((write) => write.sessionId === 'hist-1')
    for (const write of writes) {
      expect(write.data.input.prompt).toBe('saved draft text')
    }
  })
})
