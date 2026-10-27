import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyLoginShellEnv,
  buildShellBootstrapPath,
  captureLoginShellEnv,
  extractCapturedEnvSnapshotForTest,
  loginShellEnvOnce,
  resetLoginShellEnvForTest,
} from './shell-env'

const ORIGINAL_PLATFORM = process.platform
const ORIGINAL_ENV = process.env

function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform })
}

type ExecutorCall = {
  shellPath: string
  shellArgs: string[]
  env: NodeJS.ProcessEnv
}

/** Resolve with the given env payload written in the null-separated wire format. */
function fakeExecutor(payload: Record<string, string>, fail = false) {
  const calls: ExecutorCall[] = []
  const executor = vi.fn(
    (
      shellPath: string,
      shellArgs: string[],
      options: { env: NodeJS.ProcessEnv; onOutput: (chunk: string) => void },
    ) => {
      calls.push({ shellPath, shellArgs, env: options.env })
      if (fail) return Promise.reject(new Error('spawn failed'))
      options.onOutput('noise before\n')
      options.onOutput('__CLOTHO_LOGIN_ENV_START__\0')
      options.onOutput(
        Object.entries(payload)
          .map(([key, value]) => `${key}=${value}`)
          .join('\0') + '\0',
      )
      options.onOutput('__CLOTHO_LOGIN_ENV_END__\0')
      options.onOutput('noise after\n')
      return Promise.resolve()
    },
  )
  return { calls, executor }
}

describe('shell-env', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    resetLoginShellEnvForTest()
  })
  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM)
    process.env = ORIGINAL_ENV
    vi.restoreAllMocks()
  })

  describe('captureLoginShellEnv', () => {
    it('extracts the env between markers and drops surrounding noise', async () => {
      setPlatform('darwin')
      const { executor } = fakeExecutor({ PATH: '/opt/homebrew/bin:/usr/bin', NVM_DIR: '/nvm' })
      const snapshot = await captureLoginShellEnv({
        baseEnv: { SHELL: '/bin/zsh' },
        executeShell: executor,
      })
      expect(snapshot).toEqual({ PATH: '/opt/homebrew/bin:/usr/bin', NVM_DIR: '/nvm' })
    })

    it('uses interactive login args for zsh and login args for sh', async () => {
      setPlatform('darwin')
      const zsh = fakeExecutor({ PATH: '/x' })
      await captureLoginShellEnv({ baseEnv: { SHELL: '/bin/zsh' }, executeShell: zsh.executor })
      expect(zsh.calls[0]?.shellArgs[0]).toBe('-ilc')

      const sh = fakeExecutor({ PATH: '/x' })
      await captureLoginShellEnv({ baseEnv: { SHELL: '/bin/sh' }, executeShell: sh.executor })
      expect(sh.calls[0]?.shellArgs[0]).toBe('-lc')
    })

    it('gives the probing shell a bootstrap PATH and suppressed terminal vars', async () => {
      setPlatform('darwin')
      const { calls, executor } = fakeExecutor({ PATH: '/x' })
      await captureLoginShellEnv({
        baseEnv: { SHELL: '/bin/zsh', PATH: '/strictly-minimal' },
        executeShell: executor,
      })
      expect(calls[0]?.env.PATH).toContain('/usr/bin')
      expect(calls[0]?.env.PATH).toContain('/strictly-minimal')
      expect(calls[0]?.env.TERM).toBe('dumb')
      expect(calls[0]?.env.CI).toBe('1')
    })

    it('returns null when the shell fails and when no shell exists', async () => {
      setPlatform('darwin')
      const failing = fakeExecutor({ PATH: '/x' }, true)
      await expect(
        captureLoginShellEnv({ baseEnv: { SHELL: '/bin/zsh' }, executeShell: failing.executor }),
      ).resolves.toBeNull()

      await expect(
        captureLoginShellEnv({ baseEnv: {}, executeShell: fakeExecutor({}).executor }),
      ).resolves.toBeNull()
    })

    it('returns null on windows without spawning a shell', async () => {
      setPlatform('win32')
      const { executor } = fakeExecutor({ PATH: '/x' })
      await expect(
        captureLoginShellEnv({ baseEnv: { SHELL: '/bin/zsh' }, executeShell: executor }),
      ).resolves.toBeNull()
      expect(executor).not.toHaveBeenCalled()
    })
  })

  describe('applyLoginShellEnv', () => {
    it('replaces PATH and only fills missing keys', async () => {
      setPlatform('darwin')
      process.env.CLAUDE_CODE_ENTRYPOINT = 'clotho'
      process.env.PATH = '/usr/bin:/bin'
      const { executor } = fakeExecutor({
        PATH: '/opt/homebrew/bin:/usr/bin',
        JAVA_HOME: '/Library/Java/Home',
        CLAUDE_CODE_ENTRYPOINT: '/evil/override',
      })
      const applied = await applyLoginShellEnv(executor)
      expect(applied).toBe(true)
      expect(process.env.PATH).toBe('/opt/homebrew/bin:/usr/bin')
      expect(process.env.JAVA_HOME).toBe('/Library/Java/Home')
      expect(process.env.CLAUDE_CODE_ENTRYPOINT).toBe('clotho')
    })

    it('returns false on capture failure and leaves process.env untouched', async () => {
      setPlatform('darwin')
      process.env.PATH = '/usr/bin:/bin'
      const failing = fakeExecutor({}, true)
      const applied = await applyLoginShellEnv(failing.executor)
      expect(applied).toBe(false)
      expect(process.env.PATH).toBe('/usr/bin:/bin')
    })
  })

  describe('loginShellEnvOnce', () => {
    it('captures only once per process', async () => {
      setPlatform('darwin')
      const { executor } = fakeExecutor({ PATH: '/x' })
      const first = await loginShellEnvOnce(executor)
      const second = await loginShellEnvOnce(executor)
      expect(executor).toHaveBeenCalledTimes(1)
      expect(first).toEqual(second)
    })
  })

  describe('buildShellBootstrapPath', () => {
    it('prepends platform bootstrap entries and deduplicates', () => {
      setPlatform('darwin')
      const path = buildShellBootstrapPath('/opt/homebrew/bin:/usr/bin')
      expect(path.startsWith('/usr/local/bin:')).toBe(true)
      expect(path.split(':').filter((entry) => entry === '/usr/bin')).toHaveLength(1)
    })

    it('keeps the current PATH entries', () => {
      setPlatform('darwin')
      expect(buildShellBootstrapPath('/custom/bin')).toContain('/custom/bin')
    })
  })

  describe('marker parsing', () => {
    it('rejects output without both markers and empty payloads', () => {
      expect(extractCapturedEnvSnapshotForTest('no markers here')).toBeNull()
      expect(extractCapturedEnvSnapshotForTest('prefix\0__CLOTHO_LOGIN_ENV_END__\0')).toBeNull()
      expect(
        extractCapturedEnvSnapshotForTest(
          '__CLOTHO_LOGIN_ENV_START__\0\0__CLOTHO_LOGIN_ENV_END__\0',
        ),
      ).toBeNull()
    })

    it('skips entries without a valid key', () => {
      expect(
        extractCapturedEnvSnapshotForTest(
          '__CLOTHO_LOGIN_ENV_START__\0novalue\0=emptykey\0A=1\0__CLOTHO_LOGIN_ENV_END__\0',
        ),
      ).toEqual({ A: '1' })
    })

    it('keeps multi-line values intact', () => {
      expect(
        extractCapturedEnvSnapshotForTest(
          '__CLOTHO_LOGIN_ENV_START__\0MULTI=one\ntwo\nthree\0A=1\0__CLOTHO_LOGIN_ENV_END__\0',
        ),
      ).toEqual({ MULTI: 'one\ntwo\nthree', A: '1' })
    })
  })
})
