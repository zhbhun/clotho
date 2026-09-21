import { nativeTheme } from 'electron'

import type { AppTheme } from '@/shared/rpc'

/**
 * Syncs the native window appearance with the app theme, so system-drawn
 * chrome (traffic lights, context menus) matches the rendered UI instead of
 * always following the OS appearance.
 */
export function applyNativeAppearance(theme: AppTheme) {
  nativeTheme.themeSource = theme
}
