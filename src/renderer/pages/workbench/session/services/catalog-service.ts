import { fetchModelSettings } from '../../../../services/claude/model-settings'
import type { SessionController } from '../session-controller'

export class CatalogService {
  private readonly controller: SessionController
  private refreshRevision = 0

  constructor(controller: SessionController) {
    this.controller = controller
  }

  async initialize() {
    if (this.controller.isDisposed) return
    const context = this.controller.contextStore.getState()
    const composer = this.controller.composerStore.getState()
    if (context.isMockProject) return

    const initialization = await this.controller.claudeService.startup({
      options: {
        cwd: context.isHomeMode ? undefined : (context.projectPath ?? undefined),
        agent: composer.selectedAgent ?? undefined,
        permissionMode: composer.permissionMode,
      },
      initializeTimeoutMs: 60_000,
    })
    if (this.controller.isDisposed) return
    this.controller.modelConfigurationStore.getState().initialize(initialization)
    this.controller.catalogStore.setState({
      availableCommands: initialization.commands,
      availableAgents: initialization.agents,
    })
  }

  async refreshModels() {
    const revision = ++this.refreshRevision
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { modelMappings, providers } = await fetchModelSettings(this.controller.claudeService)
        if (this.controller.isDisposed || revision !== this.refreshRevision) return

        this.controller.modelConfigurationStore.getState().replaceSettings(providers, modelMappings)

        const { availableModels } = this.controller.modelConfigurationStore.getState()
        const { selectedModelId, selectedProviderId } = this.controller.composerStore.getState()
        if (
          selectedProviderId &&
          selectedModelId &&
          !availableModels.some(
            (model) => model.providerId === selectedProviderId && model.value === selectedModelId,
          )
        ) {
          this.controller.composerService.clearSelectedProviderModel()
        }
        return
      } catch {
        if (this.controller.isDisposed || revision !== this.refreshRevision) return
        // Retry once, then retain the last successfully loaded catalog.
      }
    }
  }
}
