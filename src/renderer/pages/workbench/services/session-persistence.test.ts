import { describe, expect, it, vi } from 'vitest'

import type { LocalSession } from '@/shared/session'

import { createSessionPersistence } from './session-persistence'

function storage() {
  const files = new Map<string, LocalSession>()
  return {
    files,
    readLocalSession: vi.fn(async (id: string) => structuredClone(files.get(id) ?? null)),
    writeLocalSession: vi.fn(async (id: string, data: LocalSession) => {
      files.set(id, structuredClone(data))
    }),
    deleteLocalSession: vi.fn(async (id: string) => {
      files.delete(id)
    }),
  }
}
const fileData = (id: string): LocalSession => ({
  id,
  projectId: 'project',
  projectPath: '/project',
  claudeSessionId: null,
  input: {
    prompt: '/help @src/index.ts',
    attachments: [],
    model: 'provider/org/model',
    permissionMode: 'auto',
    agent: null,
  },
})
const data = fileData('one')

describe('file session persistence', () => {
  it('loads only the opened session and round trips input with a qualified model', async () => {
    const disk = storage()
    disk.files.set('one', data)
    disk.files.set('two', fileData('two'))
    const persistence = createSessionPersistence(disk)
    await persistence.initialize()
    expect(disk.readLocalSession).not.toHaveBeenCalled()
    const record = await persistence.load('one')
    expect(record?.composer).toMatchObject({
      prompt: data.input.prompt,
      selectedProviderId: 'provider',
      selectedModelId: 'org/model',
    })
    await persistence.update('one', (current) => ({
      ...current!,
      composer: { ...current!.composer, prompt: 'edited' },
    }))
    expect(disk.files.get('one')).toEqual({ ...data, input: { ...data.input, prompt: 'edited' } })
    expect(disk.readLocalSession).toHaveBeenCalledTimes(1)
  })

  it('serializes patches after loading so input changes preserve the session metadata', async () => {
    const disk = storage()
    disk.files.set('one', data)
    const persistence = createSessionPersistence(disk)
    await Promise.all([
      persistence.update('one', (current) => ({ ...current!, claudeSessionId: 'one' })),
      persistence.update('one', (current) => ({
        ...current!,
        composer: { ...current!.composer, prompt: 'next prompt' },
      })),
    ])
    expect(disk.files.get('one')).toMatchObject({
      projectId: 'project',
      claudeSessionId: 'one',
      input: { prompt: 'next prompt' },
    })
    await persistence.remove('one')
    expect(disk.files.has('one')).toBe(false)
    expect(persistence.get('one')).toBeUndefined()
  })

  it('reports failed writes and allows a retry', async () => {
    const disk = storage()
    disk.files.set('one', data)
    disk.writeLocalSession.mockRejectedValueOnce(new Error('disk full'))
    const persistence = createSessionPersistence(disk)
    const update = () =>
      persistence.update('one', (current) => ({
        ...current!,
        composer: { ...current!.composer, prompt: 'saved' },
      }))
    await expect(update()).rejects.toThrow('disk full')
    await update()
    expect(disk.files.get('one')?.input.prompt).toBe('saved')
  })

  it('coalesces rapid updates into a single disk write', async () => {
    const disk = storage()
    disk.files.set('one', data)
    const persistence = createSessionPersistence(disk)
    await persistence.load('one')

    await Promise.all(
      ['a', 'ab', 'abc'].map((prompt) =>
        persistence.update('one', (current) => ({
          ...current!,
          composer: { ...current!.composer, prompt },
        })),
      ),
    )

    expect(disk.writeLocalSession).toHaveBeenCalledTimes(1)
    expect(disk.files.get('one')?.input.prompt).toBe('abc')
  })

  it('does not write a session that was removed before the flush landed', async () => {
    const disk = storage()
    disk.files.set('one', data)
    const persistence = createSessionPersistence(disk)

    const writing = persistence.update('one', (current) => ({
      ...current!,
      composer: { ...current!.composer, prompt: 'gone' },
    }))
    await persistence.remove('one')
    await writing

    expect(disk.files.has('one')).toBe(false)
    expect(disk.writeLocalSession).not.toHaveBeenCalled()
  })

  it('falls back to the file name when stored data carries no id', async () => {
    const disk = storage()
    const legacy = fileData('legacy')
    delete legacy.id
    disk.files.set('legacy', legacy)
    const persistence = createSessionPersistence(disk)

    expect(await persistence.load('legacy')).toMatchObject({
      id: 'legacy',
      composer: { prompt: legacy.input.prompt },
    })
  })

  it('loads a record created after an earlier missing read', async () => {
    const disk = storage()
    const persistence = createSessionPersistence(disk)

    expect(await persistence.load('one')).toBeUndefined()
    await persistence.update('one', () => ({
      id: 'one',
      projectId: data.projectId,
      projectPath: data.projectPath,
      claudeSessionId: data.claudeSessionId,
      composer: {
        prompt: data.input.prompt,
        attachments: data.input.attachments,
        selectedProviderId: 'provider',
        selectedModelId: 'org/model',
        selectedAgent: data.input.agent,
        permissionMode: data.input.permissionMode,
      },
    }))

    expect(await persistence.load('one')).toMatchObject({
      id: 'one',
      composer: { prompt: data.input.prompt },
    })
  })
})
