// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

import { expect, it } from 'vitest'

// A compressed entry spans multiple reads, matching Electron's runtime ZIP entries.
function runtimeArchive() {
  const content = Buffer.alloc(256 * 1024)
  let seed = 0x12345678
  for (let index = 0; index < content.length; index += 1) {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    content[index] = seed & 255
  }
  const compressed = deflateRawSync(content)
  const name = Buffer.from('Electron.app/Contents/MacOS/Electron')
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(8, 8)
  header.writeUInt32LE(crc32(content), 14)
  header.writeUInt32LE(compressed.length, 18)
  header.writeUInt32LE(content.length, 22)
  header.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(crc32(content), 16)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(content.length, 24)
  central.writeUInt16LE(name.length, 28)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12)
  end.writeUInt32LE(header.length + name.length + compressed.length, 16)
  return { archive: Buffer.concat([header, name, compressed, central, name, end]), content }
}

it('finishes runtime ZIP extraction instead of silently exiting on the build Node version', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'clotho-package-extract-'))
  try {
    const archive = path.join(directory, 'runtime.zip')
    const target = path.join(directory, 'runtime')
    const fixture = runtimeArchive()
    await writeFile(archive, fixture.archive)
    const extract = createRequire(import.meta.url).resolve('extract-zip')
    const code = `require(${JSON.stringify(extract)})(process.argv[1], { dir: process.argv[2] }).then(() => process.stdout.write('complete'), error => { console.error(error); process.exitCode = 1 })`
    // Running in a child is essential: this bug exits 0 with an unresolved promise.
    const result = spawnSync(process.execPath, ['-e', code, archive, target], {
      encoding: 'utf8',
      timeout: 10_000,
    })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe('complete')
    expect(await readFile(path.join(target, 'Electron.app/Contents/MacOS/Electron'))).toEqual(
      fixture.content,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
