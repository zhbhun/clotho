// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { classifyAgent, resolveAvailableSubagents } from './supported-agents'

vi.mock('./subagents', () => ({
  listSubagentConfigs: vi.fn(async () => [
    {
      file: 'reviewer',
      fields: { name: 'reviewer', description: 'Reviews code', tools: 'Read', model: 'haiku' },
      raw: [],
      body: 'You are a reviewer.',
    },
  ]),
}))

describe('classifyAgent', () => {
  const stems = new Set(['reviewer', 'explore'])

  it('matches custom files before the plugin rule', () => {
    expect(classifyAgent({ name: 'explore', description: '' }, stems)).toBe('custom')
  })

  it('classifies namespaced names as plugin agents', () => {
    expect(classifyAgent({ name: 'caveman:cavecrew-reviewer', description: '' }, stems)).toBe(
      'plugin',
    )
  })

  it('classifies the rest as builtin', () => {
    expect(classifyAgent({ name: 'general-purpose', description: '' }, stems)).toBe('builtin')
    expect(classifyAgent({ name: 'Explore', description: '' }, stems)).toBe('builtin')
  })
})

describe('resolveAvailableSubagents', () => {
  it('joins custom agents with their file config and marks others non-editable', async () => {
    const agents = await resolveAvailableSubagents(async () => [
      { name: 'general-purpose', description: 'General-purpose agent' },
      { name: 'caveman:cavecrew-reviewer', description: 'Plugin agent', model: 'haiku' },
      { name: 'reviewer', description: 'Reviews code', model: 'haiku' },
    ])
    expect(agents).toEqual([
      {
        name: 'general-purpose',
        description: 'General-purpose agent',
        source: 'builtin',
        builtin: true,
        body: '',
        file: 'general-purpose',
      },
      {
        name: 'caveman:cavecrew-reviewer',
        description: 'Plugin agent',
        model: 'haiku',
        source: 'plugin',
        builtin: true,
        body: '',
        file: 'caveman:cavecrew-reviewer',
      },
      {
        name: 'reviewer',
        description: 'Reviews code',
        model: 'haiku',
        source: 'custom',
        builtin: false,
        tools: 'Read',
        body: 'You are a reviewer.',
        file: 'reviewer',
      },
    ])
  })
})
