import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { ShortcutHost } from './components/shortcut-host'
import { ShortcutScope } from './components/shortcut-scope'
import { WorkbenchPage } from './pages/workbench'
import { ShortcutRuntimeProvider, shortcutRuntime } from './services/shortcuts/runtime'

function AppContent() {
  return (
    <ShortcutScope scope="workbench">
      <ShortcutHost />
      <WorkbenchPage />
    </ShortcutScope>
  )
}

export default function App() {
  return (
    <ShortcutRuntimeProvider runtime={shortcutRuntime}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </ShortcutRuntimeProvider>
  )
}
