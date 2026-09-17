import { fireEvent, render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { initializeAppI18n } from '../../../../i18n/runtime'
import { AddMenu } from './add-menu'
import type { PromptEditorHandle } from './editor'

beforeEach(async () => {
  await initializeAppI18n('en', ['en-US'])
})

describe('AddMenu', () => {
  it('renders input actions without conversation actions', async () => {
    render(
      <AddMenu
        canSelectFiles
        commands={[]}
        editorHandle={createRef<PromptEditorHandle>()}
        onQueryContextStatus={() => {}}
        onSelectFiles={() => {}}
      />,
    )

    fireEvent.click(screen.getByLabelText('Add'))
    const menu = await screen.findByRole('menu', { name: 'Add' })
    const items = within(menu).getAllByRole('menuitem')

    expect(items.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Attachment',
      'ContextUse @ to add context',
      'SkillsUse / to choose a skill',
    ])
    expect(screen.getByRole('button', { name: 'Add' })).not.toBeDisabled()
  })
})
