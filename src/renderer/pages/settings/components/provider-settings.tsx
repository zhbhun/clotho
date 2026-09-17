import { Library } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shadcn/alert-dialog'
import { Button } from '@/shadcn/button'
import { Card } from '@/shadcn/card'
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/dialog'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/empty'
import { Spinner } from '@/shadcn/spinner'

import { ModelMappingSettings } from '../../../components/model-configuration/model-mapping-settings'
import { ProviderEditorForm } from '../../../components/model-configuration/provider-editor-form'
import { SettingsSection } from '../../../components/settings-section'
import { ShortcutAlertDialog, ShortcutDialog } from '../../../components/shortcut-dialog'
import { TransientScrollArea } from '../../../components/transient-scroll-area'
import { ProviderActions } from './provider-actions'
import { ProviderListCard } from './provider-list-card'
import { useProviderSettings } from './use-provider-settings'

export function ProviderSettings() {
  const { t } = useTranslation()
  const settings = useProviderSettings()

  if (settings.hasLoadError) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Library />
          </EmptyMedia>
          <EmptyTitle>{t('settings.provider.loadError')}</EmptyTitle>
          <EmptyDescription>{t('settings.provider.loadErrorDescription')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => void settings.loadModelConfiguration()}
          >
            {t('settings.provider.reload')}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <ModelMappingSettings
        providers={settings.providers}
        models={settings.modelMappings}
        onSave={settings.saveModelMappings}
      />

      <SettingsSection
        title={t('settings.provider.title')}
        action={
          !settings.isLoading ? (
            <ProviderActions onNew={settings.openBlank} onPreset={settings.openFromPreset} />
          ) : undefined
        }
      >
        {settings.providers.length > 0 ? (
          <div className="flex flex-col gap-3">
            {settings.providers.map((provider) => (
              <ProviderListCard
                isDeleteDisabled={Boolean(settings.deletingProviderId)}
                isDeleting={settings.deletingProviderId === provider.id}
                isUsagePending={Boolean(settings.usagePendingIds[provider.id])}
                key={provider.id}
                provider={provider}
                usage={settings.usageByProviderId[provider.id]}
                onEdit={(trigger) => settings.openExisting(provider, trigger)}
                onRefreshUsage={() => void settings.refreshProviderUsage([provider])}
                onDelete={() => settings.setDeleteTarget(provider)}
              />
            ))}
          </div>
        ) : settings.isLoading ? (
          <Card className="gap-0 py-0">
            <Empty className="min-h-48">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Spinner />
                </EmptyMedia>
                <EmptyTitle>{t('settings.provider.loadingTitle')}</EmptyTitle>
                <EmptyDescription>{t('settings.provider.loadingDescription')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Card>
        ) : (
          <Card className="gap-0 py-0">
            <Empty className="min-h-56">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Library />
                </EmptyMedia>
                <EmptyTitle>{t('settings.provider.none')}</EmptyTitle>
                <EmptyDescription>{t('settings.provider.noneDescription')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Card>
        )}
      </SettingsSection>

      <ShortcutDialog
        open={settings.editingProvider !== null}
        onOpenChange={(open) => {
          if (!open) settings.closeEditor()
        }}
      >
        <DialogContent
          className="gap-0 overflow-hidden p-0 sm:max-w-3xl"
          finalFocus={(closeType) => {
            if (closeType !== 'keyboard') {
              return false
            }
            const trigger = settings.editorTriggerRef.current
            return trigger?.isConnected ? trigger : true
          }}
        >
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>
              {settings.isEditingExisting
                ? t('settings.provider.edit')
                : t('settings.provider.add')}
            </DialogTitle>
            <DialogDescription className="text-foreground-subtle">
              {t('settings.provider.description')}
            </DialogDescription>
          </DialogHeader>
          <TransientScrollArea className="max-h-[60vh]">
            {settings.editingProvider ? (
              <ProviderEditorForm
                provider={settings.editingProvider}
                providerIdError={settings.providerIdError}
                modelIdErrorIndexes={settings.modelIdErrorIndexes}
                isProviderIdReadOnly={settings.isEditingExisting}
                onChange={settings.patchEditing}
                onAddModel={settings.addModel}
                onUpdateModel={settings.updateModel}
                onRemoveModel={settings.removeModel}
                onFetchModels={settings.fetchModels}
                onPreset={settings.applyPresetToEditing}
                isFetchingModels={settings.isFetchingModels}
              />
            ) : null}
          </TransientScrollArea>
          <DialogFooter className="border-t px-6 py-4">
            <Button
              disabled={settings.isSavingProvider || Boolean(settings.deletingProviderId)}
              onClick={() => void settings.saveEditing()}
            >
              {settings.isSavingProvider ? <Spinner data-icon="inline-start" /> : null}
              {t('settings.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </ShortcutDialog>

      <ShortcutAlertDialog
        open={settings.deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !settings.deletingProviderId) settings.setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.provider.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.provider.confirmDeleteDescription', {
                name: settings.deleteTarget?.name || t('settings.provider.unnamed'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(settings.deletingProviderId)}>
              {t('settings.common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(settings.deletingProviderId)}
              variant="destructive"
              onClick={(event) => {
                event.preventDefault()
                if (settings.deleteTarget) void settings.deleteProvider(settings.deleteTarget.id)
              }}
            >
              {settings.deletingProviderId ? <Spinner data-icon="inline-start" /> : null}
              {t('settings.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </ShortcutAlertDialog>
    </div>
  )
}
