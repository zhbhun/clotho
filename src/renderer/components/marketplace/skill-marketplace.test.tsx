import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MarketSkill, PublishedSkillBoard } from '@/shared/rpc'

import { appI18n } from '../../i18n/runtime'
import * as api from '../../services/claude/agent-config'
import { requestFromDesktop } from '../../services/desktop/client'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../services/shortcuts/runtime'
import { useSettingsDetailStore } from './settings-detail-store'
import { SkillMarketplace } from './skill-marketplace'

vi.mock('../../services/claude/agent-config', () => ({
  deleteAgentSkill: vi.fn(),
  getPublishedSkillBoard: vi.fn(),
  findMarketSkills: vi.fn(),
  installMarketSkill: vi.fn(),
  listAgentSkills: vi.fn(),
}))
vi.mock('../../services/desktop/client', () => ({ requestFromDesktop: vi.fn() }))
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
  useSettingsDetailStore.setState({ view: { kind: 'list' }, leaf: '', subLeaf: '' })
  mock.getPublishedSkillBoard.mockImplementation(async (chart) =>
    chart === 'best-100' ? snapshot : { syncedAt: 1000, rows: [] },
  )
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
  it('previews ten per chart with independent ranks and opens the full chart', async () => {
    mock.getPublishedSkillBoard.mockImplementation(async () => ({
      syncedAt: 1000,
      rows: Array.from({ length: 12 }, (_, index) => ({
        ...snapshot.rows[0],
        name: `skill-${index}`,
        rank: index + 1,
      })),
    }))
    const user = userEvent.setup()
    const view = renderMarket()
    await screen.findAllByText('skill-0')
    const charts = [...view.container.querySelectorAll('[data-skill-chart]')]
    expect(charts).toHaveLength(8)
    for (const chart of charts) {
      expect(chart.querySelectorAll('[data-skill-tile]')).toHaveLength(10)
      const tile = chart.querySelector('[data-skill-tile]')!
      expect(tile.children[1]).toHaveAttribute('data-skill-rank')
      expect(tile.children[1]).toHaveTextContent('1')
    }
    await user.click(within(charts[1] as HTMLElement).getByRole('button', { name: 'View all' }))
    expect(useSettingsDetailStore.getState().view).toMatchObject({
      page: 'skill-section',
      file: 'top-installs',
    })
    expect(view.container.querySelectorAll('[data-skill-chart]')).toHaveLength(1)
    expect(view.container.querySelectorAll('[data-skill-tile]')).toHaveLength(12)
    act(() => useSettingsDetailStore.getState().requestLeave())
    expect(view.container.querySelectorAll('[data-skill-chart]')).toHaveLength(8)
  })

  it('shows other charts when one board fails and shares installation state between groups', async () => {
    mock.getPublishedSkillBoard.mockImplementation(async (chart) => {
      if (chart === 'top-repos') throw new Error('offline')
      return snapshot
    })
    mock.installMarketSkill.mockResolvedValue(undefined)
    renderMarket()
    const buttons = await screen.findAllByRole('button', { name: /Install ranked/ })
    expect(buttons).toHaveLength(7)
    fireEvent.click(buttons[0])
    await waitFor(() => expect(screen.getAllByText('Installed')).toHaveLength(7))
    expect(mock.installMarketSkill).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Rankings unavailable')).toBeInTheDocument()
  })

  it('returns local skill details to their originating chart', async () => {
    mock.listAgentSkills.mockResolvedValue([{ name: 'ranked', description: '' }])
    const user = userEvent.setup()
    renderMarket()
    const menu = await screen.findByRole('button', { name: /More actions/ })
    await user.click(menu)
    await user.click(await screen.findByRole('menuitem', { name: 'Open' }))
    expect(useSettingsDetailStore.getState().view).toMatchObject({
      page: 'skill-section',
      file: 'best-100',
      sub: { page: 'skill-detail', file: 'ranked' },
    })
    act(() => useSettingsDetailStore.getState().requestLeave())
    expect(useSettingsDetailStore.getState().view).toMatchObject({
      page: 'skill-section',
      file: 'best-100',
      sub: null,
    })
  })

  it('keeps repository rankings separate from global installable search results', async () => {
    mock.getPublishedSkillBoard.mockImplementation(async (chart) => ({
      syncedAt: 1000,
      rows:
        chart === 'top-repos'
          ? [
              {
                rank: 1,
                name: 'example',
                source: 'GitHub',
                metric: 'stars',
                value: '1200',
                installable: false,
                installs: '',
              },
            ]
          : [],
    }))
    mock.findMarketSkills.mockResolvedValue([offList])
    renderMarket()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Official 100' })).toBeInTheDocument()
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
      if (cachedOnly) return _chart === 'best-100' ? snapshot : { syncedAt: 1000, rows: [] }
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
