import type { ClaudeAccountInfo, ClaudeModelInfo, ModelProvider } from '@/shared/rpc'

function hasCredentialSource(source: string | undefined) {
  return Boolean(source && source.toLowerCase() !== 'none')
}

export function hasClaudeAuthentication(account: ClaudeAccountInfo | undefined) {
  return Boolean(
    account?.apiProvider === 'firstParty' &&
    (hasCredentialSource(account.tokenSource) || hasCredentialSource(account.apiKeySource)),
  )
}

export function providersToModelInfos(providers: ModelProvider[]): ClaudeModelInfo[] {
  return providers.flatMap((provider) =>
    provider.models.map((model) => ({
      value: model.id,
      displayName: model.displayName,
      description: '',
      providerId: provider.id,
      providerName: provider.name,
      contextWindow: model.contextWindow,
      supportsMultimodal: model.supportsMultimodal,
    })),
  )
}

export function buildModelCatalog(
  sdkModels: ClaudeModelInfo[],
  providers: ModelProvider[],
  account: ClaudeAccountInfo | undefined,
) {
  const hasAuthentication = hasClaudeAuthentication(account)
  const claudeModels = hasAuthentication
    ? sdkModels.map((model) => ({ ...model, providerId: 'claude', providerName: 'Claude' }))
    : []

  return {
    models: [...claudeModels, ...providersToModelInfos(providers)],
    hasClaudeAuthentication: hasAuthentication,
    hasConfiguredProviders: providers.length > 0,
  }
}
