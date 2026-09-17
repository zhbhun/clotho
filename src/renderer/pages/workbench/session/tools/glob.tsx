import { FolderSearch2 } from 'lucide-react'

import { ParamsInput } from './shared/content'
import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'

export const globRenderer: ToolRenderer = {
  icon: FolderSearch2,
  label: 'tools.Glob.label',
  description: 'tools.glob.description',
  summary: (input) => pickString(input, ['pattern']),
  inputView: (input) => <ParamsInput params={{ pattern: pickString(input, ['pattern']) }} />,
}
