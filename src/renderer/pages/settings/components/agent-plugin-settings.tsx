import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { InstallPluginDetailPage, InstallPluginPage } from './install-page'
import { MarketplaceAddPage, MarketplaceDetailPage, MarketplaceListPage } from './marketplace-pages'
import { PluginDetailPage } from './plugin-detail-page'
import { PluginListPage } from './plugin-list-page'
import { useSettingsDetailStore } from './settings-detail-store'

/**
 * Plugins category dispatcher: switches between the category's pages per the
 * shared detail view — the installed list (top level), the plugin detail /
 * marketplaces / install pages (second level), and the add-marketplace and
 * marketplace-detail subpages (third level).
 */
export function AgentPluginSettings({ onOpenMarketplace }: { onOpenMarketplace?: () => void }) {
  const { t } = useTranslation()
  const view = useSettingsDetailStore((state) => state.view)
  const setLeaf = useSettingsDetailStore((state) => state.setLeaf)
  const setSubLeaf = useSettingsDetailStore((state) => state.setSubLeaf)

  const isOwnDetail = view.kind === 'detail' && view.categoryId === 'agent-plugins'

  // Keep the breadcrumb leaves aligned with the open page.
  useEffect(() => {
    if (!isOwnDetail) return
    const detail = view as Extract<typeof view, { kind: 'detail' }>
    if (detail.sub) {
      // market-detail/install-detail pass their display leaf through openSub;
      // only the create page needs a localized label here.
      if (detail.sub.page === 'add') {
        setSubLeaf(t('settings.agent.plugins.addMarketplace'))
      }
    } else if (detail.page === 'marketplaces') {
      setLeaf(t('settings.agent.plugins.marketplaces'))
    } else if (detail.page === 'install') {
      setLeaf(t('settings.agent.plugins.installPageTitle'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnDetail, view])

  if (!isOwnDetail) return <PluginListPage onOpenMarketplace={onOpenMarketplace} />

  const detail = view as Extract<typeof view, { kind: 'detail' }>

  if (detail.sub) {
    if (detail.sub.page === 'add') return <MarketplaceAddPage />
    if (detail.sub.page === 'market-detail' && detail.sub.file) {
      return <MarketplaceDetailPage marketplaceName={detail.sub.file} />
    }
    if (detail.sub.page === 'install-detail' && detail.sub.file) {
      return <InstallPluginDetailPage pluginId={detail.sub.file} />
    }
  }

  if (detail.page === 'marketplaces') {
    return <MarketplaceListPage />
  }
  if (detail.page === 'install') {
    return <InstallPluginPage />
  }
  if (detail.file) {
    return <PluginDetailPage pluginId={detail.file} />
  }
  return <PluginListPage onOpenMarketplace={onOpenMarketplace} />
}
