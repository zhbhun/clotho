export type ProjectModelSelection = {
  providerId?: string
  modelId?: string
}

type ProjectModelSaveQueueOptions = {
  getModel: (projectId: string) => ProjectModelSelection
  setModel: (projectId: string, selection: ProjectModelSelection) => void
  saveModel: (projectId: string, providerId: string, modelId: string) => Promise<void>
}

type ProjectModelSaveEntry = {
  confirmed: ProjectModelSelection
  generation: number
}

export function createProjectModelSaveQueue(options: ProjectModelSaveQueueOptions) {
  const entries = new Map<string, ProjectModelSaveEntry>()
  let tail = Promise.resolve()

  return {
    save(projectId: string, providerId: string, modelId: string) {
      let entry = entries.get(projectId)
      if (!entry) {
        entry = {
          confirmed: options.getModel(projectId),
          generation: 0,
        }
        entries.set(projectId, entry)
      }

      entry.generation += 1
      const generation = entry.generation
      const selection = { providerId, modelId }
      options.setModel(projectId, selection)

      const saving = tail.then(async () => {
        try {
          await options.saveModel(projectId, providerId, modelId)
          entry.confirmed = selection
        } catch {
          if (entry.generation === generation) {
            options.setModel(projectId, entry.confirmed)
          }
        }
      })
      tail = saving
      return saving
    },
  }
}
