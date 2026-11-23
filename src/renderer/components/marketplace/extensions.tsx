import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'

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
  const isDetailOpen = detail.view.kind === 'detail'

  return (
    <div className="flex h-svh min-w-0 flex-1 flex-col overflow-hidden" data-extensions>
      {isDetailOpen ? (
        <div className="app-region-drag flex h-10 shrink-0 items-center px-4">
          <Button className="app-region-no-drag" variant="ghost" onClick={detail.requestLeave}>
            <ArrowLeft />
            {t('workbench.nav.extensions')}
          </Button>
        </div>
      ) : null}
      <MarketplaceSettings initialTab="plugins" />
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
