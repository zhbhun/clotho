import { describe, expect, it } from 'vitest'

import type { ModelProvider, ProviderModel } from '../../services/claude/claude'
import {
  autoThinkingForModel,
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
  it('defaults new models to the generic thinking preset', () => {
    expect(createModelDraft()).toMatchObject({
      thinkingLevel: 'on',
      thinkingPresetId: 'generic',
    })
  })

  it('defaults fetched models to the generic thinking preset', () => {
    expect(createFetchedModelDraft('vendor/glm-fast')).toEqual({
      id: 'vendor/glm-fast',
      displayName: 'Glm Fast',
      contextWindow: 250_000,
      thinkingLevel: 'on',
      thinkingPresetId: 'generic',
    })
  })

  it('prefills fetched models with the preset matched by model id', () => {
    expect(createFetchedModelDraft('glm-5.3-flash', 'zhipu-glm')).toMatchObject({
      thinkingLevel: 'high',
      thinkingPresetId: 'glm-5-3',
    })
    expect(createFetchedModelDraft('qwen3.8-max', 'qianwen')).toMatchObject({
      thinkingLevel: 'medium',
      thinkingPresetId: 'qwen',
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
      models: [model('glm-5.2')],
      modelsUrl: 'https://open.bigmodel.cn/api/paas/v4/models',
    }
    const provider = providerFromPreset(preset)
    expect(provider).toEqual({
      id: 'zhipu-glm',
      name: 'Zhipu GLM',
      baseURL: preset.baseURL,
      authToken: '',
      apiType: 'anthropic-messages',
      models: [
        {
          ...preset.models[0],
          thinkingLevel: 'high',
          thinkingPresetId: 'glm-5-2',
        },
      ],
      presetId: 'zhipu-glm',
      modelsUrl: preset.modelsUrl,
    })
    expect(provider.models[0]).not.toBe(preset.models[0])
  })
})

describe('autoThinkingForModel', () => {
  it('fills the preset options for an untouched model', () => {
    expect(autoThinkingForModel('zhipu-glm', 'glm-5.3-flash', {})).toEqual({
      thinkingLevel: 'high',
      thinkingPresetId: 'glm-5-3',
    })
    expect(
      autoThinkingForModel('zhipu-glm', 'glm-5.3-flash', {
        thinkingLevel: 'on',
        thinkingPresetId: 'generic',
      }),
    ).toEqual({ thinkingLevel: 'high', thinkingPresetId: 'glm-5-3' })
  })

  it('keeps an explicit non-default level untouched', () => {
    expect(
      autoThinkingForModel('zhipu-glm', 'glm-5.3-flash', { thinkingLevel: 'max' }),
    ).toBeUndefined()
    expect(
      autoThinkingForModel('zhipu-glm', 'glm-5.3-flash', { thinkingLevel: 'off' }),
    ).toBeUndefined()
  })
})
