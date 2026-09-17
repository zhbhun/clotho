import {
  type ModelConfigurationStore,
  createModelConfigurationStore,
} from '../../../stores/model-configuration-store'
import { type SessionController, createSessionController } from './session-controller'
import type { SessionControllerOptions } from './session-types'

type SessionControllerFactory = (options: SessionControllerOptions) => SessionController

export type SessionControllerRegistry = ReturnType<typeof createSessionControllerRegistry>

export function createSessionControllerRegistry(
  createController: SessionControllerFactory = createSessionController,
  modelConfigurationStore: ModelConfigurationStore = createModelConfigurationStore(),
) {
  const controllers = new Map<string, SessionController>()

  return {
    modelConfigurationStore,
    find(sessionId: string) {
      return controllers.get(sessionId)
    },
    get(options: SessionControllerOptions) {
      const existing = controllers.get(options.sessionId)
      if (existing) {
        existing.syncOptions(options)
        return existing
      }
      const controller = createController({ ...options, modelConfigurationStore })
      controllers.set(options.sessionId, controller)
      return controller
    },
    release(sessionId: string) {
      const controller = controllers.get(sessionId)
      if (!controller) return Promise.resolve()
      controllers.delete(sessionId)
      return controller.dispose()
    },
    retain(sessionIds: ReadonlySet<string>) {
      for (const [sessionId, controller] of controllers) {
        if (sessionIds.has(sessionId)) continue
        void controller.dispose()
        controllers.delete(sessionId)
      }
    },
    dispose() {
      for (const controller of controllers.values()) void controller.dispose()
      controllers.clear()
    },
  }
}
