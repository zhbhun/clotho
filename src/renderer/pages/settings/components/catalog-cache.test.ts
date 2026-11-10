import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listAgentAvailablePlugins, listAgentPlugins } from '../../../services/claude/agent-config'
import {
  refreshCatalog,
  refreshInstalled,
  updateInstalled,
  updateMarketplaces,
  useCatalogCache,
} from './catalog-cache'

vi.mock('../../../services/claude/agent-config', () => ({
  listAgentAvailablePlugins: vi.fn(),
  listAgentPlugins: vi.fn(),
}))

const entry = { pluginId: 'a@b', name: 'a', marketplaceName: 'b' }

beforeEach(() => {
  vi.resetAllMocks()
  useCatalogCache.setState({
    catalog: null,
    installed: null,
    installedChanges: new Map(),
    catalogLoading: false,
    catalogError: false,
    installedError: false,
  })
})

describe('catalog cache', () => {
  it('retains separate successful and failed snapshots including empty results', async () => {
    vi.mocked(listAgentAvailablePlugins)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error())
    vi.mocked(listAgentPlugins).mockRejectedValueOnce(new Error()).mockResolvedValueOnce([])
    await Promise.all([refreshCatalog(), refreshInstalled()])
    expect(useCatalogCache.getState()).toMatchObject({
      catalog: [],
      installed: null,
      installedError: true,
    })
    await Promise.all([refreshCatalog(), refreshInstalled()])
    expect(useCatalogCache.getState()).toMatchObject({
      catalog: [],
      installed: [],
      catalogError: true,
    })
  })

  it('ignores old results after a newer request or successful mutation', async () => {
    let resolveOld!: (value: (typeof entry)[]) => void
    vi.mocked(listAgentAvailablePlugins)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockResolvedValueOnce([entry])
    const old = refreshCatalog()
    await refreshCatalog()
    resolveOld([])
    await old
    expect(useCatalogCache.getState().catalog).toEqual([entry])

    let resolveInstalled!: (value: never[]) => void
    vi.mocked(listAgentPlugins)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveInstalled = resolve
        }),
      )
      .mockReturnValueOnce(new Promise(() => {}))
    useCatalogCache.setState({ installed: [] })
    const oldInstalled = refreshInstalled()
    updateInstalled('a@b', 'install')
    resolveInstalled([])
    await oldInstalled
    expect(useCatalogCache.getState().installed?.[0].id).toBe('a@b')
  })

  it('retains known operations without a snapshot until a fresh read succeeds', async () => {
    let resolveOld!: (value: never[]) => void
    vi.mocked(listAgentPlugins)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockRejectedValueOnce(new Error('unavailable'))
    const old = refreshInstalled()
    updateInstalled('a@b', 'install')
    resolveOld([])
    await old
    await vi.waitFor(() => expect(useCatalogCache.getState().installedError).toBe(true))
    expect(useCatalogCache.getState().installed).toBeNull()
    expect(useCatalogCache.getState().installedChanges.get('a@b')).toBe('install')

    vi.mocked(listAgentPlugins).mockResolvedValueOnce([])
    await refreshInstalled()
    expect(useCatalogCache.getState().installed).toEqual([])
    expect(useCatalogCache.getState().installedChanges.size).toBe(0)
  })

  it('reloads both snapshots after a marketplace change and discards an older catalog', async () => {
    let resolveOld!: (value: (typeof entry)[]) => void
    vi.mocked(listAgentAvailablePlugins)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockResolvedValueOnce([entry])
    vi.mocked(listAgentPlugins).mockResolvedValue([])
    const old = refreshCatalog()
    updateMarketplaces()
    await vi.waitFor(() => expect(useCatalogCache.getState().catalog).toEqual([entry]))
    resolveOld([])
    await old
    expect(useCatalogCache.getState().catalog).toEqual([entry])
    expect(useCatalogCache.getState().installed).toEqual([])
  })
})
