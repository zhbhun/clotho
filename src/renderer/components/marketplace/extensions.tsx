import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shadcn/breadcrumb'

import { DiscardChangesDialog } from './discard-changes-dialog'
import { MarketplaceSettings } from './marketplace-settings'
import { DetailStoreProvider, useSettingsDetailStore } from './settings-detail-store'

export function Extensions() {
  return (
    <DetailStoreProvider>
      <ExtensionsContent />
    </DetailStoreProvider>
  )
}

function ExtensionsContent() {
  const { t } = useTranslation()
  const detail = useSettingsDetailStore()
  const [sectionToolbar, setSectionToolbar] = useState<HTMLDivElement | null>(null)
  const view = detail.view
  const page = view.kind === 'detail' ? view.page : null
  const isPlugins = page === 'install' || page === 'install-section'
  const rootLabel = isPlugins
    ? t('settings.agent.title.plugins')
    : page === 'marketplaces'
      ? t('settings.agent.plugins.marketplaces')
      : t('settings.agent.title.skills')

  return (
    <div className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden" data-extensions>
      {view.kind === 'detail' ? (
        <div className="app-region-drag flex h-10 shrink-0 items-center px-4">
          <Breadcrumb className="app-region-no-drag min-w-0">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={<button type="button" />}
                  className="cursor-pointer"
                  onClick={view.sub ? detail.backToList : detail.requestLeave}
                >
                  {rootLabel}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              {view.sub && (
                <>
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbLink
                      render={<button type="button" />}
                      className="cursor-pointer truncate"
                      onClick={detail.requestLeave}
                    >
                      {detail.leaf}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">
                  {view.sub ? detail.subLeaf : detail.leaf}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {page === 'install-section' && !view.sub && (
            <div
              className="app-region-no-drag ml-auto flex min-w-0 items-center gap-1 pl-3"
              ref={setSectionToolbar}
            />
          )}
        </div>
      ) : null}
      <MarketplaceSettings initialTab="plugins" sectionToolbar={sectionToolbar} />
      <DiscardChangesDialog
        open={detail.isLeavePending}
        subject={detail.view.kind === 'detail' && detail.view.sub ? detail.subLeaf : detail.leaf}
        onOpenChange={(open) => {
          if (!open) detail.cancelLeave()
        }}
        onDiscard={detail.confirmLeave}
      />
    </div>
  )
}
