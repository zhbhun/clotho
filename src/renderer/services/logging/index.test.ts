import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const desktop = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => false),
  sendMessageToDesktop: vi.fn(),
}))

vi.mock('../desktop/client', () => desktop)

describe('development console logging', () => {
  beforeEach(() => {
    desktop.isDesktopRuntime.mockReturnValue(false)
    desktop.sendMessageToDesktop.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('omits arbitrary webview messages, context, and error details', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { getLogger } = await import('./index')
    const caught = Object.assign(new Error('secret prompt for private-model-id'), {
      name: 'private-model-id',
    })
    caught.stack =
      'Error: secret prompt for private-model-id\n    at private-model-id (/Volumes/Private Project/index.ts:4:2)'

    getLogger('app').error(
      'webview.unhandled_error',
      'secret prompt and private-model-id at /Volumes/Private Project/index.ts',
      {
        context: { line: 4, privateValue: 'private-model-id' },
        error: caught,
      },
    )

    expect(write).toHaveBeenCalledWith('An unhandled webview error occurred', {
      error: { message: 'Error details omitted', name: 'Error' },
    })
    expect(JSON.stringify(write.mock.calls)).not.toMatch(
      /private-model-id|secret prompt|\/Volumes\/Private Project/,
    )
  })

  test('does not print logging transport error details', async () => {
    desktop.isDesktopRuntime.mockReturnValue(true)
    desktop.sendMessageToDesktop.mockImplementationOnce(() => {
      throw new Error('private-model-id at /Volumes/Private Project/index.ts')
    })
    const write = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { getLogger, webviewLogging } = await import('./index')

    getLogger('app').error('webview.unhandled_error', 'Unhandled error', {
      error: new Error('private'),
    })

    expect(write).toHaveBeenCalledWith('Unable to send webview logs to Clotho')
    expect(JSON.stringify(write.mock.calls)).not.toMatch(/private-model-id|\/Volumes\/Private/)
    webviewLogging.flush()
  })

  test('keeps safe missing-property diagnostics in development', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { getLogger } = await import('./index')

    getLogger('render').error('render.failed', 'Render failed', {
      error: new TypeError("Cannot read properties of undefined (reading 'map')"),
    })

    expect(write).toHaveBeenCalledWith('Webview rendering failed', {
      error: {
        message: "Cannot read properties of undefined (reading 'map')",
        name: 'TypeError',
      },
    })
  })

  test('keeps Safari missing-object diagnostics in development', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { getLogger } = await import('./index')

    getLogger('render').error('render.failed', 'Render failed', {
      error: new TypeError("undefined is not an object (evaluating 'prompt.trim')"),
    })

    expect(write).toHaveBeenCalledWith('Webview rendering failed', {
      error: {
        message: "undefined is not an object (evaluating 'prompt.trim')",
        name: 'TypeError',
      },
    })
  })
})
