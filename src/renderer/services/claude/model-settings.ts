import type { ModelConfigurationStore } from '../../stores/model-configuration-store'
import { type ClaudeModelMappings, type ModelProvider, claude } from './claude'

export type ModelSettingsClient = Pick<typeof claude, 'listModelMappings' | 'listProviders'>

export type ModelSettings = {
  modelMappings: ClaudeModelMappings
  providers: ModelProvider[]
}

export async function fetchModelSettings(
  client: ModelSettingsClient = claude,
): Promise<ModelSettings> {
  const [providers, modelMappings] = await Promise.all([
    client.listProviders(),
    client.listModelMappings(),
  ])
  return { modelMappings, providers }
}

export async function loadModelSettings(
  store: ModelConfigurationStore,
  client: ModelSettingsClient = claude,
): Promise<void> {
  const { modelMappings, providers } = await fetchModelSettings(client)
  store.getState().replaceSettings(providers, modelMappings)
}
