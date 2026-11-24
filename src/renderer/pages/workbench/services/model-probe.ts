import { type ClaudeInitializationResult, claude } from '../../../services/claude/claude'
import type { ModelConfigurationStore } from '../../../stores/model-configuration-store'

type ModelProbeClient = Pick<typeof claude, 'startup'>
type ModelProbePromise = Promise<ClaudeInitializationResult>

const probes = new WeakMap<
  ModelConfigurationStore,
  { generation: number; promise: ModelProbePromise }
>()

export function startModelProbe(
  store: ModelConfigurationStore,
  client: ModelProbeClient = claude,
  generation = 0,
) {
  const existingProbe = probes.get(store)
  if (existingProbe?.generation === generation) return existingProbe.promise

  store.setState({ isModelProbePending: true })
  const probe = client
    .startup({ initializeTimeoutMs: 60_000 })
    .then((initialization) => {
      if (probes.get(store)?.promise === probe) {
        store.getState().initialize(initialization, { refresh: true })
      }
      return initialization
    })
    .finally(() => {
      if (probes.get(store)?.promise === probe) store.setState({ isModelProbePending: false })
    })
  probes.set(store, { generation, promise: probe })
  void probe.catch(() => {
    if (probes.get(store)?.promise === probe) probes.delete(store)
  })
  return probe
}
