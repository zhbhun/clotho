import { describe, expect, it } from 'vitest'

import type { LocalSession } from '@/shared/session'

import { type SessionComposer, createSessionPersistence } from '../../services/session-persistence'
import { sanitizeSessionPreferences, saveSessionPreferences } from './session-preferences'

function storage(files: Map<string, LocalSession>) {
  return {
    readLocalSession: async (id: string) => structuredClone(files.get(id) ?? null),
    writeLocalSession: async (id: string, data: LocalSession) => {
      files.set(id, structuredClone(data))
    },
    deleteLocalSession: async (id: string) => {
      files.delete(id)
    },
  }
}

const preferences: SessionComposer = {
  prompt: 'typed before hydration finished',
  selectedProviderId: null,
  selectedModelId: null,
  selectedAgent: null,
  permissionMode: 'default',
}

describe('sanitizeSessionPreferences', () => {
  it('restores defaults when persisted composer data has no prompt', () => {
    const persisted = {
      selectedProviderId: null,
      selectedModelId: null,
      selectedAgent: null,
      permissionMode: 'default',
    } as SessionComposer

    expect(sanitizeSessionPreferences(persisted, 'default')).toMatchObject({
      prompt: '',
      selectedProviderId: null,
      selectedModelId: null,
      selectedAgent: null,
      permissionMode: 'default',
    })
  })

  it('restores the cancellation marker with the composer input', () => {
    expect(
      sanitizeSessionPreferences(
        {
          prompt: 'retry this',
          recalledFromMessage: 'cancelled-message',
          permissionMode: 'default',
        },
        'default',
      ),
    ).toMatchObject({
      prompt: 'retry this',
      recalledFromMessage: 'cancelled-message',
    })
  })
})

describe('saveSessionPreferences', () => {
  it('keeps the on-disk session binding when the caller context is stale', async () => {
    const files = new Map<string, LocalSession>()
    files.set('local-1', {
      id: 'local-1',
      projectId: 'project-1',
      projectPath: '/Users/me/project',
      claudeSessionId: 'claude-bound',
      input: {
        prompt: 'old',
        attachments: [],
        model: null,
        permissionMode: 'default',
        agent: null,
      },
      contextUsage: {
        snapshot: {
          model: 'claude-sonnet',
          totalTokens: 1200,
          maxTokens: 200000,
          rawMaxTokens: 200000,
          percentage: 1,
          categories: [{ name: 'Messages', tokens: 1200 }],
        },
        anchorMessageId: 'assistant-1',
      },
    })
    const persistence = createSessionPersistence(storage(files))

    // The caller's context has not hydrated yet: claudeSessionId is still null.
    await saveSessionPreferences('local-1', preferences, persistence, {
      projectId: 'project-1',
      projectPath: '/Users/me/project',
      claudeSessionId: null,
    })
    await persistence.flush()

    expect(files.get('local-1')).toMatchObject({
      projectId: 'project-1',
      projectPath: '/Users/me/project',
      claudeSessionId: 'claude-bound',
      input: { prompt: preferences.prompt },
      contextUsage: { anchorMessageId: 'assistant-1' },
    })
  })

  it('seeds identity fields from the context when creating the record', async () => {
    const files = new Map<string, LocalSession>()
    const persistence = createSessionPersistence(storage(files))

    await saveSessionPreferences('local-1', preferences, persistence, {
      projectId: 'project-1',
      projectPath: '/Users/me/project',
      claudeSessionId: 'claude-bound',
    })
    await persistence.flush()

    expect(files.get('local-1')).toMatchObject({
      projectId: 'project-1',
      projectPath: '/Users/me/project',
      claudeSessionId: 'claude-bound',
      input: { prompt: preferences.prompt },
    })
  })
})
