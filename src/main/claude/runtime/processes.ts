import type { ChildProcess } from 'node:child_process'

const processes = new Set<ChildProcess>()

export function trackClaudeProcess(child: ChildProcess) {
  processes.add(child)
  const remove = () => processes.delete(child)
  child.once('exit', remove)
  child.once('error', () => {
    if (child.pid === undefined) remove()
  })
  return child
}

export function hasClaudeProcesses() {
  return processes.size > 0
}
