import { describe, expect, it } from 'vitest'

import { appI18n } from '../../../../i18n/runtime'
import { buildContextRows } from './context-usage-rows'

const category = (name: string, tokens: number) => ({ name, tokens })
const identityLabel = (labelKey: string) => labelKey

describe('buildContextRows', () => {
  it('drops free space, the autocompact buffer, and zero-token categories', () => {
    const rows = buildContextRows(
      [
        category('System prompt', 2500),
        category('Free space', 52000),
        category('Autocompact buffer', 33000),
        category('MCP tools', 0),
      ],
      identityLabel,
    )

    expect(rows.map((row) => row.name)).toEqual(['System prompt'])
  })

  it('sorts rows in the canonical CLI /context order regardless of input order', () => {
    const rows = buildContextRows(
      [
        category('Messages', 60000),
        category('Skills', 800),
        category('Memory files', 1200),
        category('Custom agents', 300),
        category('MCP tools', 9000),
        category('System tools', 24000),
        category('System prompt', 2500),
      ],
      identityLabel,
    )

    expect(rows.map((row) => row.name)).toEqual([
      'System prompt',
      'System tools',
      'MCP tools',
      'Custom agents',
      'Memory files',
      'Skills',
      'Messages',
    ])
  })

  it('localizes known labels and keeps raw names for unknown categories', () => {
    const rows = buildContextRows(
      [category('System tools', 24000), category('Mystery stuff', 7)],
      (labelKey) => appI18n.t(labelKey),
    )

    expect(rows).toHaveLength(2)
    expect(rows[0].label).toBe(appI18n.t('workbench.prompt.contextCategorySystemTools'))
    expect(rows[1].label).toBe('Mystery stuff')
  })
})
