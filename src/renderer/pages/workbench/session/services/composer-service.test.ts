import { describe, expect, it } from 'vitest'

import { createSessionPersistence } from '../../services/session-persistence'
import { createSessionController } from '../session-controller'

const attachment = { name: 'diagram.png', path: '/project/diagram.png' }

describe('composer attachments', () => {
  it('preserves attachments independently of prompt edits and restores them with the draft', async () => {
    const persistence = createSessionPersistence(undefined)
    const options = {
      sessionId: 'attachment-draft',
      claudeSessionId: null,
      projectId: null,
      projectPath: null,
      isHomeMode: true,
      isMockProject: false,
      persistence,
    }
    const controller = createSessionController(options)
    controller.setAttachments([attachment])
    controller.setPrompt('Look at @src/app.tsx')
    await persistence.flush()

    expect(controller.composerService.snapshot()).toMatchObject({
      prompt: 'Look at @src/app.tsx',
      attachments: [attachment],
    })
    const restored = createSessionController(options)
    expect(restored.composerStore.getState().attachments).toEqual([attachment])
    restored.resetPreferences()
    expect(restored.composerStore.getState().attachments).toEqual([])
    controller.dispose()
    restored.dispose()
  })
})
