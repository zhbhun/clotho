import { fireEvent, render, screen } from '@testing-library/react'
import { useTranslation } from 'react-i18next'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_APP_PREFERENCES, initializeAppSettings } from '../services/app-settings'
import { LanguageProvider, useLanguage } from './language-provider'
import { createAppI18n } from './runtime'

function LanguageProbe() {
  const { preference, setPreference } = useLanguage()
  const { t } = useTranslation()

  return (
    <div>
      <output>{`${preference}/${t('settings.title')}`}</output>
      <button onClick={() => setPreference('fr')}>French</button>
    </div>
  )
}

describe('LanguageProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.lang = ''
  })

  it('tracks system language changes while following the system', async () => {
    let systemLanguages = ['en-US']
    const instance = await createAppI18n('system', systemLanguages)

    render(
      <LanguageProvider
        getSystemLanguages={() => systemLanguages}
        initialPreference="system"
        instance={instance}
      >
        <LanguageProbe />
      </LanguageProvider>,
    )

    systemLanguages = ['zh-HK']
    fireEvent(window, new Event('languagechange'))

    expect(await screen.findByText('system/設定')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('zh-TW')
  })

  it('restores the last saved language when persistence fails', async () => {
    const instance = await createAppI18n('system', ['zh-CN'])
    await initializeAppSettings({
      load: async () => DEFAULT_APP_PREFERENCES,
      save: async () => {
        throw new Error('Disk write failed')
      },
    })

    render(
      <LanguageProvider
        getSystemLanguages={() => ['zh-CN']}
        initialPreference="system"
        instance={instance}
      >
        <LanguageProbe />
      </LanguageProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'French' }))

    expect(await screen.findByText('system/设置')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('zh-CN')
  })
})
