import { BrowserWindow, app } from 'electron'

const REFRESH_INTERVAL_MS = 2_000

type TaskManagerProcessRow = {
  pid: number
  type: string
  cpuPercent: number
  memoryMb: number
}

let taskManagerWindow: BrowserWindow | null = null
let refreshTimer: NodeJS.Timeout | null = null

function collectProcessRows(): TaskManagerProcessRow[] {
  return app
    .getAppMetrics()
    .map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      cpuPercent: metric.cpu.percentCPUUsage,
      memoryMb: metric.memory.workingSetSize / 1024,
    }))
    .sort((a, b) => b.cpuPercent - a.cpuPercent)
}

function renderRows(window: BrowserWindow, rows: TaskManagerProcessRow[]) {
  void window.webContents
    .executeJavaScript(`window.updateRows && window.updateRows(${JSON.stringify(rows)})`)
    .catch(() => undefined)
}

function startRefresh(window: BrowserWindow) {
  stopRefresh()
  refreshTimer = setInterval(() => {
    if (window.isDestroyed()) return
    renderRows(window, collectProcessRows())
  }, REFRESH_INTERVAL_MS)
}

function stopRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

const TASK_MANAGER_PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Task Manager</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    font: 12px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #1c1c1e;
    color: #e5e5e7;
    user-select: none;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 12px; text-align: right; white-space: nowrap; }
  th {
    position: sticky; top: 0;
    background: #2c2c2e;
    font-weight: 500; color: #98989d;
    border-bottom: 1px solid #3a3a3c;
  }
  th:first-child, td:first-child { text-align: left; }
  tbody tr:hover { background: #2c2c2e; }
  td { border-bottom: 1px solid #2c2c2e; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<table>
  <thead>
    <tr><th>Task</th><th>CPU</th><th>Memory</th><th>PID</th></tr>
  </thead>
  <tbody id="rows"></tbody>
</table>
<script>
  window.updateRows = (rows) => {
    const body = document.getElementById('rows')
    body.innerHTML = rows.map((row) =>
      '<tr><td>' + row.type + '</td>' +
      '<td>' + row.cpuPercent.toFixed(1) + '%</td>' +
      '<td>' + row.memoryMb.toFixed(1) + ' MB</td>' +
      '<td>' + row.pid + '</td></tr>'
    ).join('')
  }
</script>
</body>
</html>`

/** Chrome-style process list in a small utility window; one instance at a time. */
export function openTaskManager() {
  if (taskManagerWindow && !taskManagerWindow.isDestroyed()) {
    taskManagerWindow.focus()
    return
  }

  const window = new BrowserWindow({
    width: 480,
    height: 320,
    title: 'Task Manager',
    backgroundColor: '#1c1c1e',
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  taskManagerWindow = window
  window.on('closed', () => {
    stopRefresh()
    taskManagerWindow = null
  })
  void window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(TASK_MANAGER_PAGE))
  startRefresh(window)
}
