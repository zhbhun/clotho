import { describe, expect, it, vi } from 'vitest'

import { createProjectModelSaveQueue } from './project-model-save'

type ModelSelection = {
  providerId?: string
  modelId?: string
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('createProjectModelSaveQueue', () => {
  it('serializes rapid selections so the latest model is persisted last', async () => {
    let current: ModelSelection = { providerId: 'provider', modelId: 'model-a' }
    const firstSave = deferred()
    const secondSave = deferred()
    const saveModel = vi
      .fn()
      .mockImplementationOnce(async () => firstSave.promise)
      .mockImplementationOnce(async () => secondSave.promise)
    const queue = createProjectModelSaveQueue({
      getModel: () => current,
      setModel: (_projectId, selection) => {
        current = selection
      },
      saveModel,
    })

    const savingB = queue.save('project-1', 'provider', 'model-b')
    const savingC = queue.save('project-1', 'provider', 'model-c')

    expect(current).toEqual({ providerId: 'provider', modelId: 'model-c' })
    await vi.waitFor(() => expect(saveModel).toHaveBeenCalledTimes(1))
    expect(saveModel).toHaveBeenNthCalledWith(1, 'project-1', 'provider', 'model-b')

    firstSave.resolve()
    await savingB
    await vi.waitFor(() => expect(saveModel).toHaveBeenCalledTimes(2))
    expect(saveModel).toHaveBeenNthCalledWith(2, 'project-1', 'provider', 'model-c')

    secondSave.resolve()
    await savingC
    expect(current).toEqual({ providerId: 'provider', modelId: 'model-c' })
  })

  it('serializes saves across projects that share the same registry file', async () => {
    const current: Record<string, ModelSelection> = {
      'project-1': { providerId: 'provider', modelId: 'model-a' },
      'project-2': { providerId: 'provider', modelId: 'model-x' },
    }
    const firstSave = deferred()
    const secondSave = deferred()
    const saveModel = vi
      .fn()
      .mockImplementationOnce(async () => firstSave.promise)
      .mockImplementationOnce(async () => secondSave.promise)
    const queue = createProjectModelSaveQueue({
      getModel: (projectId) => current[projectId] ?? {},
      setModel: (projectId, selection) => {
        current[projectId] = selection
      },
      saveModel,
    })

    const savingProjectOne = queue.save('project-1', 'provider', 'model-b')
    const savingProjectTwo = queue.save('project-2', 'provider', 'model-y')

    await vi.waitFor(() => expect(saveModel).toHaveBeenCalledTimes(1))
    expect(saveModel).toHaveBeenNthCalledWith(1, 'project-1', 'provider', 'model-b')

    firstSave.resolve()
    await savingProjectOne
    await vi.waitFor(() => expect(saveModel).toHaveBeenCalledTimes(2))
    expect(saveModel).toHaveBeenNthCalledWith(2, 'project-2', 'provider', 'model-y')

    secondSave.resolve()
    await savingProjectTwo
  })

  it('does not let an older failed save roll back a newer selection', async () => {
    let current: ModelSelection = { providerId: 'provider', modelId: 'model-a' }
    const firstSave = deferred()
    const saveModel = vi
      .fn()
      .mockImplementationOnce(async () => firstSave.promise)
      .mockResolvedValueOnce(undefined)
    const queue = createProjectModelSaveQueue({
      getModel: () => current,
      setModel: (_projectId, selection) => {
        current = selection
      },
      saveModel,
    })

    const savingB = queue.save('project-1', 'provider', 'model-b')
    const savingC = queue.save('project-1', 'provider', 'model-c')
    firstSave.reject(new Error('write failed'))

    await savingB
    await savingC

    expect(current).toEqual({ providerId: 'provider', modelId: 'model-c' })
  })

  it('rolls the current selection back to the last confirmed model after a failure', async () => {
    let current: ModelSelection = { providerId: 'provider', modelId: 'model-a' }
    const queue = createProjectModelSaveQueue({
      getModel: () => current,
      setModel: (_projectId, selection) => {
        current = selection
      },
      saveModel: vi.fn().mockRejectedValue(new Error('write failed')),
    })

    await queue.save('project-1', 'provider', 'model-b')

    expect(current).toEqual({ providerId: 'provider', modelId: 'model-a' })
  })
})
