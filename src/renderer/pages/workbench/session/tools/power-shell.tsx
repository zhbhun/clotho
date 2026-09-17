import { SquareTerminal } from 'lucide-react'

import { commandRenderer } from './shared/command'

export const powerShellRenderer = commandRenderer(
  'tools.PowerShell.label',
  'tools.powerShell.description',
  SquareTerminal,
  'PS>',
)
