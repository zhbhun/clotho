import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shadcn/tabs'

import { APP_CONTENT_CONTAINER_CLASS } from '../app-layout'
import { TransientScrollArea } from '../transient-scroll-area'
import { InstallPluginDetailPage, InstallPluginPage } from './install-page'
import { MarketplaceAddPage, MarketplaceDetailPage, MarketplaceListPage } from './marketplace-pages'
import { useSettingsDetailStore } from './settings-detail-store'
import { SkillDetailPage } from './skill-detail-page'
import { SkillMarketplace } from './skill-marketplace'

export type MarketplaceEntryTab = 'plugins' | 'skills'

export function MarketplaceSettings({
  initialTab,
  hideTabs = false,
}: {
  initialTab: MarketplaceEntryTab
  hideTabs?: boolean
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<string>(initialTab)
  const view = useSettingsDetailStore((state) => state.view)

  let detailContent: ReactNode = null
  if (view.kind === 'detail' && view.categoryId === 'agent-marketplace') {
    if (view.page === 'skills' && view.file) detailContent = <SkillDetailPage name={view.file} />
    if (view.page === 'install' && view.file)
      detailContent = <InstallPluginDetailPage pluginId={view.file} />
    if (view.page === 'install-section') {
      detailContent =
        view.sub?.page === 'install-detail' && view.sub.file ? (
          <InstallPluginDetailPage pluginId={view.sub.file} />
        ) : (
          <InstallPluginPage />
        )
    }
    if (view.page === 'marketplaces') {
      detailContent = view.file ? (
        <MarketplaceDetailPage marketplaceName={view.file} />
      ) : (
        <MarketplaceAddPage />
      )
    }
  }
  if (detailContent) {
    return hideTabs ? detailContent : <MarketContent>{detailContent}</MarketContent>
  }

  if (hideTabs) return initialTab === 'skills' ? <SkillMarketplace /> : <InstallPluginPage />

  return (
    <Tabs className="min-h-0 flex-1 gap-0" value={tab} onValueChange={setTab}>
      <div className="app-region-drag flex h-10 shrink-0 items-center justify-center px-4">
        <TabsList className="app-region-no-drag">
          <TabsTrigger value="plugins">{t('settings.agent.title.plugins')}</TabsTrigger>
          <TabsTrigger value="skills">{t('settings.agent.title.skills')}</TabsTrigger>
          <TabsTrigger value="marketplaces">{t('settings.agent.plugins.marketplaces')}</TabsTrigger>
        </TabsList>
      </div>
      <MarketContent>
        <TabsContent value="plugins">
          <InstallPluginPage />
        </TabsContent>
        <TabsContent value="skills">
          <SkillMarketplace />
        </TabsContent>
        <TabsContent value="marketplaces">
          <MarketplaceListPage />
        </TabsContent>
      </MarketContent>
    </Tabs>
  )
}

function MarketContent({ children }: { children: ReactNode }) {
  return (
    <TransientScrollArea className="min-h-0 flex-1">
      <div className="px-6 pt-2 pb-12">
        <div className={APP_CONTENT_CONTAINER_CLASS}>{children}</div>
      </div>
    </TransientScrollArea>
  )
}
