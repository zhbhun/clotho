// @vitest-environment node
import { promises as fs } from 'node:fs'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dropTrailingTurn, purgeDeadPairs } from './transcript'

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
    readdir: vi.fn(),
  },
}))
vi.mock('./workspace', () => ({
  claudeDir: () => '/Users/me/.claude',
  projectPathForId: async () => '/Users/me/project',
}))
vi.mock('../logging/runtime', () => ({ getLogger: () => ({ info: vi.fn() }) }))

const previous = [
  { type: 'user', uuid: 'first-user', message: { content: 'hello11?' } },
  { type: 'assistant', uuid: 'first-reply', message: { content: 'Hello!' } },
]
const cancelled = [
  { type: 'user', uuid: 'cancelled-user', message: { content: 'hello22?' } },
  { type: 'user', uuid: 'interrupt', message: { content: '[Request interrupted by user]' } },
  { type: 'assistant', message: { model: '<synthetic>', content: 'No response requested.' } },
]
const params = {
  projectId: 'project-1',
  sessionId: 'session-1',
  userMessageUuid: 'cancelled-user',
}
const jsonl = (entries: unknown[]) =>
  `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`

describe('recalled transcript tail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes only the cancelled turn and preserves the existing session', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(jsonl([...previous, ...cancelled]))

    await expect(dropTrailingTurn(params)).resolves.toEqual({
      dropped: true,
      removedSession: false,
    })
    expect(fs.writeFile).toHaveBeenCalledWith(expect.any(String), jsonl(previous), 'utf8')
    expect(fs.rm).not.toHaveBeenCalled()
  })

  it('removes the session file when the cancelled turn was the first conversation', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(jsonl([{ type: 'summary' }, ...cancelled]))

    await expect(dropTrailingTurn(params)).resolves.toEqual({ dropped: true, removedSession: true })
    expect(fs.rm).toHaveBeenCalledWith(expect.any(String), { force: true })
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('allows fresh creation with the same ID when cancellation preceded the first log write', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(
      Object.assign(new Error('Missing transcript'), { code: 'ENOENT' }),
    )
    await expect(dropTrailingTurn(params)).resolves.toEqual({
      dropped: false,
      removedSession: true,
    })
    expect(fs.rm).not.toHaveBeenCalled()
  })

  it.each(['', jsonl([{ type: 'summary' }])])(
    'removes a non-conversational file before recreating the session',
    async (content) => {
      vi.mocked(fs.readFile).mockResolvedValue(content)
      await expect(dropTrailingTurn(params)).resolves.toEqual({
        dropped: true,
        removedSession: true,
      })
      expect(fs.rm).toHaveBeenCalledWith(expect.any(String), { force: true })
    },
  )

  it('does not treat unreadable history as a missing session', async () => {
    const error = Object.assign(new Error('Permission denied'), { code: 'EACCES' })
    vi.mocked(fs.readFile).mockRejectedValue(error)
    await expect(dropTrailingTurn(params)).rejects.toBe(error)
    expect(fs.rm).not.toHaveBeenCalled()
  })

  it('does not remove newer conversation after a cancellation marker', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      jsonl([
        ...previous,
        ...cancelled,
        { type: 'user', uuid: 'newer', message: { content: 'hello33?' } },
      ]),
    )

    await expect(dropTrailingTurn(params)).resolves.toEqual({
      dropped: false,
      removedSession: false,
    })
    expect(fs.rm).not.toHaveBeenCalled()
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('drops later turns when the caller is a historical edit', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      jsonl([
        ...previous,
        ...cancelled,
        { type: 'user', uuid: 'newer', message: { content: 'hello33?' } },
        {
          type: 'assistant',
          uuid: 'newer-reply',
          message: { model: 'claude-sonnet', content: 'hi' },
        },
      ]),
    )

    await expect(dropTrailingTurn({ ...params, allowLaterConversation: true })).resolves.toEqual({
      dropped: true,
      removedSession: false,
    })
    expect(fs.writeFile).toHaveBeenCalledWith(expect.any(String), jsonl(previous), 'utf8')
    expect(fs.rm).not.toHaveBeenCalled()
  })
})

const turn = (n: number) => [
  { type: 'user', uuid: `user-${n}`, message: { content: `q${n}` } },
  { type: 'assistant', uuid: `reply-${n}`, message: { model: 'claude-sonnet', content: `a${n}` } },
]
const deadTurn = (n: number) => [
  { type: 'user', uuid: `user-${n}`, message: { content: `q${n}` } },
  { type: 'user', message: { content: '[Request interrupted by user]' } },
  { type: 'assistant', message: { model: '<synthetic>', content: 'No response requested.' } },
]
const partialTurn = (n: number) => [
  { type: 'user', uuid: `user-${n}`, message: { content: `q${n}` } },
  {
    type: 'assistant',
    uuid: `reply-${n}`,
    message: { model: 'claude-sonnet', content: 'partial' },
  },
  { type: 'user', message: { content: '[Request interrupted by user]' } },
]
const purgeParams = { projectId: 'project-1', sessionId: 'session-1' }

describe('dead pair purge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('purges a mid-history dead turn and keeps replied turns', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(jsonl([...turn(1), ...deadTurn(2), ...turn(3)]))

    await expect(purgeDeadPairs(purgeParams)).resolves.toEqual({
      removed: 1,
      removedSession: false,
    })
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      jsonl([...turn(1), ...turn(3)]),
      'utf8',
    )
    expect(fs.rm).not.toHaveBeenCalled()
  })

  it('keeps an interrupted turn that streamed a partial reply', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(jsonl([...turn(1), ...partialTurn(2)]))

    await expect(purgeDeadPairs(purgeParams)).resolves.toEqual({ removed: 0 })
    expect(fs.writeFile).not.toHaveBeenCalled()
    expect(fs.rm).not.toHaveBeenCalled()
  })

  it('keeps normal adjacent turns untouched', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(jsonl([...turn(1), ...turn(2)]))

    await expect(purgeDeadPairs(purgeParams)).resolves.toEqual({ removed: 0 })
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('removes the session file when every turn is dead', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(jsonl([{ type: 'summary' }, ...deadTurn(1)]))

    await expect(purgeDeadPairs(purgeParams)).resolves.toEqual({
      removed: 1,
      removedSession: true,
    })
    expect(fs.rm).toHaveBeenCalledWith(expect.any(String), { force: true })
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('treats sidechain entries as part of the enclosing turn', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      jsonl([
        {
          type: 'user',
          uuid: 'user-1',
          message: { content: 'q1' },
        },
        {
          type: 'user',
          isSidechain: true,
          message: { content: '[Request interrupted by user]' },
        },
        { type: 'assistant', message: { model: '<synthetic>', content: 'No response requested.' } },
        ...turn(2),
      ]),
    )

    await expect(purgeDeadPairs(purgeParams)).resolves.toEqual({
      removed: 1,
      removedSession: false,
    })
    expect(fs.writeFile).toHaveBeenCalledWith(expect.any(String), jsonl([...turn(2)]), 'utf8')
  })

  it('treats a missing transcript as nothing to purge', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(
      Object.assign(new Error('Missing transcript'), { code: 'ENOENT' }),
    )
    await expect(purgeDeadPairs(purgeParams)).resolves.toEqual({ removed: 0 })
  })
})
