import { TextSearch } from 'lucide-react'

import { ParamsInput } from './shared/content'
import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'

export const grepRenderer: ToolRenderer = {
  icon: TextSearch,
  label: 'tools.Grep.label',
  description: 'tools.grep.description',
  summary: (input) => pickString(input, ['pattern']),
  inputView: (input) => (
    <ParamsInput
      params={{
        pattern: pickString(input, ['pattern']),
        path: pickString(input, ['path', 'output_mode']),
      }}
    />
  ),
}
