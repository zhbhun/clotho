import path from 'node:path'
import { existsSync } from 'node:fs'
import { cp } from 'node:fs/promises'

import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

/**
 * Runtime packages that stay outside the Vite main bundle because they ship
 * native binaries or resolve sibling platform packages at runtime. The Forge
 * Vite plugin otherwise only copies the `.vite` output into the app.
 */
const EXTERNAL_RUNTIME_PACKAGES = ['@anthropic-ai/claude-agent-sdk', '@ff-labs/fff-node', 'ffi-rs']

/** Claude Agent SDK ships its CLI binary in per-platform packages. */
function claudeAgentSdkPlatformPackages(platform: string, arch: string) {
  const candidates: string[] = []
  if (platform === 'darwin') candidates.push(`darwin-${arch}`)
  else if (platform === 'win32') candidates.push(`win32-${arch}`)
  else if (platform === 'linux') {
    candidates.push(`linux-${arch}`, `linux-${arch}-musl`)
  }
  return candidates.map((suffix) => `@anthropic-ai/claude-agent-sdk-${suffix}`)
}

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

async function packageAfterCopy(
  _forgeConfig: unknown,
  buildPath: string,
  _electronVersion: string,
  platform: string,
  arch: string,
) {
  const targets = [
    ...EXTERNAL_RUNTIME_PACKAGES,
    ...claudeAgentSdkPlatformPackages(platform, arch),
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
        '{**/*.node,**/node_modules/@anthropic-ai/claude-agent-sdk-*/**,**/node_modules/@ff-labs/fff-bin-*/**,**/node_modules/@yuuang/ffi-rs-*/**}',
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
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
