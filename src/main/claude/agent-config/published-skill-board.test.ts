// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, it, vi } from 'vitest'

import { getPublishedSkillBoard, parsePublishedBoard } from './published-skill-board'

it('keeps numeric order and per-platform units when ecosystems share a ranking', () => {
  const csv = [
    'rank,skill,platform,source_skillssh,installs_skillssh,downloads_clawhub,downloads_skillhub_cn',
    '10,third party,clawhub,,,123,',
    '2,example,skills.sh,org/example,0,,',
  ].join('\n')
  expect(parsePublishedBoard('top-installs', csv)).toMatchObject([
    { rank: 2, source: 'org/example', metric: 'installs', value: '0', installable: true },
    { rank: 10, source: 'clawhub', metric: 'downloads', value: '123', installable: false },
  ])
})

it('preserves only the affected chart cache after a failed refresh', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'clotho-chart-'))
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response('rank,repo,stars\n1,org/example,10'))
  vi.stubGlobal('fetch', fetchMock)
  try {
    const repos = await getPublishedSkillBoard(dir, 'top-repos', false)
    expect(repos?.rows[0]).toMatchObject({
      url: 'https://github.com/org/example',
      metric: 'stars',
      installable: false,
    })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86400000)
    fetchMock.mockResolvedValueOnce(new Response('unavailable'))
    expect(await getPublishedSkillBoard(dir, 'top-repos', false)).toEqual(repos)
    expect(await getPublishedSkillBoard(dir, 'official-100', true)).toBeNull()
  } finally {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await rm(dir, { force: true, recursive: true })
  }
})
