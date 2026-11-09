import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shadcn/tabs'

import { InstallPluginDetailPage, InstallPluginPage } from './install-page'
import { MarketplaceAddPage, MarketplaceDetailPage, MarketplaceListPage } from './marketplace-pages'
import { useSettingsDetailStore } from './settings-detail-store'

export function MarketplaceSettings() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('plugins')
  const view = useSettingsDetailStore((state) => state.view)

  if (view.kind === 'detail' && view.categoryId === 'agent-marketplace') {
    if (view.page === 'install' && view.file)
      return <InstallPluginDetailPage pluginId={view.file} />
    if (view.page === 'marketplaces') {
      return view.file ? (
        <MarketplaceDetailPage marketplaceName={view.file} />
      ) : (
        <MarketplaceAddPage />
      )
    }
  }

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="self-center">
        <TabsTrigger value="plugins">{t('settings.agent.title.plugins')}</TabsTrigger>
        <TabsTrigger value="marketplaces">{t('settings.agent.plugins.marketplaces')}</TabsTrigger>
      </TabsList>
      <TabsContent value="plugins">
        <InstallPluginPage />
      </TabsContent>
      <TabsContent value="marketplaces">
        <MarketplaceListPage />
      </TabsContent>
    </Tabs>
  )
}
