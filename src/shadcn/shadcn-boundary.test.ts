import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { expect, it } from 'vitest'

const SHADCN_ROOT = path.resolve(process.cwd(), 'src/shadcn')

it('keeps shadcn sources independent from business modules', async () => {
  const entries = await readdir(SHADCN_ROOT, { recursive: true })
  const sourceFiles = entries.filter(
    (entry) => /\.[cm]?tsx?$/.test(entry) && !entry.includes('.test.'),
  )
  const violations: string[] = []

  for (const relativePath of sourceFiles) {
    const source = await readFile(path.join(SHADCN_ROOT, relativePath), 'utf8')
    const aliasImports = source.matchAll(/from\s+['"](@\/[^'"]+)['"]/g)

    for (const match of aliasImports) {
      const importedPath = match[1]
      if (!importedPath.startsWith('@/shadcn/')) {
        violations.push(`${relativePath}: ${importedPath}`)
      }
    }
  }

  expect(violations).toEqual([])
})
