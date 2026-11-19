import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarketSkill, PublishedSkillBoard } from '@/shared/rpc'

import { appI18n } from '../../../i18n/runtime'
import * as api from '../../../services/claude/agent-config'
import { requestFromDesktop } from '../../../services/desktop/client'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { useSettingsDetailStore } from './settings-detail-store'
import { SkillMarketplace } from './skill-marketplace'

vi.mock('../../../services/claude/agent-config', () => ({
  deleteAgentSkill: vi.fn(),
  getPublishedSkillBoard: vi.fn(),
  findMarketSkills: vi.fn(),
  installMarketSkill: vi.fn(),
  listAgentSkills: vi.fn(),
}))
vi.mock('../../../services/desktop/client', () => ({ requestFromDesktop: vi.fn() }))
const mock = vi.mocked(api)
const ranked = {
  name: 'ranked',
  source: 'maker/ranked',
  installs: '4000',
  url: 'https://skills.sh/maker/ranked/ranked',
}
const offList = {
  name: 'calendar:helper',
  source: 'example/calendar',
  installs: '2.5K',
  url: 'https://skills.sh/example/calendar/calendar-helper',
}
const snapshot: PublishedSkillBoard = {
  syncedAt: 1000,
  rows: [{ ...ranked, rank: 1, metric: 'score', value: '80', installable: true }],
}
beforeEach(async () => {
  await appI18n.changeLanguage('en')
  vi.resetAllMocks()
  mock.getPublishedSkillBoard.mockResolvedValue(snapshot)
  mock.listAgentSkills.mockResolvedValue([])
})

function renderMarket() {
  return render(
    <ShortcutRuntimeProvider runtime={shortcutRuntime}>
      <SkillMarketplace />
    </ShortcutRuntimeProvider>,
  )
}

function search(value: string) {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } })
}

describe('SkillMarketplace', () => {
  it('keeps repository rankings separate from global installable search results', async () => {
    const user = userEvent.setup()
    mock.getPublishedSkillBoard.mockResolvedValue({
      syncedAt: 1000,
      rows: [
        {
          rank: 1,
          name: 'example',
          source: 'GitHub',
          metric: 'stars',
          value: '1200',
          installable: false,
          installs: '',
        },
      ],
    })
    mock.findMarketSkills.mockResolvedValue([offList])
    renderMarket()
    expect(screen.getByRole('combobox')).toHaveTextContent('Best 100')
    await user.click(screen.getByRole('combobox'))
    expect(await screen.findAllByRole('option')).toHaveLength(8)
    expect(screen.queryByRole('option', { name: 'Official vendors' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Official 100' })).toBeVisible()
    await user.click(screen.getByRole('option', { name: 'Top repositories' }))
    expect(await screen.findByText('1,200 stars')).toBeInTheDocument()
    expect(mock.getPublishedSkillBoard).toHaveBeenCalledWith('top-repos', false)
    expect(screen.queryByRole('button', { name: /Install example/ })).not.toBeInTheDocument()
    search('calendar')
    expect(await screen.findByRole('button', { name: /Install calendar:helper/ })).toBeEnabled()
    search('')
    expect(await screen.findByText('1,200 stars')).toBeInTheDocument()
  })

  it('opens the published skill URL from rankings and CLI search titles', async () => {
    mock.findMarketSkills.mockResolvedValue([offList])
    renderMarket()
    for (const skill of [ranked, offList]) {
      if (skill === offList) search('calendar')
      fireEvent.click(await screen.findByRole('link', { name: skill.name }))
      expect(requestFromDesktop).toHaveBeenLastCalledWith('appOpenLink', {
        href: skill.url,
        projectPath: '',
      })
    }
    expect(mock.installMarketSkill).not.toHaveBeenCalled()
  })

  it('opens the snapshot attribution outside the desktop app', async () => {
    renderMarket()
    const link = await screen.findByRole('link', { name: /LinklyAI\/best-skills/ })
    fireEvent.click(link)
    expect(requestFromDesktop).toHaveBeenCalledWith('appOpenLink', {
      href: 'https://github.com/LinklyAI/best-skills',
      projectPath: '',
    })
    expect(screen.getByRole('link', { name: '@BlueeonY' })).toHaveAttribute(
      'href',
      'https://x.com/BlueeonY',
    )
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    )
  })

  it('restores cached rankings after clearing a search even if the older query completes later', async () => {
    let finishOldSearch!: (rows: MarketSkill[]) => void
    const oldSearch = new Promise<MarketSkill[]>((resolve) => {
      finishOldSearch = resolve
    })
    mock.getPublishedSkillBoard.mockImplementation(async (_chart, cachedOnly) => {
      if (cachedOnly) return snapshot
      throw new Error('offline')
    })
    mock.findMarketSkills.mockReturnValueOnce(oldSearch).mockResolvedValueOnce([offList])
    renderMarket()
    expect(await screen.findByText('ranked')).toBeInTheDocument()
    search('old')
    await waitFor(() => expect(mock.findMarketSkills).toHaveBeenCalledWith('old'))
    search('calendar')
    expect(await screen.findByText('calendar:helper')).toBeInTheDocument()
    search('')
    await act(async () => finishOldSearch([offList]))
    expect(screen.getByText('ranked')).toBeInTheDocument()
    expect(screen.queryByText('calendar:helper')).not.toBeInTheDocument()
  })

  it('allows retry from the same search and marks only the selected source installed', async () => {
    mock.findMarketSkills.mockResolvedValue([offList, { ...offList, source: 'other/calendar' }])
    mock.installMarketSkill.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce()
    renderMarket()
    search('calendar')
    const buttons = await screen.findAllByRole('button', { name: /calendar:helper/ })
    fireEvent.click(buttons[0])
    await waitFor(() => expect(buttons[0]).toBeEnabled())
    expect(screen.getByRole('searchbox')).toHaveValue('calendar')
    fireEvent.click(buttons[0])
    expect(await screen.findByText('Installed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /More actions/ })).toBeInTheDocument()
    expect(mock.installMarketSkill).toHaveBeenCalledTimes(2)
    expect(mock.installMarketSkill).toHaveBeenCalledWith(offList.source, offList.name)
  })

  it('compares install provenance with the normalized user-level directory', async () => {
    mock.listAgentSkills.mockResolvedValue([
      { name: 'calendar-helper', description: '', marketSource: offList.source },
    ])
    mock.findMarketSkills.mockResolvedValue([offList, { ...offList, source: 'other/calendar' }])
    renderMarket()
    search('calendar')
    expect(await screen.findByText('Installed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /More actions/ })).toBeInTheDocument()
    expect(mock.installMarketSkill).not.toHaveBeenCalled()
  })
  it('opens the local skill and uninstalls its directory only after confirmation', async () => {
    const user = userEvent.setup()
    mock.listAgentSkills.mockResolvedValue([{ name: 'calendar-helper', description: '' }])
    mock.findMarketSkills.mockResolvedValue([offList])
    renderMarket()
    search('calendar')
    const menu = await screen.findByRole('button', { name: /More actions/ })
    await user.click(menu)
    await user.click(await screen.findByRole('menuitem', { name: 'Open' }))
    expect(useSettingsDetailStore.getState().view).toMatchObject({
      page: 'skills',
      file: 'calendar-helper',
    })
    await user.click(menu)
    await user.click(await screen.findByRole('menuitem', { name: 'Uninstall' }))
    expect(mock.deleteAgentSkill).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Uninstall' }))
    expect(mock.deleteAgentSkill).toHaveBeenCalledWith('calendar-helper')
    expect(await screen.findByRole('button', { name: /Install calendar:helper/ })).toBeEnabled()
  })
})
