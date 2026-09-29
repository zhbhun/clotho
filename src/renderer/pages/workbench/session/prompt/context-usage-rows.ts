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
  /** Display position in the panel: prompt, tools, rules, skills, MCP, agents, conversation. */
  order: number
}

const FALLBACK_CATEGORY_ORDER = 99

/**
 * Matchers against the SDK report's raw category names ("System prompt",
 * "System tools", "MCP server instructions", …). Match priority follows array
 * order: "System prompt" must be classified before the generic tool matcher and
 * "MCP" before it, since both names contain "tool". Every entry yields at most
 * one panel row — all raw categories it matches are merged with summed tokens,
 * so "MCP tools" and "MCP server instructions" collapse into a single MCP row.
 * `order` controls the panel's display sequence, which differs from match
 * priority. The autocompact buffer and free space are intentionally unlisted —
 * both are filtered out.
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
      order: 4,
    },
  },
  {
    match: (name) => name.toLowerCase().includes('agent'),
    style: {
      labelKey: 'workbench.prompt.contextCategoryCustomAgents',
      segmentClass: 'bg-project-icon-purple',
      order: 5,
    },
  },
  {
    match: (name) => name.toLowerCase().includes('memory'),
    style: {
      labelKey: 'workbench.prompt.contextCategoryMemory',
      segmentClass: 'bg-project-icon-green',
      order: 2,
    },
  },
  {
    match: (name) => name.toLowerCase().includes('skill'),
    style: {
      labelKey: 'workbench.prompt.contextCategorySkills',
      segmentClass: 'bg-project-icon-cyan',
      order: 3,
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

/** Token counts below 1K stay raw; everything larger renders as rounded K with one decimal. */
export function formatTokenCount(value: number) {
  if (value < 1000) return String(value)
  return `${(value / 1000).toFixed(1)}K`
}

type ReportCategory = ClaudeContextUsageSnapshot['categories'][number]

/**
 * Turns the raw `/context` categories into display rows: drops free space, the
 * autocompact buffer, and zero-token entries; merges the raw categories of each
 * known kind into a single localized row (MCP's two rows become one); keeps
 * unknown categories as their own rows; sorts by the panel's canonical order.
 */
export function buildContextRows(
  categories: ReadonlyArray<ReportCategory>,
  translateLabel: (labelKey: CategoryLabelKey) => string,
): ContextUsageRow[] {
  const filtered = categories.filter(
    (category) =>
      !isFreeSpace(category.name) && !isAutocompactBuffer(category.name) && category.tokens > 0,
  )
  const unmatched = [...filtered]
  const rows: Array<ContextUsageRow & { order: number }> = []
  for (const { match, style } of CATEGORY_STYLES) {
    const matched = unmatched.filter((category) => match(category.name))
    if (!matched.length) continue
    for (const category of matched) unmatched.splice(unmatched.indexOf(category), 1)
    rows.push({
      name: matched[0].name,
      tokens: matched.reduce((sum, category) => sum + category.tokens, 0),
      label: style.labelKey ? translateLabel(style.labelKey) : matched[0].name,
      segmentClass: style.segmentClass,
      order: style.order,
    })
  }
  // Unknown categories share the fallback palette and keep their raw names;
  // indexing by encounter order keeps each color stable across renders.
  for (const [index, category] of unmatched.entries()) {
    rows.push({
      name: category.name,
      tokens: category.tokens,
      label: category.name,
      segmentClass: FALLBACK_SEGMENT_CLASSES[index % FALLBACK_SEGMENT_CLASSES.length],
      order: FALLBACK_CATEGORY_ORDER,
    })
  }
  return rows
    .sort((a, b) => a.order - b.order)
    .map(({ name, tokens, label, segmentClass }) => ({ name, tokens, label, segmentClass }))
}
