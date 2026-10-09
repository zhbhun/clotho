import type { ModelConfigurationStore } from '../../stores/model-configuration-store'
import { type ModelProvider, claude } from './claude'

export type ModelSettingsClient = Pick<typeof claude, 'getDefaultModel' | 'listProviders'>

export type ModelSettings = {
  defaultModel: string | null
  providers: ModelProvider[]
}

export async function fetchModelSettings(
  client: ModelSettingsClient = claude,
): Promise<ModelSettings> {
  const [providers, defaultModel] = await Promise.all([
    client.listProviders(),
    client.getDefaultModel(),
  ])
  return { defaultModel, providers }
}

export async function loadModelSettings(
  store: ModelConfigurationStore,
  client: ModelSettingsClient = claude,
): Promise<void> {
  const { defaultModel, providers } = await fetchModelSettings(client)
  store.getState().replaceSettings(providers, defaultModel)
}
