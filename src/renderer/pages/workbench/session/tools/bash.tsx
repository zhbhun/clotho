import { Terminal } from 'lucide-react'

import { commandRenderer } from './shared/command'

export const bashRenderer = commandRenderer('tools.Bash.label', 'tools.bash.description', Terminal)
