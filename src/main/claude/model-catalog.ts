import os from 'node:os'
import path from 'node:path'

import type { ClaudeAccountInfo, ClaudeModelInfo, ModelProvider } from '@/shared/rpc'

import { readJsonFile } from './agent-config/fs-safe'

export async function readClaudeModelConfiguration(
  settingsPath = path.join(os.homedir(), '.claude', 'settings.json'),
) {
  const result = await readJsonFile<{ model?: unknown; env?: Record<string, unknown> }>(
    settingsPath,
  )
  if (!result.ok) return false
  const { model, env } = result.value
  const hasValue = (value: unknown) => typeof value === 'string' && Boolean(value.trim())
  return (
    hasValue(model) ||
    [
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    ].some((key) => hasValue(env?.[key])) ||
    (hasValue(env?.ANTHROPIC_BASE_URL) &&
      (hasValue(env?.ANTHROPIC_AUTH_TOKEN) || hasValue(env?.ANTHROPIC_API_KEY)))
  )
}

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
  hasConfiguredClaudeModels = false,
) {
  const hasAuthentication = hasClaudeAuthentication(account)
  const claudeModels =
    hasAuthentication || hasConfiguredClaudeModels
      ? sdkModels.map((model) => ({ ...model, providerId: 'claude', providerName: 'Claude' }))
      : []

  return {
    models: [...claudeModels, ...providersToModelInfos(providers)],
    hasClaudeAuthentication: hasAuthentication,
    hasConfiguredProviders: providers.length > 0,
  }
}
