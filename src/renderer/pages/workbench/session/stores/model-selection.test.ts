import { describe, expect, it } from 'vitest'

import { resolveModelSelection } from './model-selection'

describe('resolveModelSelection', () => {
  it.each([
    {
      source: 'session selection',
      selectedProviderId: 'session',
      selectedModelId: 'model-session',
      defaultProviderId: 'project',
      defaultModelId: 'model-project',
      fallbackModel: 'fallback/model-fallback',
      expected: { selectedProviderId: 'session', selectedModelId: 'model-session' },
    },
    {
      source: 'project default',
      selectedProviderId: null,
      selectedModelId: null,
      defaultProviderId: 'project',
      defaultModelId: 'model-project',
      fallbackModel: 'fallback/model-fallback',
      expected: { selectedProviderId: 'project', selectedModelId: 'model-project' },
    },
    {
      source: 'global fallback',
      selectedProviderId: null,
      selectedModelId: null,
      defaultProviderId: undefined,
      defaultModelId: undefined,
      fallbackModel: 'fallback/model-fallback',
      expected: { selectedProviderId: 'fallback', selectedModelId: 'model-fallback' },
    },
    {
      source: 'first available model',
      selectedProviderId: null,
      selectedModelId: null,
      defaultProviderId: undefined,
      defaultModelId: undefined,
      fallbackModel: undefined,
      expected: { selectedProviderId: 'first', selectedModelId: 'model-first' },
    },
  ])('resolves the effective model from $source', (scenario) => {
    expect(
      resolveModelSelection({
        selectedProviderId: scenario.selectedProviderId,
        selectedModelId: scenario.selectedModelId,
        defaultProviderId: scenario.defaultProviderId,
        defaultModelId: scenario.defaultModelId,
        fallbackModel: scenario.fallbackModel,
        models: [
          {
            value: 'model-first',
            displayName: 'First',
            description: '',
            providerId: 'first',
          },
          {
            value: 'model-session',
            displayName: 'Session',
            description: '',
            providerId: 'session',
          },
          {
            value: 'model-project',
            displayName: 'Project',
            description: '',
            providerId: 'project',
          },
          {
            value: 'model-fallback',
            displayName: 'Fallback',
            description: '',
            providerId: 'fallback',
          },
        ],
      }),
    ).toEqual(scenario.expected)
  })

  it('skips unavailable session and project selections', () => {
    expect(
      resolveModelSelection({
        selectedProviderId: 'removed-session-provider',
        selectedModelId: 'removed-session-model',
        defaultProviderId: 'removed-project-provider',
        defaultModelId: 'removed-project-model',
        fallbackModel: 'fallback/model-b',
        models: [
          {
            value: 'model-a',
            displayName: 'Model A',
            description: '',
            providerId: 'first',
          },
          {
            value: 'model-b',
            displayName: 'Model B',
            description: '',
            providerId: 'fallback',
          },
        ],
      }),
    ).toEqual({
      selectedProviderId: 'fallback',
      selectedModelId: 'model-b',
    })
  })

  it('invalidates stored selections after an empty model catalog has loaded', () => {
    expect(
      resolveModelSelection({
        selectedProviderId: 'removed-provider',
        selectedModelId: 'removed-model',
        defaultProviderId: 'removed-provider',
        defaultModelId: 'removed-model',
        fallbackModel: 'removed-provider/removed-model',
        isModelCatalogLoaded: true,
        models: [],
      }),
    ).toBeNull()
  })

  it('keeps a saved Claude default while SDK initialization is still pending', () => {
    expect(
      resolveModelSelection({
        selectedProviderId: null,
        selectedModelId: null,
        defaultProviderId: 'claude',
        defaultModelId: 'claude-sonnet-4-5',
        fallbackModel: undefined,
        isModelCatalogLoaded: true,
        isSdkInitializationComplete: false,
        models: [],
      }),
    ).toEqual({
      selectedProviderId: 'claude',
      selectedModelId: 'claude-sonnet-4-5',
    })
  })

  it('keeps a saved Claude fallback while SDK initialization is still pending', () => {
    expect(
      resolveModelSelection({
        selectedProviderId: null,
        selectedModelId: null,
        defaultProviderId: undefined,
        defaultModelId: undefined,
        fallbackModel: 'claude/claude-sonnet-4-5',
        isModelCatalogLoaded: true,
        isSdkInitializationComplete: false,
        models: [],
      }),
    ).toEqual({
      selectedProviderId: 'claude',
      selectedModelId: 'claude-sonnet-4-5',
    })
  })

  it('invalidates a saved Claude default after SDK initialization confirms it is unavailable', () => {
    expect(
      resolveModelSelection({
        selectedProviderId: null,
        selectedModelId: null,
        defaultProviderId: 'claude',
        defaultModelId: 'claude-sonnet-4-5',
        fallbackModel: undefined,
        isModelCatalogLoaded: true,
        isSdkInitializationComplete: true,
        models: [],
      }),
    ).toBeNull()
  })
})
