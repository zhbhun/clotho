import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/shadcn/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shadcn/select'
import { toast } from '@/shadcn/toast'

import { SettingsSection } from '../../../components/settings-section'
import {
  ARCHIVE_INACTIVE_DAY_OPTIONS,
  type ArchiveInactiveDays,
  loadArchiveInactiveSessions,
  saveArchiveInactiveSessions,
} from '../../../services/app-settings'

const ARCHIVE_DAY_LABEL_KEYS = {
  0: 'settings.sessions.archive.never',
  1: 'settings.sessions.archive.oneDay',
  2: 'settings.sessions.archive.twoDays',
  7: 'settings.sessions.archive.sevenDays',
  14: 'settings.sessions.archive.fourteenDays',
} as const

function ArchiveInactiveControl({
  onValueChange,
  value,
}: {
  onValueChange: (value: ArchiveInactiveDays) => void
  value: ArchiveInactiveDays
}) {
  const { t } = useTranslation()

  return (
    <Select
      items={ARCHIVE_INACTIVE_DAY_OPTIONS.map((days) => ({
        label: t(ARCHIVE_DAY_LABEL_KEYS[days]),
        value: String(days),
      }))}
      value={String(value)}
      onValueChange={(nextValue) => {
        const days = Number(nextValue) as ArchiveInactiveDays
        if (ARCHIVE_INACTIVE_DAY_OPTIONS.includes(days)) onValueChange(days)
      }}
    >
      <SelectTrigger
        aria-label={t('settings.sessions.archive.title')}
        className="w-32 self-center"
        id="settings-archive-inactive"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent glass alignItemWithTrigger={false} align="end">
        <SelectGroup>
          {ARCHIVE_INACTIVE_DAY_OPTIONS.map((days) => (
            <SelectItem key={days} value={String(days)}>
              {t(ARCHIVE_DAY_LABEL_KEYS[days])}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function SessionSettings() {
  const { t } = useTranslation()
  const [archiveInactiveDays, setArchiveInactiveDays] = useState<ArchiveInactiveDays>(() =>
    loadArchiveInactiveSessions(),
  )

  function handleArchiveInactiveChange(days: ArchiveInactiveDays) {
    setArchiveInactiveDays(days)
    void saveArchiveInactiveSessions(days).catch(() => {
      setArchiveInactiveDays(loadArchiveInactiveSessions())
      toast.add({
        id: 'settings-archive-inactive-save-error',
        title: t('common.toast.saveFailed'),
        description: t('settings.save.sessionsError'),
        type: 'error',
      })
    })
  }

  return (
    <SettingsSection title={t('settings.sessions.title')}>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="sr-only">
          <CardTitle>{t('settings.sessions.title')}</CardTitle>
          <CardDescription>{t('settings.sessions.description')}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <FieldGroup className="gap-0">
            <Field className="min-h-20 px-5 py-4" orientation="horizontal">
              <FieldContent>
                <FieldLabel className="font-normal" htmlFor="settings-archive-inactive">
                  <FieldTitle>{t('settings.sessions.archive.title')}</FieldTitle>
                </FieldLabel>
                <FieldDescription>{t('settings.sessions.archive.description')}</FieldDescription>
              </FieldContent>
              <ArchiveInactiveControl
                value={archiveInactiveDays}
                onValueChange={handleArchiveInactiveChange}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </SettingsSection>
  )
}
