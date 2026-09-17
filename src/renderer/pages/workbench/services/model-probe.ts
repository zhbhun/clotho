import { type ClaudeInitializationResult, claude } from '../../../services/claude/claude'
import type { ModelConfigurationStore } from '../../../stores/model-configuration-store'

type ModelProbeClient = Pick<typeof claude, 'startup'>
type ModelProbePromise = Promise<ClaudeInitializationResult>

const probes = new WeakMap<ModelConfigurationStore, ModelProbePromise>()

export function startModelProbe(store: ModelConfigurationStore, client: ModelProbeClient = claude) {
  const existingProbe = probes.get(store)
  if (existingProbe) return existingProbe

  const probe = client.startup({ initializeTimeoutMs: 60_000 }).then((initialization) => {
    store.getState().initialize(initialization)
    return initialization
  })
  probes.set(store, probe)
  return probe
}
