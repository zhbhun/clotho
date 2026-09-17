export interface ContextMenuGateOptions {
  isDev: boolean
  getSelectionText?: () => string
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.closest('input, textarea')) {
    return true
  }
  const editable = target.closest('[contenteditable]')
  return editable !== null && editable.getAttribute('contenteditable') !== 'false'
}

/**
 * Suppresses the native context menu outside editable areas in production.
 * Editable targets and text selections keep the system menu; dev mode is
 * never gated. Custom menus (e.g. session context menus) preventDefault on
 * their own triggers and are unaffected.
 */
export function installContextMenuGate({
  isDev,
  getSelectionText = () => window.getSelection()?.toString() ?? '',
}: ContextMenuGateOptions): () => void {
  if (isDev) {
    return () => {}
  }
  const handleContextMenu = (event: MouseEvent) => {
    if (isEditableTarget(event.target)) {
      return
    }
    if (getSelectionText() !== '') {
      return
    }
    event.preventDefault()
  }
  document.addEventListener('contextmenu', handleContextMenu, true)
  return () => document.removeEventListener('contextmenu', handleContextMenu, true)
}
