import { useCallback } from 'react'

import { claude } from '../../../services/claude/claude'
import type { SessionControllerRegistry } from '../session/session-controller-registry'
import type { SessionError } from '../session/stores/runtime-store'
import { useProjects } from './use-projects'

const ignoreSessionError = () => {}

export function useWorkbench(
  onSessionError: (sessionId: string, error: SessionError | null) => void = ignoreSessionError,
  controllerRegistry?: Pick<SessionControllerRegistry, 'find' | 'release'>,
) {
  const projects = useProjects(onSessionError, controllerRegistry)
  const selectPromptFiles = useCallback(
    async (startingFolder?: string) =>
      claude.selectFiles({ allowsMultipleSelection: true, startingFolder }),
    [],
  )

  return {
    ...projects,
    selectPromptFiles,
  }
}
