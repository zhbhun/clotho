import type { ClaudeContextUsageSnapshot } from '../../../../services/claude/claude'
import type { SessionController } from '../session-controller'
import { qualifiedSessionModel } from '../stores/model-selection'

/**
 * On-demand context-usage sampling between turns: no live query exists to
 * answer a control request, so each sample boots a short-lived idle query on
 * the session transcript and closes it after one snapshot.
 */
export class UsageSampler {
  private readonly controller: SessionController
  private samplePromise: Promise<ClaudeContextUsageSnapshot | null> | null = null

  constructor(controller: SessionController) {
    this.controller = controller
  }

  /** Deduped: concurrent callers share one sampling query instead of spawning a CLI each. */
  sample(): Promise<ClaudeContextUsageSnapshot | null> {
    if (!this.samplePromise) {
      this.samplePromise = this.runSample().finally(() => {
        this.samplePromise = null
      })
    }
    return this.samplePromise
  }

  private async runSample(): Promise<ClaudeContextUsageSnapshot | null> {
    this.controller.usageStore.setState({ isSampling: true })
    try {
      const context = this.controller.contextStore.getState()
      if (context.isMockProject) return null
      const composer = this.controller.composerStore.getState()
      const modelConfiguration = this.controller.modelConfigurationStore.getState()
      const model = qualifiedSessionModel({ ...context, ...composer, ...modelConfiguration })
      const snapshot = await this.controller.claudeService.sampleContextUsage({
        ...(context.isHomeMode ? {} : { cwd: context.projectPath ?? undefined }),
        ...(context.claudeSessionId ? { sessionId: context.claudeSessionId } : {}),
        ...(model ? { model } : {}),
      })
      if (snapshot) this.controller.usageStore.setState({ snapshot })
      return snapshot
    } catch {
      return null
    } finally {
      this.controller.usageStore.setState({ isSampling: false })
    }
  }
}
