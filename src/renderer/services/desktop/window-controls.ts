import { isDesktopRuntime, requestFromDesktop } from './client'

const DRAG_REGION_SELECTOR = '.app-region-drag'
const NO_DRAG_REGION_SELECTOR = '.app-region-no-drag'

export function installWindowTitlebarDoubleClick() {
  if (!isDesktopRuntime()) return () => {}

  const handleDoubleClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest(NO_DRAG_REGION_SELECTOR)) return
    if (!target.closest(DRAG_REGION_SELECTOR)) return

    void requestFromDesktop('windowToggleMaximize', {})
  }

  document.addEventListener('dblclick', handleDoubleClick)

  return () => {
    document.removeEventListener('dblclick', handleDoubleClick)
  }
}
