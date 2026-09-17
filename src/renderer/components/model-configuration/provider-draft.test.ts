import { describe, expect, it } from 'vitest'

import type { ModelProvider, ProviderModel } from '../../services/claude/claude'
import {
  createFetchedModelDraft,
  createModelDraft,
  friendlyModelName,
  getEmptyModelIdIndexes,
  getInvalidModelIndexes,
  getProviderIdErrorKind,
  hasInvalidContextWindow,
  providerFromPreset,
  shiftModelIdErrorIndexes,
  upsertProvider,
} from './provider-draft'

const PROVIDER: ModelProvider = {
  id: 'zhipu-glm',
  name: 'Zhipu GLM',
  baseURL: 'https://open.bigmodel.cn/api/anthropic',
  authToken: 'sk-test',
  authField: 'ANTHROPIC_AUTH_TOKEN',
  models: [{ id: 'glm-5.2', displayName: 'GLM 5.2', contextWindow: 200_000 }],
}

function model(id: string, contextWindow = 200_000): ProviderModel {
  return { id, displayName: id, contextWindow }
}

describe('getProviderIdErrorKind', () => {
  it('requires a non-empty ID', () => {
    expect(getProviderIdErrorKind('', [], true)).toBe('required')
  })

  it('rejects IDs outside the shared format', () => {
    expect(getProviderIdErrorKind('Zhipu GLM', [], true)).toBe('format')
    expect(getProviderIdErrorKind('-glm', [], true)).toBe('format')
  })

  it('rejects duplicates only when creating', () => {
    expect(getProviderIdErrorKind('zhipu-glm', [PROVIDER], true)).toBe('duplicate')
    expect(getProviderIdErrorKind('zhipu-glm', [PROVIDER], false)).toBeNull()
  })

  it('accepts a valid unique ID', () => {
    expect(getProviderIdErrorKind('deepseek', [PROVIDER], true)).toBeNull()
  })
})

describe('model validation', () => {
  it('defaults new models to high reasoning', () => {
    expect(createModelDraft()).toMatchObject({ reasoning: 'high' })
  })

  it('defaults fetched models to high reasoning', () => {
    expect(createFetchedModelDraft('vendor/glm-fast')).toEqual({
      id: 'vendor/glm-fast',
      displayName: 'Glm Fast',
      contextWindow: 250_000,
      reasoning: 'high',
    })
  })

  it('marks models with a blank ID', () => {
    expect(getEmptyModelIdIndexes([model('a'), model(' '), model('b')])).toEqual([1])
  })

  it('marks models with a blank ID or invalid context window', () => {
    expect(getInvalidModelIndexes([model('a'), model('b', 0), model('', 200_000)])).toEqual([1, 2])
  })

  it('detects invalid context windows', () => {
    expect(hasInvalidContextWindow([model('a')])).toBe(false)
    expect(hasInvalidContextWindow([model('a', 1.5)])).toBe(true)
    expect(hasInvalidContextWindow([model('a', -1)])).toBe(true)
  })
})

describe('upsertProvider', () => {
  it('replaces an existing provider in place, preserving order', () => {
    const other: ModelProvider = { ...PROVIDER, id: 'deepseek' }
    const renamed = { ...PROVIDER, name: 'Renamed' }
    expect(upsertProvider([PROVIDER, other], renamed)).toEqual([renamed, other])
  })

  it('appends a new provider', () => {
    const added: ModelProvider = { ...PROVIDER, id: 'deepseek' }
    expect(upsertProvider([PROVIDER], added)).toEqual([PROVIDER, added])
  })
})

describe('shiftModelIdErrorIndexes', () => {
  it('drops the removed index and shifts later indexes down', () => {
    expect(shiftModelIdErrorIndexes([0, 2, 4], 2)).toEqual([0, 3])
  })

  it('keeps earlier indexes untouched', () => {
    expect(shiftModelIdErrorIndexes([1, 2], 4)).toEqual([1, 2])
  })
})

describe('friendlyModelName', () => {
  it('strips the vendor prefix and title-cases', () => {
    expect(friendlyModelName('zhipu/glm-5.2_air')).toBe('Glm 5.2 Air')
  })
})

describe('providerFromPreset', () => {
  it('copies preset fields with a blank credential and cloned models', () => {
    const preset = {
      id: 'zhipu-glm',
      name: 'Zhipu GLM',
      baseURL: 'https://open.bigmodel.cn/api/anthropic',
      authField: 'ANTHROPIC_AUTH_TOKEN' as const,
      models: [model('glm-5.2')],
      modelsUrl: 'https://open.bigmodel.cn/api/paas/v4/models',
    }
    const provider = providerFromPreset(preset)
    expect(provider).toEqual({
      id: 'zhipu-glm',
      name: 'Zhipu GLM',
      baseURL: preset.baseURL,
      authToken: '',
      authField: 'ANTHROPIC_AUTH_TOKEN',
      models: [{ ...preset.models[0], reasoning: 'high' }],
      presetId: 'zhipu-glm',
      modelsUrl: preset.modelsUrl,
    })
    expect(provider.models[0]).not.toBe(preset.models[0])
  })
})
