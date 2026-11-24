import { existsSync } from 'node:fs'
import { cp, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { VitePlugin } from '@electron-forge/plugin-vite'
import type { ForgeConfig } from '@electron-forge/shared-types'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

/**
 * Runtime packages that stay outside the Vite main bundle because they ship
 * native binaries or resolve sibling platform packages at runtime. The Forge
 * Vite plugin otherwise only copies the `.vite` output into the app.
 */
const EXTERNAL_RUNTIME_PACKAGES = ['@anthropic-ai/claude-agent-sdk', '@ff-labs/fff-node', 'ffi-rs']

/** fff ships its dylib/dll/so in per-platform packages (see @ff-labs/fff-node). */
function fffBinPackages(platform: string, arch: string) {
  const candidates: string[] = []
  if (platform === 'darwin') candidates.push(`darwin-${arch}`)
  else if (platform === 'win32') candidates.push(`win32-${arch}`)
  else if (platform === 'linux') {
    candidates.push(`linux-${arch}-gnu`, `linux-${arch}-musl`)
  }
  return candidates.map((suffix) => `@ff-labs/fff-bin-${suffix}`)
}

/** ffi-rs resolves its NAPI binding from @yuuang scope packages. */
function ffiRsBindingPackages(platform: string, arch: string) {
  const candidates: string[] = []
  if (platform === 'darwin') candidates.push('darwin-universal', `darwin-${arch}`)
  else if (platform === 'win32') candidates.push(`win32-${arch}-msvc`)
  else if (platform === 'linux') {
    candidates.push(`linux-${arch}-gnu`, `linux-${arch}-musl`)
  }
  return candidates.map((suffix) => `@yuuang/ffi-rs-${suffix}`)
}

/** Keep the CLI's ESM entry and its npm dependency layout available on disk. */
async function copySkillsRuntime(buildPath: string) {
  const copied = new Set<string>()
  async function copyPackage(name: string, parentManifest: string) {
    const paths = createRequire(parentManifest).resolve.paths(name) ?? []
    const source = paths
      .map((base) => path.join(base, name))
      .find((dir) => existsSync(path.join(dir, 'package.json')))
    if (!source) throw new Error(`Missing skills runtime dependency: ${name}`)
    if (copied.has(source)) return
    copied.add(source)
    const manifest = path.join(source, 'package.json')
    const { dependencies = {} } = JSON.parse(await readFile(manifest, 'utf8'))
    const target = path.join(buildPath, 'skill-runtime', path.relative(__dirname, source))
    await cp(source, target, {
      recursive: true,
      filter: (file) => path.basename(file) !== 'node_modules',
    })
    for (const dependency of Object.keys(dependencies)) await copyPackage(dependency, manifest)
  }
  await copyPackage('skills', path.join(__dirname, 'package.json'))
  await cp(
    path.join(__dirname, 'src/main/claude/agent-config/skills-runner.cjs'),
    path.join(buildPath, 'skill-runtime/skills-runner.cjs'),
  )
}

async function packageAfterCopy(
  _forgeConfig: unknown,
  buildPath: string,
  _electronVersion: string,
  platform: string,
  arch: string,
) {
  await copySkillsRuntime(buildPath)
  const targets = [
    ...EXTERNAL_RUNTIME_PACKAGES,
    ...fffBinPackages(platform, arch),
    ...ffiRsBindingPackages(platform, arch),
  ]

  for (const name of targets) {
    const source = path.join(__dirname, 'node_modules', name)
    if (!existsSync(source)) continue
    await cp(source, path.join(buildPath, 'node_modules', name), {
      recursive: true,
      dereference: true,
    })
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    icon: path.resolve(__dirname, 'icons/icon'),
    // Binaries and shared libraries must live on disk (outside the archive)
    // to be spawned or dlopen'd by the OS. Patterns match against absolute
    // paths, so they need the leading `**/`.
    asar: {
      unpack:
        '{**/skill-runtime/**,**/*.node,**/node_modules/@ff-labs/fff-bin-*/**,**/node_modules/@yuuang/ffi-rs-*/**}',
    },
  },
  rebuildConfig: {},
  makers: [new MakerSquirrel({}), new MakerZIP({}, ['darwin']), new MakerRpm({}), new MakerDeb({})],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    packageAfterCopy,
  },
}

export default config
