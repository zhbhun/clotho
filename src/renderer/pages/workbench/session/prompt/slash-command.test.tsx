import { describe, expect, it } from 'vitest'

import {
  filterSlashCommands,
  prepareSlashCommands,
  resolveDirectSlashCommand,
} from './slash-command'

describe('resolveDirectSlashCommand', () => {
  it('recognizes supported commands after trimming surrounding whitespace', () => {
    expect(
      ['clear', 'compact', 'config', 'context', 'rename'].map((name) =>
        resolveDirectSlashCommand(`  /${name}  `),
      ),
    ).toEqual(['clear', 'compact', 'config', 'context', 'rename'])
  })

  it('leaves commands with arguments and ordinary prompts untouched', () => {
    expect(resolveDirectSlashCommand('/rename New title')).toBeNull()
    expect(resolveDirectSlashCommand('Please run /clear')).toBeNull()
    expect(resolveDirectSlashCommand('//clear')).toBeNull()
    expect(resolveDirectSlashCommand('/unknown')).toBeNull()
  })
})

describe('prepareSlashCommands', () => {
  it('hides reserved commands while retaining skills and the explicitly allowed workflows', () => {
    const hidden = [
      'design-sync',
      'update-config',
      'debug',
      'run-skill-generator',
      'clear',
      'compact',
      'config',
      'context',
      'heapdump',
      'init',
      'reload-skills',
      'usage',
      'insights',
      'team-onboarding',
      'fewer-permission-prompts',
      'code-review:code-review',
    ].map((name) => ({ name }))
    const kept = [
      { name: 'loop', aliases: ['proactive'], argumentHint: '[interval] [prompt]' },
      { name: 'goal' },
      { name: 'batch' },
      { name: 'code-review' },
      { name: 'review' },
      { name: 'deep-research' },
      { name: 'brainstorming' },
      { name: 'my-plugin:config' },
      { name: 'config-helper' },
    ]
    const commands = [...hidden, ...kept]

    expect(prepareSlashCommands(commands)).toEqual(kept)
    expect(commands).toEqual([...hidden, ...kept])
  })

  it('hides reserved names with leading slashes without matching aliases or changing case rules', () => {
    const commands = [
      { name: '/config' },
      { name: '//usage' },
      { name: '/code-review:code-review' },
      { name: 'Config' },
      { name: 'custom-skill', aliases: ['config'] },
    ]

    expect(prepareSlashCommands(commands)).toEqual([
      { name: 'Config' },
      { name: 'custom-skill', aliases: ['config'] },
    ])
  })

  it('keeps the first exact-name command and treats casing as distinct', () => {
    const first = { name: 'review', description: 'from cwd' }
    const duplicate = { name: '/review', description: 'from extra directory' }
    const upperCase = { name: 'Review', description: 'different command' }

    expect(prepareSlashCommands([first, duplicate, upperCase])).toEqual([first, upperCase])
  })
})

describe('filterSlashCommands', () => {
  const commands = [
    {
      name: 'review',
      description: '(builtin) Review code changes.',
      aliases: ['code-review'],
      argumentHint: '<scope>',
    },
    {
      name: 'brainstorming',
      description: '(superpowers) Explore user intent before implementation.',
      aliases: ['superpowers:brainstorming', 'brainstorm'],
      argumentHint: '',
    },
    {
      name: 'read-branch',
      description: '(builtin) Read the current branch.',
      argumentHint: '',
    },
    {
      name: 'request-refactor-plan',
      description: '(superpowers) Plan a refactor.',
      argumentHint: '',
    },
  ]

  it('keeps sdk order for an empty query', () => {
    expect(filterSlashCommands(commands, '').map((command) => command.name)).toEqual([
      'review',
      'brainstorming',
      'read-branch',
      'request-refactor-plan',
    ])
  })

  it('sorts prefix matches before contains matches while preserving sdk order within groups', () => {
    expect(filterSlashCommands(commands, 're').map((command) => command.name)).toEqual([
      'review',
      'read-branch',
      'request-refactor-plan',
    ])
  })

  it('ignores aliases while filtering', () => {
    expect(filterSlashCommands(commands, 'code').map((command) => command.name)).toEqual([])
  })
})
