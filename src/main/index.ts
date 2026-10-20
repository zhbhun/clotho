import { app } from 'electron'
import started from 'electron-squirrel-startup'

import { bootstrap } from './bootstrap'

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit()
} else {
  void app
    .whenReady()
    .then(() => bootstrap())
    .catch(() => {
      // Fatal errors are already logged by the bootstrap's fatal handler.
      app.exit(1)
    })
}

// macOS keeps the app in the dock after its last window closes; elsewhere
// closing the last window quits.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
