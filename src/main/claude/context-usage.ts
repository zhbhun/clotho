import type { Query } from '@anthropic-ai/claude-agent-sdk'

import type { ClaudeContextUsageSnapshot } from '@/shared/rpc'

const USAGE_SAMPLE_TIMEOUT_MS = 10_000
const MCP_CONNECT_TIMEOUT_MS = 10_000
const MCP_POLL_INTERVAL_MS = 400

function toContextUsageSnapshot(usage: {
  model: string
  totalTokens: number
  maxTokens: number
  rawMaxTokens: number
  percentage: number
  categories: Array<{ name: string; tokens: number; isDeferred?: boolean }>
}): ClaudeContextUsageSnapshot {
  return {
    model: usage.model,
    totalTokens: usage.totalTokens,
    maxTokens: usage.maxTokens,
    rawMaxTokens: usage.rawMaxTokens,
    percentage: usage.percentage,
    // Deferred categories are out-of-window tool schemas — listed for awareness
    // by /context but excluded from the usage math, so they stay out of the
    // snapshot as well.
    categories: usage.categories
      .filter((category) => !category.isDeferred)
      .map((category) => ({
        name: category.name,
        tokens: category.tokens,
      })),
  }
}

/**
 * 'full' counts each category with the token-count API; 'summary' estimates
 * locally and over-reports tool definitions several-fold. Bounded so a
 * stalled CLI never wedges the control request. Waits for MCP servers to
 * finish connecting first — each turn spawns a fresh CLI process, so servers
 * may still be connecting when the control request arrives, and unconnected
 * servers are missing from the report entirely.
 */
export async function sampleContextUsage(sdk: Query): Promise<ClaudeContextUsageSnapshot | null> {
  try {
    await waitForMcpConnections(sdk)
    const usage = await Promise.race([
      sdk.getContextUsage({ detail: 'full' }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('getContextUsage timed out')), USAGE_SAMPLE_TIMEOUT_MS)
      }),
    ])
    return toContextUsageSnapshot(usage)
  } catch {
    return null
  }
}

/**
 * Resolves once no configured MCP server is still 'pending' (connected, or
 * terminally failed / needs-auth / disabled). Bounded by a timeout so a hung
 * server never blocks sampling; status errors are treated as settled.
 */
async function waitForMcpConnections(sdk: Query): Promise<void> {
  const deadline = Date.now() + MCP_CONNECT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const statuses = await sdk.mcpServerStatus().catch(() => [])
    if (!statuses.some((status) => status.status === 'pending')) return
    await new Promise((resolve) => setTimeout(resolve, MCP_POLL_INTERVAL_MS))
  }
}
