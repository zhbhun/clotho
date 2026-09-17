import os from 'node:os'
import path from 'node:path'

export function clothoDir() {
  return path.join(os.homedir(), '.clotho')
}
