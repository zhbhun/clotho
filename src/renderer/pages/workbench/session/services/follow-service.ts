import type { SessionController } from '../session-controller'

export class FollowService {
  private readonly controller: SessionController
  private followController: { stop: () => void } | null = null
  private followingSessionId: string | null = null
  private reloadTimer: ReturnType<typeof setTimeout> | null = null
  private reloadPromise: Promise<void> | null = null
  private startReload: (() => void) | null = null
  private isActive = false

  constructor(controller: SessionController) {
    this.controller = controller
  }

  stop() {
    if (!this.followController) {
      this.followingSessionId = null
      return
    }
    this.followController.stop()
    this.followController = null
    this.followingSessionId = null
    this.controller.runtimeStore.setState({ followState: null })
  }

  sync() {
    if (this.controller.isDisposed) return
    const context = this.controller.contextStore.getState()
    const runtime = this.controller.runtimeStore.getState()
    if (!this.isActive || !context.claudeSessionId || !context.projectId || runtime.isStreaming) {
      this.stop()
      return
    }
    if (this.followingSessionId === context.claudeSessionId && this.followController) return
    this.stop()
    this.followingSessionId = context.claudeSessionId
    this.followController = this.controller.claudeService.followSession(
      context.projectId,
      context.claudeSessionId,
      {
        onUpdate: (lines) => {
          if (this.controller.isDisposed) return
          for (const entry of lines) {
            this.controller.historyService.ingestLine(JSON.stringify(entry))
          }
        },
        onState: (followState) => {
          if (!this.controller.isDisposed) this.controller.runtimeStore.setState({ followState })
        },
        onReset: () => {
          if (!this.controller.isDisposed) this.reload()
        },
      },
    )
  }

  private reload() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    if (!this.reloadPromise) {
      const ready = new Promise<void>((resolve) => {
        this.startReload = resolve
      })
      const promise = this.controller.reloadHistory(ready)
      this.reloadPromise = promise
      void promise
        .then(
          () => {
            if (this.controller.isDisposed) return
            void this.controller.catalogService.initialize().catch(() => {})
            this.sync()
          },
          () => {},
        )
        .finally(() => {
          if (this.reloadPromise !== promise) return
          this.reloadPromise = null
          this.startReload = null
        })
    }
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null
      this.stop()
      this.startReload?.()
      this.startReload = null
    }, 500)
  }

  activate() {
    this.isActive = true
    this.sync()
  }

  deactivate() {
    this.isActive = false
    this.stop()
  }

  dispose() {
    this.deactivate()
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = null
    this.startReload?.()
    this.startReload = null
  }
}
