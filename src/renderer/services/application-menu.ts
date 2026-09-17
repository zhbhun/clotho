import type { AppLanguage } from '@/shared/rpc'

import { isDesktopRuntime, requestFromDesktop } from './desktop/client'

export function syncApplicationMenuLanguage(language: AppLanguage): void {
  if (!isDesktopRuntime()) return
  void requestFromDesktop('applicationMenuSetLanguage', { language }).catch(() => {
    // The WebView language should still change if the native menu is temporarily unavailable.
  })
}
