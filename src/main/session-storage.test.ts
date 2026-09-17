import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from 'vitest'

import { projectIdFromPath } from './claude/sessions'
import { createSessionStorage } from './session-storage'

test('writes and reads drafts and completion preserves input', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clotho-session-'))
  const store = createSessionStorage(dir)
  const data = {
    projectId: 'p',
    projectPath: '/p',
    claudeSessionId: null,
    input: {
      prompt: 'hi',
      attachments: [],
      model: null,
      permissionMode: 'default' as const,
      agent: null,
    },
  }
  await store.sessionWrite({
    sessionId: 's1',
    data,
    draft: { title: 'T', createdAt: 1, updatedAt: 2, projectId: 'p', projectPath: '/p' },
  })
  // Stored ids predate the digest scheme, so reads recompute them from the path.
  expect(await store.sessionListDrafts()).toEqual({
    s1: {
      title: 'T',
      createdAt: 1,
      updatedAt: 2,
      projectId: projectIdFromPath('/p'),
      projectPath: '/p',
    },
  })
  await store.sessionCompleteDraft({ sessionId: 's1' })
  expect(await store.sessionRead({ sessionId: 's1' })).toEqual({
    ...data,
    projectId: projectIdFromPath('/p'),
  })
  expect(await store.sessionListDrafts()).toEqual({})
})

test('concurrent writes do not lose updates and a corrupt index reads as empty', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clotho-session-'))
  const store = createSessionStorage(dir)
  const base = (prompt: string) => ({
    projectId: null,
    projectPath: null,
    claudeSessionId: null,
    input: {
      prompt,
      attachments: [],
      model: null,
      permissionMode: 'default' as const,
      agent: null,
    },
  })
  await Promise.all(
    ['a', 'b', 'c'].map((id) =>
      store.sessionWrite({
        sessionId: id,
        data: base(id),
        draft: { title: id, createdAt: 1, updatedAt: 1, projectId: null, projectPath: null },
      }),
    ),
  )
  expect(Object.keys(await store.sessionListDrafts())).toHaveLength(3)
  await writeFile(path.join(dir, 'drafts.json'), '{bad')
  await expect(store.sessionListDrafts()).resolves.toEqual({})
})

test('malformed index entries are skipped individually', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clotho-session-'))
  const store = createSessionStorage(dir)
  await writeFile(
    path.join(dir, 'drafts.json'),
    JSON.stringify({
      good: { title: 'T', createdAt: 1, updatedAt: 2, projectId: null, projectPath: null },
      'bad entry': { title: 'T', createdAt: 1, updatedAt: 2, projectId: null, projectPath: null },
      broken: { title: 'T' },
    }),
  )

  await expect(store.sessionListDrafts()).resolves.toEqual({
    good: { title: 'T', createdAt: 1, updatedAt: 2, projectId: null, projectPath: null },
  })
})

test('a malformed session file reads as missing and can be overwritten', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clotho-session-'))
  const store = createSessionStorage(dir)
  await writeFile(path.join(dir, 's1.json'), '{bad')

  await expect(store.sessionRead({ sessionId: 's1' })).resolves.toBeNull()

  const data = {
    projectId: null,
    projectPath: null,
    claudeSessionId: null,
    input: {
      prompt: 'repaired',
      attachments: [],
      model: null,
      permissionMode: 'default' as const,
      agent: null,
    },
  }
  await store.sessionWrite({ sessionId: 's1', data })
  await expect(store.sessionRead({ sessionId: 's1' })).resolves.toEqual(data)
})

test('project deletion skips a corrupt file instead of aborting', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clotho-session-'))
  const store = createSessionStorage(dir)
  const data = {
    projectId: 'project-a',
    projectPath: '/project-a',
    claudeSessionId: null,
    input: {
      prompt: 'session A',
      attachments: [],
      model: null,
      permissionMode: 'default' as const,
      agent: null,
    },
  }
  await store.sessionWrite({ sessionId: 'session-a', data })
  await writeFile(path.join(dir, 'corrupt.json'), '{bad')

  // The stored legacy id is matched by its path digest after migration.
  await store.sessionDeleteProject({ projectId: projectIdFromPath('/project-a') })

  expect(await store.sessionRead({ sessionId: 'session-a' })).toBeNull()
})

test('project deletion removes only that project sessions and draft entries', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clotho-session-'))
  const store = createSessionStorage(dir)
  const session = (projectId: string, prompt: string) => ({
    projectId,
    projectPath: `/${projectId}`,
    claudeSessionId: null,
    input: {
      prompt,
      attachments: [],
      model: null,
      permissionMode: 'default' as const,
      agent: null,
    },
  })
  const draft = (projectId: string, title: string) => ({
    title,
    createdAt: 1,
    updatedAt: 2,
    projectId,
    projectPath: `/${projectId}`,
  })

  await store.sessionWrite({
    sessionId: 'project-a-draft',
    data: session('project-a', 'draft A'),
    draft: draft('project-a', 'Draft A'),
  })
  await store.sessionWrite({
    sessionId: 'project-a-session',
    data: session('project-a', 'session A'),
  })
  await store.sessionWrite({
    sessionId: 'project-b-draft',
    data: session('project-b', 'draft B'),
    draft: draft('project-b', 'Draft B'),
  })

  await store.sessionDeleteProject({ projectId: projectIdFromPath('/project-a') })

  expect(await store.sessionRead({ sessionId: 'project-a-draft' })).toBeNull()
  expect(await store.sessionRead({ sessionId: 'project-a-session' })).toBeNull()
  expect(await store.sessionRead({ sessionId: 'project-b-draft' })).toEqual({
    ...session('project-b', 'draft B'),
    projectId: projectIdFromPath('/project-b'),
  })
  expect(await store.sessionListDrafts()).toEqual({
    'project-b-draft': {
      ...draft('project-b', 'Draft B'),
      projectId: projectIdFromPath('/project-b'),
    },
  })
})
