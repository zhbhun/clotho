import os from 'node:os'
import path from 'node:path'

export function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

export function claudeSettingsPath(claudeDir = claudeConfigDir()) {
  return path.join(claudeDir, 'settings.json')
}

export function claudeJsonPath(claudeDir?: string) {
  const customDir = claudeDir ?? process.env.CLAUDE_CONFIG_DIR
  return customDir ? path.join(customDir, '.claude.json') : path.join(os.homedir(), '.claude.json')
}
