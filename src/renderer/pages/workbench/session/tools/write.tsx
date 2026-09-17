import { FilePlus } from 'lucide-react'

import { HeightCollapsible } from './shared/content'
import { fileSummary } from './shared/file-path'
import type { ToolRenderer } from './shared/types'

export const writeRenderer: ToolRenderer = {
  icon: FilePlus,
  label: 'tools.Write.label',
  description: 'tools.write.description',
  summary: (input) => fileSummary(input),
  inputView: (input) => <WriteInput input={input} />,
  bodyView: (input) => <WriteInput input={input} />,
}

function WriteInput({ input }: { input: unknown }) {
  const value = (input ?? {}) as Record<string, unknown>
  const content = typeof value.content === 'string' ? value.content : ''
  return <HeightCollapsible text={content} mono edgeOverlay />
}
