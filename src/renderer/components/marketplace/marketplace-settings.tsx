import { Puzzle, Sparkles, Store } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shadcn/tabs'

import { APP_CONTENT_CONTAINER_CLASS } from '../app-layout'
import { TabSurface } from '../tab-surface'
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
  sectionToolbar,
}: {
  initialTab: MarketplaceEntryTab
  hideTabs?: boolean
  sectionToolbar?: HTMLElement | null
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<string>(initialTab)
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null)
  const view = useSettingsDetailStore((state) => state.view)

  let detailContent: ReactNode = null
  if (view.kind === 'detail' && view.categoryId === 'agent-marketplace') {
    if (view.page === 'skills' && view.file)
      detailContent = (
        <SkillDetailPage
          key={view.marketSkill?.source + view.file}
          name={view.file}
          marketSkill={view.marketSkill}
        />
      )
    if (view.page === 'skill-section') {
      detailContent =
        view.sub?.page === 'skill-detail' && view.sub.file ? (
          <SkillDetailPage
            key={view.sub.marketSkill?.source + view.sub.file}
            name={view.sub.file}
            marketSkill={view.sub.marketSkill}
          />
        ) : (
          <SkillMarketplace />
        )
    }
    if (view.page === 'install' && view.file)
      detailContent = <InstallPluginDetailPage pluginId={view.file} />
    if (view.page === 'install-section') {
      detailContent =
        view.sub?.page === 'install-detail' && view.sub.file ? (
          <InstallPluginDetailPage pluginId={view.sub.file} />
        ) : (
          <InstallPluginPage key={view.file} toolbar={sectionToolbar} />
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
    return hideTabs ? detailContent : <MarketContent isDetail>{detailContent}</MarketContent>
  }

  if (hideTabs) return initialTab === 'skills' ? <SkillMarketplace /> : <InstallPluginPage />

  return (
    <Tabs className="min-h-0 flex-1 gap-0" value={tab} onValueChange={setTab}>
      <header
        className="session-tabs app-region-drag relative flex h-10 shrink-0 items-center justify-between gap-3 bg-background px-4"
        data-has-tabs="true"
      >
        <TabsList className="app-region-no-drag relative z-1 h-8 shrink-0 gap-0 rounded-none bg-transparent p-0">
          {(
            [
              ['plugins', t('settings.agent.title.plugins'), Puzzle],
              ['skills', t('settings.agent.title.skills'), Sparkles],
              ['marketplaces', t('settings.agent.plugins.marketplaces'), Store],
            ] as const
          ).map(([value, label, Icon]) => (
            <div
              key={value}
              className="session-tab relative h-8 min-w-16"
              data-active={value === tab ? 'true' : undefined}
            >
              {value === tab && <TabSurface style={{ left: 3, width: 'calc(100% - 6px)' }} />}
              <TabsTrigger
                value={value}
                className="relative h-full w-full rounded-none border-0 bg-transparent px-3 font-normal data-active:bg-transparent group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:bg-transparent"
              >
                <Icon aria-hidden className="size-4" strokeWidth={1.5} />
                {label}
              </TabsTrigger>
            </div>
          ))}
        </TabsList>
        <div className="app-region-no-drag relative z-1 min-w-0" ref={setToolbar} />
      </header>
      <MarketContent>
        <TabsContent value="plugins">
          <InstallPluginPage toolbar={tab === 'plugins' ? toolbar : null} />
        </TabsContent>
        <TabsContent value="skills">
          <SkillMarketplace toolbar={tab === 'skills' ? toolbar : null} />
        </TabsContent>
        <TabsContent value="marketplaces">
          <MarketplaceListPage toolbar={tab === 'marketplaces' ? toolbar : null} />
        </TabsContent>
      </MarketContent>
    </Tabs>
  )
}

function MarketContent({
  children,
  isDetail = false,
}: {
  children: ReactNode
  isDetail?: boolean
}) {
  return (
    <TransientScrollArea className="min-h-0 flex-1">
      <div className={`px-6 pb-12 ${isDetail ? 'pt-2' : 'pt-7'}`}>
        <div className={APP_CONTENT_CONTAINER_CLASS}>{children}</div>
      </div>
    </TransientScrollArea>
  )
}
