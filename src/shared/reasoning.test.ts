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

  test('glm-5.2 offers only the levels upstream accepts', () => {
    expect(findReasoningPreset('glm-5-2')?.mappings.map((row) => row.modelLevel)).toEqual([
      'off',
      'high',
      'max',
    ])
  })

  test('qwen ids keep the 3.8 effort tiers, legacy switches moved aside', () => {
    expect(findReasoningPreset('qwen')?.mappings.map((row) => row.modelLevel)).toEqual([
      'low',
      'medium',
      'xhigh',
    ])
    expect(findReasoningPreset('qwen-switch')?.mappings.map((row) => row.modelLevel)).toEqual([
      'off',
      'on',
    ])
  })

  test('gpt families follow the per-model upstream ladders', () => {
    expect(findReasoningPreset('gpt-5-6')?.mappings.map((row) => row.modelLevel)).toEqual([
      'off',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])
    expect(findReasoningPreset('gpt-5-4')?.mappings.map((row) => row.modelLevel)).toEqual([
      'off',
      'low',
      'medium',
      'high',
      'xhigh',
    ])
    expect(findReasoningPreset('gpt-5-3-codex')?.mappings.map((row) => row.modelLevel)).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
    ])
  })
})

describe('matchReasoningPreset', () => {
  test('matches model ids to family presets, aggregators included', () => {
    expect(matchReasoningPreset('zhipu-glm', 'glm-5.3-flash')?.id).toBe('glm-5-3')
    expect(matchReasoningPreset('packycode', 'claude-sonnet-5')?.id).toBe('claude')
    expect(matchReasoningPreset('packycode', 'deepseek-r1')?.id).toBe('deepseek')
    expect(matchReasoningPreset('meitu', 'deepseek-v4-flash@huawei')?.id).toBe('deepseek')
    expect(matchReasoningPreset('meitu', 'gpt-5.6-luna')?.id).toBe('gpt-5-6')
    expect(matchReasoningPreset('meitu', 'qwen3.8-flash')?.id).toBe('qwen')
    expect(matchReasoningPreset('kimi-for-coding', 'kimi-for-coding-highspeed')?.id).toBe('kimi')
    expect(matchReasoningPreset('kimi-for-coding', 'k3-256k')?.id).toBe('kimi')
  })

  test('routes switch-class families off the tier families', () => {
    expect(matchReasoningPreset('zhipu-glm', 'glm-4.6')?.id).toBe('glm')
    expect(matchReasoningPreset('zhipu-glm', 'glm-5.1-highspeed')?.id).toBe('glm')
    expect(matchReasoningPreset('zhipu-glm', 'glm-5v-turbo')?.id).toBe('glm')
    expect(matchReasoningPreset('qianwen', 'qwen-plus')?.id).toBe('qwen-switch')
    expect(matchReasoningPreset('qianwen', 'qwen3.7-max')?.id).toBe('qwen-switch')
  })

  test('falls back to provider defaults for opaque model ids', () => {
    expect(matchReasoningPreset('zhipu-glm', 'flagship')?.id).toBe('glm')
    expect(matchReasoningPreset('qianwen', 'mystery')?.id).toBe('qwen-switch')
  })

  test('falls back to the generic on/off preset when nothing matches', () => {
    expect(matchReasoningPreset('minimax', 'minimax-m2.1')?.id).toBe('generic')
    expect(matchReasoningPreset('unknown', 'vendor-x')?.id).toBe('generic')
  })
})

describe('wire params on anthropic-messages upstreams', () => {
  test('glm-5.3 always thinks and pins the effort', () => {
    const preset = findReasoningPreset('glm-5-3')!
    expect(preset.anthropicParams('high')).toEqual({
      thinking: { type: 'enabled' },
      output_config: { effort: 'high' },
    })
  })

  test('tier families with an off switch disable thinking via thinking.type', () => {
    const preset = findReasoningPreset('deepseek')!
    expect(preset.anthropicParams('off')).toEqual({ thinking: { type: 'disabled' } })
    expect(preset.anthropicParams('low')).toEqual({
      thinking: { type: 'enabled' },
      output_config: { effort: 'low' },
    })
  })

  test('kimi sends the effort alone on anthropic upstreams', () => {
    const preset = findReasoningPreset('kimi')!
    expect(preset.anthropicParams('high')).toEqual({ output_config: { effort: 'high' } })
    expect(preset.chatParams('max')).toEqual({ reasoning_effort: 'max' })
  })

  test('claude-style families request adaptive thinking', () => {
    const preset = findReasoningPreset('claude')!
    expect(preset.anthropicParams('max')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'max' },
    })
  })

  test('plain switch families only flip thinking.type', () => {
    const preset = findReasoningPreset('glm')!
    expect(preset.anthropicParams('off')).toEqual({ thinking: { type: 'disabled' } })
    expect(preset.anthropicParams('on')).toEqual({ thinking: { type: 'enabled' } })
  })

  test('minimax m3 expresses thinking-on as adaptive', () => {
    const preset = findReasoningPreset('minimax-m3')!
    expect(preset.anthropicParams('on')).toEqual({ thinking: { type: 'adaptive' } })
    expect(preset.anthropicParams('off')).toEqual({ thinking: { type: 'disabled' } })
  })

  test('unknown models get the widely supported enabled + effort vocabulary', () => {
    const preset = findReasoningPreset('generic')!
    expect(preset.anthropicParams('on')).toEqual({
      thinking: { type: 'enabled' },
      output_config: { effort: 'high' },
    })
    expect(preset.anthropicParams('off')).toEqual({ thinking: { type: 'disabled' } })
  })
})

describe('wire params on chat-completions upstreams', () => {
  test('effort-tier families send reasoning_effort', () => {
    const preset = findReasoningPreset('qwen')!
    expect(preset.chatParams('medium')).toEqual({ reasoning_effort: 'medium' })
    expect(preset.chatParams('off')).toEqual({ reasoning_effort: 'none' })
  })

  test('deepseek pairs the thinking switch with reasoning_effort', () => {
    const preset = findReasoningPreset('deepseek')!
    expect(preset.chatParams('low')).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    })
    expect(preset.chatParams('off')).toEqual({ thinking: { type: 'disabled' } })
  })

  test('legacy qwen switches on enable_thinking', () => {
    const preset = findReasoningPreset('qwen-switch')!
    expect(preset.chatParams('on')).toEqual({ enable_thinking: true })
    expect(preset.chatParams('off')).toEqual({ enable_thinking: false })
  })

  test('thinking-switch families flip thinking.type', () => {
    const preset = findReasoningPreset('kimi-k2-6')!
    expect(preset.chatParams('on')).toEqual({ thinking: { type: 'enabled' } })
    expect(preset.chatParams('off')).toEqual({ thinking: { type: 'disabled' } })
  })

  test('unknown families hedge with every plausible switch field', () => {
    const preset = findReasoningPreset('generic')!
    expect(preset.chatParams('on')).toEqual({
      thinking: { type: 'enabled' },
      enable_thinking: true,
      reasoning_effort: 'high',
      reasoning: { effort: 'high' },
    })
    expect(preset.chatParams('off')).toEqual({
      thinking: { type: 'disabled' },
      enable_thinking: false,
      reasoning_effort: 'none',
      reasoning: { effort: 'none' },
    })
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
    // qwen 3.8 has no high tier: the closest default is medium.
    expect(modelLevelFor(findReasoningPreset('qwen')!, 'high', 'medium')).toBe('medium')
  })

  test('maps claude none (thinking disabled) to the off level when present', () => {
    expect(modelLevelFor(findReasoningPreset('kimi-k2-6')!, 'none', 'on')).toBe('off')
    // GLM-5.3 cannot disable thinking: falls back to the default level.
    expect(modelLevelFor(findReasoningPreset('glm-5-3')!, 'none', 'high')).toBe('high')
  })
})
