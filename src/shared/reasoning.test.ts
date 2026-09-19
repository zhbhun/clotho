import { describe, expect, test } from 'vitest'

import {
  claudeLevelFor,
  findReasoningPreset,
  matchReasoningPreset,
  modelLevelFor,
} from './reasoning'

describe('findReasoningPreset', () => {
  test('looks up presets by id', () => {
    expect(findReasoningPreset('glm-5-3')?.mappings).toEqual([
      { modelLevel: 'low', claudeLevel: 'low' },
      { modelLevel: 'high', claudeLevel: 'high' },
      { modelLevel: 'max', claudeLevel: 'max' },
    ])
    expect(findReasoningPreset('glm-5-3')?.defaultModelLevel).toBe('high')
    expect(findReasoningPreset('missing-id')).toBeUndefined()
  })
})

describe('matchReasoningPreset', () => {
  test('matches model ids to family presets, aggregators included', () => {
    expect(matchReasoningPreset('zhipu-glm', 'glm-5.3-flash')?.id).toBe('glm-5-3')
    expect(matchReasoningPreset('packycode', 'claude-sonnet-5')?.id).toBe('claude')
    expect(matchReasoningPreset('packycode', 'deepseek-r1')?.id).toBe('deepseek')
  })

  test('falls back to provider defaults for opaque model ids', () => {
    expect(matchReasoningPreset('zhipu-glm', 'flagship')?.id).toBe('glm-5-3')
    expect(matchReasoningPreset('qianwen', 'mystery')?.id).toBe('qwen')
  })

  test('falls back to the generic on/off preset when nothing matches', () => {
    expect(matchReasoningPreset('minimax', 'minimax-m2.1')?.id).toBe('generic')
    expect(matchReasoningPreset('unknown', 'vendor-x')?.id).toBe('generic')
  })
})

describe('claudeLevelFor (forward: model level => claude level)', () => {
  test('maps the selected model level to its claude level', () => {
    const preset = findReasoningPreset('glm-5-3')!
    expect(claudeLevelFor(preset, 'max')).toBe('max')
    expect(claudeLevelFor(preset, 'low')).toBe('low')
  })

  test('falls back to the default row for an unknown model level', () => {
    const preset = findReasoningPreset('glm-5-3')!
    expect(claudeLevelFor(preset, 'turbo')).toBe('high')
    expect(claudeLevelFor(preset, undefined)).toBe('high')
  })

  test('maps the off switch to none so the SDK disables thinking', () => {
    const preset = findReasoningPreset('kimi-k2-6')!
    expect(claudeLevelFor(preset, 'off')).toBe('none')
    expect(claudeLevelFor(preset, 'on')).toBe('high')
  })
})

describe('modelLevelFor (reverse: claude level => model level)', () => {
  test('maps a claude effort back to the model level', () => {
    const preset = findReasoningPreset('glm-5-3')!
    expect(modelLevelFor(preset, 'low', 'high')).toBe('low')
    expect(modelLevelFor(preset, 'max', 'high')).toBe('max')
  })

  test('falls back to the configured default for out-of-set efforts', () => {
    const preset = findReasoningPreset('glm-5-3')!
    expect(modelLevelFor(preset, 'medium', 'high')).toBe('high')
  })

  test('maps claude none (thinking disabled) to the off level when present', () => {
    expect(modelLevelFor(findReasoningPreset('kimi-k2-6')!, 'none', 'on')).toBe('off')
    // GLM-5.3 cannot disable thinking: falls back to the default level.
    expect(modelLevelFor(findReasoningPreset('glm-5-3')!, 'none', 'high')).toBe('high')
  })
})
