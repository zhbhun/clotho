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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/empty'
import { Spinner } from '@/shadcn/spinner'

import { DefaultModelSettings } from '../../../components/model-configuration/default-model-settings'
import { ProviderEditorForm } from '../../../components/model-configuration/provider-editor-form'
import { SettingsSection } from '../../../components/settings-section'
import { ShortcutAlertDialog } from '../../../components/shortcut-dialog'
import { ProviderActions } from './provider-actions'
import { ProviderListCard } from './provider-list-card'
import { useSettingsDetailStore } from './settings-detail-store'
import { useDetailDirty } from './use-detail-dirty'
import { useProviderSettings } from './use-provider-settings'

/**
 * Detail-page body for the provider editor: header, form, and footer row.
 * Receives the editor state through props because the parent's
 * `useProviderSettings` owns the draft; a second hook instance would hold a
 * separate, blank draft.
 */
function ProviderEditorPage({ settings }: { settings: ReturnType<typeof useProviderSettings> }) {
  const { t } = useTranslation()
  useDetailDirty(settings.editingProvider)
  const requestLeave = useSettingsDetailStore((state) => state.requestLeave)
  // Cancel is list-bound navigation: the shared guard confirms when dirty.
  const cancelEditing = requestLeave

  if (!settings.editingProvider) return null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium tracking-tight">
          {settings.isEditingExisting ? t('settings.provider.edit') : t('settings.provider.add')}
        </h1>
        <p className="text-sm text-foreground-subtlest">
          {t('settings.provider.detailDescription')}
        </p>
      </header>
      <div className="flex flex-col gap-4">
        {/* ProviderEditorForm carries Card padding (px-6 py-4) for its
            onboarding dialog usage; cancel it here so the form aligns with
            the bare header and footer. */}
        <ProviderEditorForm
          className="px-0 py-0"
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
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={cancelEditing}>
            {t('settings.common.cancel')}
          </Button>
          <Button
            disabled={settings.isSavingProvider || Boolean(settings.deletingProviderId)}
            onClick={() => void settings.saveEditing()}
          >
            {settings.isSavingProvider ? <Spinner data-icon="inline-start" /> : null}
            {t('settings.common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ProviderSettings() {
  const { t } = useTranslation()
  const settings = useProviderSettings()
  const view = useSettingsDetailStore((state) => state.view)
  const isEditorOpen = view.kind === 'detail' && view.categoryId === 'models'

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
      {/* The model-mapping section belongs to the list view; the detail
          page replaces the whole category content. */}
      {!isEditorOpen ? (
        <DefaultModelSettings
          providers={settings.providers}
          model={settings.defaultModel}
          modelMappings={settings.modelMappings}
          onSave={settings.saveDefaultModel}
          onSaveMappings={settings.saveMappings}
        />
      ) : null}

      {isEditorOpen ? (
        <ProviderEditorPage settings={settings} />
      ) : (
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
                  onEdit={() => settings.openExisting(provider)}
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
      )}

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
