import type { ClaudeContextUsageSnapshot } from '../../../../services/claude/claude'

type ContextUsageRow = {
  name: string
  tokens: number
  label: string
  segmentClass: string
}

type CategoryLabelKey =
  | 'workbench.prompt.contextCategorySystemPrompt'
  | 'workbench.prompt.contextCategorySystemTools'
  | 'workbench.prompt.contextCategorySkills'
  | 'workbench.prompt.contextCategoryMcpTools'
  | 'workbench.prompt.contextCategoryCustomAgents'
  | 'workbench.prompt.contextCategoryMemory'
  | 'workbench.prompt.contextCategoryMessages'

type CategoryStyle = {
  labelKey?: CategoryLabelKey
  segmentClass: string
  /** Display position in the panel, mirroring the CLI /context category order. */
  order: number
}

const FALLBACK_CATEGORY_ORDER = 99

/**
 * Matchers against the SDK report's raw category names ("System prompt",
 * "System tools", "Memory files", …). Match priority follows array order:
 * "System prompt" must be classified before the generic tool matcher and
 * "MCP tools" before it, since both names contain "tool". `order` controls the
 * panel's display sequence, which differs from match priority. The autocompact
 * buffer and free space are intentionally unlisted — both are filtered out.
 */
const CATEGORY_STYLES: Array<{ match: (name: string) => boolean; style: CategoryStyle }> = [
  {
    match: (name) => name.toLowerCase().includes('system prompt'),
    style: {
      labelKey: 'workbench.prompt.contextCategorySystemPrompt',
      segmentClass: 'bg-muted-foreground/40',
      order: 0,
    },
  },
  {
    match: (name) => name.toLowerCase().includes('mcp'),
    style: {
      labelKey: 'workbench.prompt.contextCategoryMcpTools',
      segmentClass: 'bg-project-icon-pink',
      order: 2,
    },
  },
  {
    match: (name) => name.toLowerCase().includes('agent'),
    style: {
      labelKey: 'workbench.prompt.contextCategoryCustomAgents',
      segmentClass: 'bg-project-icon-purple',
      order: 3,
    },
  },
  {
    match: (name) => name.toLowerCase().includes('memory'),
    style: {
      labelKey: 'workbench.prompt.contextCategoryMemory',
      segmentClass: 'bg-project-icon-green',
      order: 4,
    },
  },
  {
    match: (name) => name.toLowerCase().includes('skill'),
    style: {
      labelKey: 'workbench.prompt.contextCategorySkills',
      segmentClass: 'bg-project-icon-cyan',
      order: 5,
    },
  },
  {
    match: (name) =>
      name.toLowerCase().includes('message') || name.toLowerCase().includes('conversation'),
    style: {
      labelKey: 'workbench.prompt.contextCategoryMessages',
      segmentClass: 'bg-project-icon-orange',
      order: 6,
    },
  },
  {
    match: (name) => name.toLowerCase().includes('tool'),
    style: {
      labelKey: 'workbench.prompt.contextCategorySystemTools',
      segmentClass: 'bg-project-icon-violet',
      order: 1,
    },
  },
]

const FALLBACK_SEGMENT_CLASSES = [
  'bg-project-icon-red',
  'bg-project-icon-blue',
  'bg-project-icon-violet',
  'bg-project-icon-pink',
  'bg-project-icon-green',
  'bg-project-icon-amber',
  'bg-project-icon-cyan',
  'bg-project-icon-purple',
]

function isFreeSpace(name: string) {
  return name.toLowerCase().includes('free')
}

function isAutocompactBuffer(name: string) {
  return name.toLowerCase().includes('buffer')
}

function resolveCategoryStyle(name: string, fallbackIndex: number): CategoryStyle {
  const matched = CATEGORY_STYLES.find((entry) => entry.match(name))
  if (matched) return matched.style
  return {
    segmentClass: FALLBACK_SEGMENT_CLASSES[fallbackIndex % FALLBACK_SEGMENT_CLASSES.length],
    order: FALLBACK_CATEGORY_ORDER,
  }
}

/** Token counts below 1K stay raw; everything larger renders as rounded K with one decimal. */
export function formatTokenCount(value: number) {
  if (value < 1000) return String(value)
  return `${(value / 1000).toFixed(1)}K`
}

type ReportCategory = ClaudeContextUsageSnapshot['categories'][number]

/**
 * Turns the raw `/context` categories into display rows: drops free space, the
 * autocompact buffer, and zero-token entries; localizes known labels; sorts by
 * the CLI's canonical category order.
 */
export function buildContextRows(
  categories: ReadonlyArray<ReportCategory>,
  translateLabel: (labelKey: CategoryLabelKey) => string,
): ContextUsageRow[] {
  const filtered = categories.filter(
    (category) =>
      !isFreeSpace(category.name) && !isAutocompactBuffer(category.name) && category.tokens > 0,
  )
  const withOrder = filtered.map((category, index) => {
    // Unknown categories share the fallback palette; index by how many unknown
    // categories precede this one so each keeps a stable color across renders.
    const fallbackIndex = filtered
      .slice(0, index)
      .filter((previous) => !resolveCategoryStyle(previous.name, 0).labelKey).length
    const style = resolveCategoryStyle(category.name, fallbackIndex)
    return {
      name: category.name,
      tokens: category.tokens,
      label: style.labelKey ? translateLabel(style.labelKey) : category.name,
      segmentClass: style.segmentClass,
      order: style.order,
    }
  })
  return withOrder
    .sort((a, b) => a.order - b.order)
    .map(({ name, tokens, label, segmentClass }) => ({ name, tokens, label, segmentClass }))
}
