import { Sparkles } from 'lucide-react'

import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'

export const skillRenderer: ToolRenderer = {
  icon: Sparkles,
  label: 'tools.Skill.label',
  description: 'tools.skill.description',
  summary: (input) => pickString(input, ['skill', 'name']),
  inputView: () => null,
  hasBody: () => false,
}
