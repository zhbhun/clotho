import { afterEach, describe, expect, it, vi } from 'vitest'

import { partializeWorkbenchState, useWorkbenchStore } from './workbench-store'

const PROJECT = {
  id: 'project-1',
  workspace_id: 'project-workspace',
  path: '/Users/me/project',
  sessions: ['claude-session-1'],
  created_at: 0,
}

const REMOTE_SESSION = {
  id: 'claude-session-1',
  project_id: PROJECT.id,
  project_path: PROJECT.path,
  created_at: 1,
  title: 'Existing session',
}

const SECOND_PROJECT = {
  id: 'project-2',
  workspace_id: 'second-workspace',
  path: '/Users/me/second-project',
  sessions: ['claude-session-2'],
  created_at: 0,
}

const SECOND_SESSION = {
  id: 'claude-session-2',
  project_id: SECOND_PROJECT.id,
  project_path: SECOND_PROJECT.path,
  created_at: 2,
  title: 'Second project session',
}

function loadCatalog() {
  useWorkbenchStore.getState().replaceCatalog({
    projects: [PROJECT],
    sessions: { [PROJECT.id]: [REMOTE_SESSION] },
    branches: { [PROJECT.id]: 'main' },
  })
}

function togglePin(sessionId: string) {
  const togglePinSession = useWorkbenchStore.getState().togglePinSession
  expect(togglePinSession).toBeTypeOf('function')
  togglePinSession?.(sessionId)
}

describe('useWorkbenchStore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    useWorkbenchStore.getState().reset()
  })

  it('normalizes projects and sessions while keeping selection in one global store', () => {
    loadCatalog()
    useWorkbenchStore.getState().selectSession(REMOTE_SESSION.id)

    const state = useWorkbenchStore.getState()
    expect(state.projects[PROJECT.id]).toMatchObject({
      sessions: [REMOTE_SESSION.id],
      gitBranch: 'main',
    })
    expect(state.sessions[REMOTE_SESSION.id]).toMatchObject({
      id: REMOTE_SESSION.id,
      claudeSessionId: REMOTE_SESSION.id,
    })
    const persisted = partializeWorkbenchState(state)
    expect(persisted).toMatchObject({
      currentWorkspaceKey: 'project:project-workspace',
      tabsByWorkspace: {
        'project:project-workspace': [REMOTE_SESSION.id],
      },
      activeSessionByWorkspace: {
        'project:project-workspace': REMOTE_SESSION.id,
      },
    })
    expect(persisted).not.toHaveProperty('projects')
    expect(persisted).not.toHaveProperty('sessions')
    expect(persisted).not.toHaveProperty('availableModels')
    expect(persisted).not.toHaveProperty('runtimeStatus')
  })

  it('persists pinned session ids and toggles them without duplicates', () => {
    loadCatalog()

    togglePin(REMOTE_SESSION.id)
    togglePin(REMOTE_SESSION.id)
    togglePin(REMOTE_SESSION.id)

    expect(useWorkbenchStore.getState().pinnedSessionIds).toEqual([REMOTE_SESSION.id])
    expect(partializeWorkbenchState(useWorkbenchStore.getState()).pinnedSessionIds).toEqual([
      REMOTE_SESSION.id,
    ])
  })

  it('drops stale pinned ids when the refreshed catalog no longer contains a session', () => {
    loadCatalog()
    togglePin(REMOTE_SESSION.id)

    useWorkbenchStore.getState().replaceCatalog({
      projects: [{ ...PROJECT, sessions: [] }],
      sessions: { [PROJECT.id]: [] },
      branches: { [PROJECT.id]: 'main' },
    })

    expect(useWorkbenchStore.getState().pinnedSessionIds).toEqual([])
  })

  it('keeps project and Claude tabs in independent workspaces', () => {
    loadCatalog()
    const claudeDraft = useWorkbenchStore.getState().createDraftSession(null, 'Claude draft')

    useWorkbenchStore.getState().selectSession(REMOTE_SESSION.id)
    useWorkbenchStore.getState().selectSession(claudeDraft)

    expect(useWorkbenchStore.getState()).toMatchObject({
      tabsByWorkspace: {
        'project:project-workspace': [REMOTE_SESSION.id],
        claude: [claudeDraft],
      },
      activeSessionByWorkspace: {
        'project:project-workspace': REMOTE_SESSION.id,
        claude: claudeDraft,
      },
    })
  })

  it('restores the active tab when switching between project workspaces', () => {
    useWorkbenchStore.getState().replaceCatalog({
      projects: [PROJECT, SECOND_PROJECT],
      sessions: {
        [PROJECT.id]: [REMOTE_SESSION],
        [SECOND_PROJECT.id]: [SECOND_SESSION],
      },
      branches: { [PROJECT.id]: 'main', [SECOND_PROJECT.id]: 'main' },
    })
    useWorkbenchStore.getState().selectSession(REMOTE_SESSION.id)
    useWorkbenchStore.getState().selectSession(SECOND_SESSION.id)

    const { selectWorkspace } = useWorkbenchStore.getState()

    selectWorkspace(PROJECT.id)
    expect(useWorkbenchStore.getState()).toMatchObject({
      currentProjectId: PROJECT.id,
      currentSessionId: REMOTE_SESSION.id,
    })

    selectWorkspace(SECOND_PROJECT.id)
    expect(useWorkbenchStore.getState()).toMatchObject({
      currentProjectId: SECOND_PROJECT.id,
      currentSessionId: SECOND_SESSION.id,
    })
  })

  it('closes the active tab and selects its right-hand neighbor', () => {
    loadCatalog()
    useWorkbenchStore.getState().selectSession(REMOTE_SESSION.id)
    const second = useWorkbenchStore.getState().createDraftSession(PROJECT.id, 'Second')
    const third = useWorkbenchStore.getState().createDraftSession(PROJECT.id, 'Third')

    useWorkbenchStore.getState().selectSession(second)
    useWorkbenchStore.getState().selectSession(third)
    useWorkbenchStore.getState().selectSession(second)
    useWorkbenchStore.getState().closeSession(second)

    expect(useWorkbenchStore.getState()).toMatchObject({
      currentSessionId: third,
      tabsByWorkspace: {
        'project:project-workspace': [REMOTE_SESSION.id, third],
      },
      activeSessionByWorkspace: {
        'project:project-workspace': third,
      },
    })
  })

  it('lands on a fresh blank draft when the last tab of a workspace closes', () => {
    loadCatalog()
    useWorkbenchStore.getState().selectSession(REMOTE_SESSION.id)
    useWorkbenchStore.getState().closeSession(REMOTE_SESSION.id)

    const state = useWorkbenchStore.getState()
    const draftId = state.currentSessionId
    expect(state.sessions[draftId ?? '']).toMatchObject({
      isDraft: true,
      isUnsavedDraft: true,
      claudeSessionId: null,
      project_id: PROJECT.id,
      title: 'New Chat',
    })
    expect(state.tabsByWorkspace['project:project-workspace']).toEqual([draftId])
    expect(state.activeSessionByWorkspace['project:project-workspace']).toBe(draftId)
    // Closing keeps the session card itself in the history list.
    expect(state.sessions[REMOTE_SESSION.id]).toBeDefined()
  })

  it('lands on a fresh blank draft when the last session of a workspace is removed', () => {
    loadCatalog()
    useWorkbenchStore.getState().selectSession(REMOTE_SESSION.id)
    useWorkbenchStore.getState().removeSession(REMOTE_SESSION.id)

    const state = useWorkbenchStore.getState()
    const draftId = state.currentSessionId
    expect(state.sessions[draftId ?? '']).toMatchObject({
      isDraft: true,
      isUnsavedDraft: true,
      project_id: PROJECT.id,
    })
    expect(state.sessions[REMOTE_SESSION.id]).toBeUndefined()
  })

  it('keeps a draft local id stable after Claude assigns its session id', () => {
    loadCatalog()
    const draftId = useWorkbenchStore.getState().createDraftSession(PROJECT.id)
    useWorkbenchStore.getState().selectProject(PROJECT.id, draftId)
    useWorkbenchStore.getState().bindClaudeSession(draftId, 'claude-created-session')

    expect(draftId).toMatch(/^[0-9a-f-]{36}$/)
    expect(useWorkbenchStore.getState().currentSessionId).toBe(draftId)
    expect(useWorkbenchStore.getState().sessions[draftId]).toMatchObject({
      id: draftId,
      claudeSessionId: 'claude-created-session',
    })
    expect(useWorkbenchStore.getState().projects[PROJECT.id].sessions).toContain(draftId)
  })

  it('merges a remote card when a local draft binds to the same Claude session', () => {
    loadCatalog()
    const draftId = useWorkbenchStore.getState().createDraftSession(PROJECT.id, 'Draft')
    useWorkbenchStore.getState().selectSession(draftId)
    useWorkbenchStore.getState().bindClaudeSession(draftId, REMOTE_SESSION.id)

    expect(useWorkbenchStore.getState().sessions[REMOTE_SESSION.id]).toBeUndefined()
    expect(useWorkbenchStore.getState().sessions[draftId]).toMatchObject({
      claudeSessionId: REMOTE_SESSION.id,
    })
    expect(useWorkbenchStore.getState().projects[PROJECT.id].sessions).toEqual([draftId])
    expect(useWorkbenchStore.getState().tabsByWorkspace['project:project-workspace']).toEqual([
      draftId,
    ])
  })

  it('preserves independent drafts with the same title when a session binds', () => {
    loadCatalog()
    const otherId = useWorkbenchStore.getState().createDraftSession(PROJECT.id)
    const activeId = useWorkbenchStore.getState().createDraftSession(PROJECT.id)

    useWorkbenchStore.getState().bindClaudeSession(activeId, 'claude-created-session')

    expect(useWorkbenchStore.getState().sessions[otherId]).toMatchObject({
      id: otherId,
      title: 'New Chat',
      claudeSessionId: null,
      isDraft: true,
    })
    expect(useWorkbenchStore.getState().sessions[activeId]).toMatchObject({
      claudeSessionId: 'claude-created-session',
    })
    expect(useWorkbenchStore.getState().projects[PROJECT.id].sessions).toEqual([
      activeId,
      otherId,
      REMOTE_SESSION.id,
    ])
  })

  it('adds a content-backed draft to its workspace tabs without selecting it', () => {
    loadCatalog()

    const draftId = useWorkbenchStore
      .getState()
      .createDraftSession(PROJECT.id, 'Review the API migration')

    expect(useWorkbenchStore.getState()).toMatchObject({
      currentSessionId: null,
      tabsByWorkspace: {
        'project:project-workspace': [draftId],
      },
    })
    expect(useWorkbenchStore.getState().sessions[draftId]).toMatchObject({
      isDraft: true,
      project_id: PROJECT.id,
      title: 'Review the API migration',
    })
  })

  it('marks a draft as started on its first send', () => {
    const draftId = useWorkbenchStore.getState().createDraftSession(null, 'Send this')

    useWorkbenchStore.getState().markSessionStarted(draftId)

    expect(useWorkbenchStore.getState().sessions[draftId]?.isDraft).toBe(false)
  })

  it('keeps a started session started when a refresh reads a stale drafts index', () => {
    const draftId = useWorkbenchStore.getState().createDraftSession(PROJECT.id)
    useWorkbenchStore.getState().bindClaudeSession(draftId, 'claude-created-session')
    useWorkbenchStore.getState().markSessionStarted(draftId)

    // The refresh's drafts index predates the completeLocalDraft write.
    useWorkbenchStore.getState().replaceCatalog({
      projects: [PROJECT],
      sessions: {
        [PROJECT.id]: [{ ...REMOTE_SESSION, id: 'claude-created-session', title: 'Created' }],
      },
      branches: { [PROJECT.id]: 'main' },
      drafts: {
        [draftId]: {
          title: 'New Chat',
          createdAt: 1,
          updatedAt: 2,
          projectId: PROJECT.id,
          projectPath: PROJECT.path,
        },
      },
    })

    expect(useWorkbenchStore.getState().sessions[draftId]?.isDraft).toBe(false)
  })

  it('refreshes the last edited time only while a session is a draft', () => {
    const draftId = useWorkbenchStore.getState().createDraftSession(null, 'Keep editing')
    const initialTime = useWorkbenchStore.getState().sessions[draftId]?.created_at ?? 0
    const now = vi.spyOn(Date, 'now').mockReturnValue((initialTime + 120) * 1000)
    const touchDraftSession = useWorkbenchStore.getState().touchDraftSession

    expect(touchDraftSession).toBeTypeOf('function')
    touchDraftSession?.(draftId)
    expect(useWorkbenchStore.getState().sessions[draftId]?.created_at).toBe(initialTime)
    expect(useWorkbenchStore.getState().sessions[draftId]?.updated_at).toBe(initialTime + 120)

    useWorkbenchStore.getState().markSessionStarted(draftId)
    now.mockReturnValue((initialTime + 240) * 1000)
    touchDraftSession?.(draftId)
    expect(useWorkbenchStore.getState().sessions[draftId]?.created_at).toBe(initialTime)
    expect(useWorkbenchStore.getState().sessions[draftId]?.updated_at).toBe(initialTime + 120)
  })

  it('selects the next tab after deleting the active draft', () => {
    const first = useWorkbenchStore.getState().createDraftSession(null, 'First draft')
    const second = useWorkbenchStore.getState().createDraftSession(null, 'Second draft')
    useWorkbenchStore.getState().selectSession(second)

    useWorkbenchStore.getState().removeSession(second)

    expect(useWorkbenchStore.getState()).toMatchObject({
      currentSessionId: first,
      tabsByWorkspace: { claude: [first] },
    })
  })

  it('reconciles a bound draft by claudeSessionId without replacing its local id', () => {
    loadCatalog()
    const draftId = useWorkbenchStore.getState().createDraftSession(PROJECT.id)
    useWorkbenchStore.getState().bindClaudeSession(draftId, 'claude-created-session')

    useWorkbenchStore.getState().replaceCatalog({
      projects: [{ ...PROJECT, sessions: ['claude-created-session'] }],
      sessions: {
        [PROJECT.id]: [{ ...REMOTE_SESSION, id: 'claude-created-session', title: 'Created' }],
      },
      branches: { [PROJECT.id]: 'feature/session-store' },
    })

    expect(useWorkbenchStore.getState().sessions[draftId]).toMatchObject({
      id: draftId,
      claudeSessionId: 'claude-created-session',
      title: 'Created',
    })
    expect(useWorkbenchStore.getState().sessions['claude-created-session']).toBeUndefined()
    expect(useWorkbenchStore.getState().projects[PROJECT.id].sessions).toContain(draftId)
  })

  it('keeps tab order stable when the selected session changes', () => {
    loadCatalog()
    const firstDraft = useWorkbenchStore.getState().createDraftSession(null)
    const secondDraft = useWorkbenchStore.getState().createDraftSession(null)

    useWorkbenchStore.getState().selectHome(firstDraft)
    useWorkbenchStore.getState().selectHome(secondDraft)
    useWorkbenchStore.getState().selectSession(firstDraft)

    expect(useWorkbenchStore.getState().tabsByWorkspace.claude).toEqual([firstDraft, secondDraft])
  })

  it('keeps background outcomes unread until the session is selected', () => {
    loadCatalog()
    const backgroundDraft = useWorkbenchStore.getState().createDraftSession(null)
    useWorkbenchStore.getState().selectSession(REMOTE_SESSION.id)

    useWorkbenchStore.getState().setSessionActivity(backgroundDraft, 'processing')
    expect(useWorkbenchStore.getState().sessionActivity[backgroundDraft]).toBe('processing')

    useWorkbenchStore.getState().setSessionActivity(backgroundDraft, 'success')
    expect(useWorkbenchStore.getState().sessionActivity[backgroundDraft]).toBe('unread-success')

    useWorkbenchStore.getState().setSessionActivity(backgroundDraft, 'error')
    expect(useWorkbenchStore.getState().sessionActivity[backgroundDraft]).toBe('unread-error')

    useWorkbenchStore.getState().selectSession(backgroundDraft)
    expect(useWorkbenchStore.getState().sessionActivity[backgroundDraft]).toBe('idle')
  })

  it('keeps an awaiting-user session actionable when it is selected', () => {
    loadCatalog()
    const backgroundDraft = useWorkbenchStore.getState().createDraftSession(null)

    useWorkbenchStore.getState().setSessionActivity(backgroundDraft, 'awaiting-user')
    expect(useWorkbenchStore.getState().sessionActivity[backgroundDraft]).toBe('awaiting-user')

    useWorkbenchStore.getState().selectSession(backgroundDraft)
    expect(useWorkbenchStore.getState().sessionActivity[backgroundDraft]).toBe('awaiting-user')

    useWorkbenchStore.getState().setSessionActivity(backgroundDraft, 'processing')
    expect(useWorkbenchStore.getState().sessionActivity[backgroundDraft]).toBe('processing')
  })

  it('closes a session without deleting its unread outcome', () => {
    loadCatalog()
    const backgroundDraft = useWorkbenchStore.getState().createDraftSession(null)
    useWorkbenchStore.getState().selectHome(backgroundDraft)
    useWorkbenchStore.getState().selectSession(REMOTE_SESSION.id)
    useWorkbenchStore.getState().setSessionActivity(backgroundDraft, 'error')

    useWorkbenchStore.getState().closeSession(backgroundDraft)

    expect(useWorkbenchStore.getState().tabsByWorkspace.claude).not.toContain(backgroundDraft)
    expect(useWorkbenchStore.getState().sessions[backgroundDraft]).toBeDefined()
    expect(useWorkbenchStore.getState().sessionActivity[backgroundDraft]).toBe('unread-error')
  })

  it('persists only unread activity', () => {
    loadCatalog()
    useWorkbenchStore.getState().selectSession(REMOTE_SESSION.id)
    useWorkbenchStore.getState().setSessionActivity(REMOTE_SESSION.id, 'awaiting-user')

    expect(partializeWorkbenchState(useWorkbenchStore.getState()).unreadSessionActivity).toEqual({})

    useWorkbenchStore.getState().selectWorkspace(null)
    useWorkbenchStore.getState().setSessionActivity(REMOTE_SESSION.id, 'error')
    expect(partializeWorkbenchState(useWorkbenchStore.getState()).unreadSessionActivity).toEqual({
      [REMOTE_SESSION.id]: 'unread-error',
    })
  })

  it('keeps a home conversation that session ownership excludes from every project catalog', () => {
    loadCatalog()
    // A home conversation whose local id was rebuilt from the Claude session
    // id: ownership (projectId null) keeps it out of every project catalog,
    // so the catalog alone can never restore it.
    const homeSession = {
      ...REMOTE_SESSION,
      id: 'claude-home-session',
      claudeSessionId: 'claude-home-session',
      project_id: '',
      project_path: '',
      title: 'hello333?',
    }
    useWorkbenchStore.setState((state) => ({
      sessions: { ...state.sessions, [homeSession.id]: homeSession },
      currentProjectId: null,
      currentSessionId: homeSession.id,
      currentWorkspaceKey: 'claude',
      projectMode: 'home',
      tabsByWorkspace: {
        'project:project-workspace': [REMOTE_SESSION.id],
        claude: [homeSession.id],
      },
      activeSessionByWorkspace: {
        'project:project-workspace': REMOTE_SESSION.id,
        claude: homeSession.id,
      },
    }))

    loadCatalog()

    expect(useWorkbenchStore.getState().sessions[homeSession.id]).toBeDefined()
    expect(useWorkbenchStore.getState().currentSessionId).toBe(homeSession.id)
    expect(useWorkbenchStore.getState().tabsByWorkspace.claude).toContain(homeSession.id)
  })

  it('removes missing tabs during catalog refresh and selects a remaining neighbor', () => {
    loadCatalog()
    const missingSession = {
      ...REMOTE_SESSION,
      id: 'missing-session',
      claudeSessionId: 'missing-session',
      title: 'Missing session',
    }
    useWorkbenchStore.setState((state) => ({
      sessions: { ...state.sessions, [missingSession.id]: missingSession },
      currentProjectId: PROJECT.id,
      currentSessionId: missingSession.id,
      currentWorkspaceKey: 'project:project-workspace',
      projectMode: 'project',
      tabsByWorkspace: {
        'project:project-workspace': [REMOTE_SESSION.id, missingSession.id],
      },
      activeSessionByWorkspace: {
        'project:project-workspace': missingSession.id,
      },
    }))

    loadCatalog()

    expect(useWorkbenchStore.getState()).toMatchObject({
      currentSessionId: REMOTE_SESSION.id,
      tabsByWorkspace: {
        'project:project-workspace': [REMOTE_SESSION.id],
      },
      activeSessionByWorkspace: {
        'project:project-workspace': REMOTE_SESSION.id,
      },
    })
  })
})
