// @vitest-environment node
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { openLink, resolveLinkTarget } from './open-link'
import type { OpenLinkDeps } from './open-link'

const PROJECT = path.resolve('/workspace', 'artflo-web')

function fakeDeps() {
  return {
    openExternal: vi.fn(async () => undefined),
    showItemInFolder: vi.fn(),
    pathExists: vi.fn(async (filePath: string) => !filePath.includes('missing')),
  } satisfies OpenLinkDeps
}

describe('resolveLinkTarget', () => {
  it('routes web and mail links to the operating system', () => {
    expect(resolveLinkTarget('https://example.com/page', PROJECT)).toEqual({
      kind: 'external',
      url: 'https://example.com/page',
    })
    expect(resolveLinkTarget('mailto:someone@example.com', PROJECT)).toEqual({
      kind: 'external',
      url: 'mailto:someone@example.com',
    })
  })

  it('resolves relative paths against the project root', () => {
    expect(resolveLinkTarget('src/foo.ts', PROJECT)).toEqual({
      kind: 'file',
      filePath: path.join(PROJECT, 'src/foo.ts'),
    })
    expect(resolveLinkTarget('./packages/./a/../b.ts', PROJECT)).toEqual({
      kind: 'file',
      filePath: path.join(PROJECT, 'packages/b.ts'),
    })
  })

  it('ignores escapes outside the project and bare fragments', () => {
    expect(resolveLinkTarget('../escape.ts', PROJECT)).toEqual({ kind: 'ignore' })
    expect(resolveLinkTarget('/etc/passwd', PROJECT)).toEqual({ kind: 'ignore' })
    expect(resolveLinkTarget('file:///etc/passwd', PROJECT)).toEqual({ kind: 'ignore' })
    expect(resolveLinkTarget('#section', PROJECT)).toEqual({ kind: 'ignore' })
    expect(resolveLinkTarget('src/foo.ts', '')).toEqual({ kind: 'ignore' })
  })

  it('keeps file links that stay inside the project', () => {
    expect(resolveLinkTarget('file:///workspace/artflo-web/src/foo.ts', PROJECT)).toEqual({
      kind: 'file',
      filePath: path.join(PROJECT, 'src/foo.ts'),
    })
  })

  it('ignores unknown schemes', () => {
    expect(resolveLinkTarget('vscode://file/whatever', PROJECT)).toEqual({ kind: 'ignore' })
  })
})

describe('openLink', () => {
  it('hands external urls to the system handler', async () => {
    const deps = fakeDeps()

    await expect(
      openLink({ href: 'https://example.com', projectPath: PROJECT }, deps),
    ).resolves.toEqual({ opened: true })
    expect(deps.openExternal).toHaveBeenCalledWith('https://example.com')
    expect(deps.showItemInFolder).not.toHaveBeenCalled()
  })

  it('does nothing when the linked file does not exist', async () => {
    const deps = fakeDeps()

    await expect(openLink({ href: 'missing/foo.ts', projectPath: PROJECT }, deps)).resolves.toEqual(
      { opened: false },
    )
    expect(deps.showItemInFolder).not.toHaveBeenCalled()
  })

  it('reveals existing files in the file manager', async () => {
    const deps = fakeDeps()

    await expect(openLink({ href: 'src/foo.ts', projectPath: PROJECT }, deps)).resolves.toEqual({
      opened: true,
    })
    expect(deps.showItemInFolder).toHaveBeenCalledWith(path.join(PROJECT, 'src/foo.ts'))
  })

  it('opens nothing for ignored links', async () => {
    const deps = fakeDeps()

    await expect(openLink({ href: '#top', projectPath: PROJECT }, deps)).resolves.toEqual({
      opened: false,
    })
    expect(deps.openExternal).not.toHaveBeenCalled()
    expect(deps.showItemInFolder).not.toHaveBeenCalled()
  })
})
