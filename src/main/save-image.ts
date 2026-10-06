import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { dialog } from 'electron'

import type { ClaudeSaveImageParams, ClaudeSaveImageResult } from '../shared/rpc'
import { getDialogOwnerWindow } from './dialogs'

const BASE64_DATA_URL_PATTERN = /^data:[^;,]+;base64,(.+)$/

/** Persists a base64 data-URL image through the native save dialog; null path means canceled. */
export async function saveImage({
  dataUrl,
  name,
}: ClaudeSaveImageParams): Promise<ClaudeSaveImageResult> {
  const match = BASE64_DATA_URL_PATTERN.exec(dataUrl)
  if (!match) {
    throw new Error('Unsupported image source')
  }

  const ownerWindow = getDialogOwnerWindow()
  const options = {
    defaultPath: name,
    filters: [
      {
        extensions: [path.extname(name).replace('.', '').toLowerCase() || 'png'],
        name: 'Image',
      },
    ],
  }
  const result = ownerWindow
    ? await dialog.showSaveDialog(ownerWindow, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) {
    return { path: null }
  }

  await writeFile(result.filePath, Buffer.from(match[1], 'base64'))
  return { path: result.filePath }
}
