import { parseSkillDocument } from './skills'

export async function readMarketSkill(source: string, name: string) {
  if (!/^[\w-]+\/[\w.-]+$/.test(source) || source.endsWith('/..') || source.endsWith('/.')) {
    throw new Error('No source repository for this skill')
  }
  const signal = AbortSignal.timeout(15000)
  const response = await fetch(
    `https://api.github.com/repos/${source}/git/trees/HEAD?recursive=1`,
    { signal },
  )
  if (!response.ok) throw new Error('Could not read skill repository')
  const { tree } = (await response.json()) as {
    tree: { path: string; type: string; sha: string }[]
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9._]+/g, '-')
  const paths = tree.filter(
    ({ path, type }) => type === 'blob' && (path === 'SKILL.md' || path.endsWith('/SKILL.md')),
  )
  const matches = paths.filter(({ path }) => path.split('/').at(-2)?.toLowerCase() === slug)
  for (const { path, sha } of [...matches, ...paths.filter(({ path }) => path === 'SKILL.md')]) {
    const raw = await fetch(`https://api.github.com/repos/${source}/git/blobs/${sha}`, {
      signal,
      headers: { Accept: 'application/vnd.github.raw+json' },
    })
    if (!raw.ok) continue
    const document = parseSkillDocument(await raw.text())
    if (
      document.metadata.name?.toLowerCase() === name.toLowerCase() ||
      (!document.metadata.name &&
        (path !== 'SKILL.md' || source.split('/')[1].toLowerCase() === slug))
    )
      return document
  }
  throw new Error('Skill document unavailable')
}
