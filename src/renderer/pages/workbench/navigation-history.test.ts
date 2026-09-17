import { describe, expect, it } from 'vitest'

import { type WorkbenchLocation, createWorkbenchNavigationHistory } from './navigation-history'

const HOME = { projectId: null, sessionId: null }
const PROJECT = { projectId: 'project-1', sessionId: null }
const FIRST_SESSION = { projectId: 'project-1', sessionId: 'session-1' }
const SECOND_SESSION = { projectId: 'project-1', sessionId: 'session-2' }
const isAvailable = () => true

describe('workbench navigation history', () => {
  it('provides navigation operations for workbench locations', () => {
    const history = createWorkbenchNavigationHistory({ projectId: null, sessionId: null })

    expect(history).toMatchObject({
      back: expect.any(Function),
      canBack: expect.any(Function),
      canForward: expect.any(Function),
      forward: expect.any(Function),
      visit: expect.any(Function),
    })
  })

  it('moves backward and forward through distinct visited locations', () => {
    const history = createWorkbenchNavigationHistory(HOME)
    history.visit(PROJECT)
    history.visit(PROJECT)
    history.visit(FIRST_SESSION)

    expect(history.canBack(isAvailable)).toBe(true)
    expect(history.back(isAvailable)).toEqual(PROJECT)
    expect(history.back(isAvailable)).toEqual(HOME)
    expect(history.canBack(isAvailable)).toBe(false)
    expect(history.forward(isAvailable)).toEqual(PROJECT)
    expect(history.forward(isAvailable)).toEqual(FIRST_SESSION)
    expect(history.canForward(isAvailable)).toBe(false)
  })

  it('drops the forward branch after visiting a new location', () => {
    const history = createWorkbenchNavigationHistory(HOME)
    history.visit(PROJECT)
    history.visit(FIRST_SESSION)
    expect(history.back(isAvailable)).toEqual(PROJECT)

    history.visit(SECOND_SESSION)

    expect(history.canForward(isAvailable)).toBe(false)
    expect(history.back(isAvailable)).toEqual(PROJECT)
  })

  it('skips locations that no longer exist', () => {
    const history = createWorkbenchNavigationHistory(HOME)
    history.visit(PROJECT)
    history.visit(FIRST_SESSION)
    history.visit(SECOND_SESSION)

    const existingSessionIds = new Set(['session-2'])
    const locationExists = (location: WorkbenchLocation) =>
      !location.sessionId || existingSessionIds.has(location.sessionId)

    expect(history.back(locationExists)).toEqual(PROJECT)
    expect(history.forward(locationExists)).toEqual(SECOND_SESSION)
  })
})
