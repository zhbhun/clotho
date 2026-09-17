// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { createShortcutStore, readShortcutOverrides, writeShortcutOverrides } from './shortcuts'

const loggingMock = vi.hoisted(() => ({ warning: vi.fn() }))
const fsMock = vi.hoisted(() => ({
  chmod: vi.fn<(filePath: string, mode: number) => Promise<void>>(),
  mkdir: vi.fn<(directory: string, options: { recursive: boolean }) => Promise<void>>(),
  readFile: vi.fn<(filePath: string, encoding: string) => Promise<string>>(),
  rename: vi.fn<(from: string, to: string) => Promise<void>>(),
  unlink: vi.fn<(filePath: string) => Promise<void>>(),
  writeFile:
    vi.fn<
      (
        filePath: string,
        content: string,
        options: { encoding: string; flag: string; mode: number },
      ) => Promise<void>
    >(),
}))

vi.mock('node:fs', () => ({ promises: fsMock }))
vi.mock('./logging/runtime', () => ({ getLogger: () => loggingMock }))

function missingFileError() {
  return Object.assign(new Error('missing'), { code: 'ENOENT' })
}

describe('shortcut override store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fsMock.chmod.mockResolvedValue(undefined)
    fsMock.mkdir.mockResolvedValue(undefined)
    fsMock.readFile.mockRejectedValue(missingFileError())
    fsMock.rename.mockResolvedValue(undefined)
    fsMock.unlink.mockResolvedValue(undefined)
    fsMock.writeFile.mockResolvedValue(undefined)
  })

  test('preserves structurally valid unknown commands and filters invalid entries', async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        'future.command': [{ modifiers: ['primary', 'shift'], key: 'N' }],
        'partially.valid': [
          { modifiers: ['alt'], key: 'p' },
          { modifiers: ['invalid'], key: 'x' },
          { modifiers: [], key: 'x' },
          { modifiers: ['primary'], key: 'Shift' },
          { modifiers: ['primary'], key: 'CapsLock' },
        ],
        'explicitly.empty': [],
        invalid: 'Primary+K',
      }),
    )

    await expect(readShortcutOverrides('/test/shortcuts.json')).resolves.toEqual({
      'future.command': [{ modifiers: ['primary', 'shift'], key: 'N' }],
      'partially.valid': [{ modifiers: ['alt'], key: 'p' }],
      'explicitly.empty': [],
    })
    expect(loggingMock.warning).toHaveBeenCalled()
  })

  test('preserves a structurally valid unknown __proto__ command', async () => {
    fsMock.readFile.mockResolvedValue('{"__proto__":[{"modifiers":["primary"],"key":"p"}]}')

    const result = await readShortcutOverrides('/test/shortcuts.json')

    expect(Object.hasOwn(result, '__proto__')).toBe(true)
    expect(result['__proto__']).toEqual([{ modifiers: ['primary'], key: 'p' }])
  })

  test('atomically writes private overrides without leaving a temporary file', async () => {
    const file = '/test/.clotho/shortcuts.json'
    const overrides = {
      'workbench.new': [{ modifiers: ['primary'] as const, key: 'n' }],
    }

    await writeShortcutOverrides(overrides, file)

    expect(fsMock.mkdir).toHaveBeenCalledWith('/test/.clotho', { recursive: true })
    const [temporary, content, options] = fsMock.writeFile.mock.calls[0]!
    expect(content).toBe(`${JSON.stringify(overrides, null, 2)}\n`)
    expect(options).toEqual({ encoding: 'utf8', flag: 'wx', mode: 0o600 })
    expect(fsMock.rename).toHaveBeenCalledWith(temporary, file)
    expect(fsMock.chmod).not.toHaveBeenCalled()
    expect(fsMock.unlink).toHaveBeenCalledWith(temporary)
  })

  test('serializes command mutations against the latest successful snapshot', async () => {
    const persist = vi.fn(async () => {})
    const store = createShortcutStore({}, persist)

    await Promise.all([
      store.set('workbench.new', [{ modifiers: ['primary'], key: 'n' }]),
      store.set('settings.search', [{ modifiers: ['primary'], key: 'f' }]),
      store.reset('workbench.new'),
    ])

    expect(store.get()).toEqual({
      'settings.search': [{ modifiers: ['primary'], key: 'f' }],
    })
    expect(persist).toHaveBeenCalledTimes(3)
  })

  test('rolls back a failed mutation and continues processing queued writes', async () => {
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined)
    const store = createShortcutStore({}, persist)

    const rejected = store.set('workbench.new', [{ modifiers: ['primary'], key: 'n' }])
    const queued = store.set('settings.search', [{ modifiers: ['primary'], key: 'f' }])

    await expect(rejected).rejects.toThrow('disk full')
    await expect(queued).resolves.toEqual({
      'settings.search': [{ modifiers: ['primary'], key: 'f' }],
    })
    expect(store.get()).toEqual({
      'settings.search': [{ modifiers: ['primary'], key: 'f' }],
    })
  })
})
