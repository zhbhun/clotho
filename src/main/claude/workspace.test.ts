// @vitest-environment node
import { getSessionInfo, deleteSession as sdkDeleteSession } from '@anthropic-ai/claude-agent-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteSession } from './workspace'

const sdkMocks = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  getSessionInfo: vi.fn(),
}))
const projectMocks = vi.hoisted(() => ({
  projectPathForId: vi.fn(),
}))
const fsMocks = vi.hoisted(() => ({
  rm: vi.fn(),
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => sdkMocks)
vi.mock('node:fs', () => ({ promises: fsMocks }))
vi.mock('./projects', () => ({
  addProjectFromFolder: vi.fn(),
  isWorkspaceEntry: vi.fn(),
  listClaudeProjects: vi.fn(),
  projectPathForId: projectMocks.projectPathForId,
  readRegisteredProjects: vi.fn(),
  selectFiles: vi.fn(),
  setProjectLastOpened: vi.fn(),
}))
vi.mock('./sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sessions')>()),
  listProjectSessions: vi.fn(),
}))

describe('Claude workspace session files', () => {
  beforeEach(() => {
    vi.mocked(sdkDeleteSession).mockReset()
    vi.mocked(getSessionInfo).mockReset()
    fsMocks.rm.mockReset()
    projectMocks.projectPathForId.mockReset()
  })

  it('deletes the transcript and its subagent data through the SDK', async () => {
    projectMocks.projectPathForId.mockResolvedValue('/Users/me/project')
    vi.mocked(getSessionInfo).mockResolvedValue({
      sessionId: 'session-to-delete',
    } as never)

    await deleteSession({
      projectId: 'project-1',
      sessionId: 'session-to-delete',
    })

    expect(projectMocks.projectPathForId).toHaveBeenCalledWith('project-1')
    expect(getSessionInfo).toHaveBeenCalledWith('session-to-delete', {
      dir: '/Users/me/project',
    })
    expect(sdkDeleteSession).toHaveBeenCalledWith('session-to-delete', {
      dir: '/Users/me/project',
    })
    expect(fsMocks.rm).toHaveBeenCalledWith(
      expect.stringContaining('/.claude/projects/-Users-me-project/session-to-delete'),
      { force: true, recursive: true },
    )
  })

  it('rechecks a session after a concurrent delete error', async () => {
    projectMocks.projectPathForId.mockResolvedValue('/Users/me/project')
    vi.mocked(getSessionInfo)
      .mockResolvedValueOnce({ sessionId: 'session-to-delete' } as never)
      .mockResolvedValueOnce(undefined)
    vi.mocked(sdkDeleteSession).mockRejectedValue(new Error('Session not found'))

    await expect(
      deleteSession({
        projectId: 'project-1',
        sessionId: 'session-to-delete',
      }),
    ).resolves.toBeUndefined()
    expect(fsMocks.rm).toHaveBeenCalledWith(
      expect.stringContaining('/.claude/projects/-Users-me-project/session-to-delete'),
      { force: true, recursive: true },
    )
  })

  it('removes an orphan transcript when the SDK cannot read session metadata', async () => {
    projectMocks.projectPathForId.mockResolvedValue('/Users/me/project')
    vi.mocked(getSessionInfo).mockResolvedValue(undefined)

    await deleteSession({
      projectId: 'project-1',
      sessionId: 'session-without-init',
    })

    expect(sdkDeleteSession).not.toHaveBeenCalled()
    expect(fsMocks.rm).toHaveBeenCalledWith(
      expect.stringContaining('/.claude/projects/-Users-me-project/session-without-init.jsonl'),
      { force: true },
    )
    expect(fsMocks.rm).toHaveBeenCalledWith(
      expect.stringContaining('/.claude/projects/-Users-me-project/session-without-init'),
      { force: true, recursive: true },
    )
  })

  it('rejects unsafe deletion identifiers before touching the filesystem', async () => {
    await expect(
      deleteSession({
        projectId: 'project-1',
        sessionId: '../other-session',
      }),
    ).rejects.toThrow('Invalid session id')

    expect(getSessionInfo).not.toHaveBeenCalled()
    expect(sdkDeleteSession).not.toHaveBeenCalled()
    expect(fsMocks.rm).not.toHaveBeenCalled()
  })
})
