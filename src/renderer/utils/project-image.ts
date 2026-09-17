const PROJECT_ICON_SIZE = 24
const MAX_SOURCE_IMAGE_SIZE = 10 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type ProjectImageErrorCode =
  'processing-unavailable' | 'png-unavailable' | 'too-large' | 'unreadable' | 'unsupported-type'

export class ProjectImageError extends Error {
  readonly code: ProjectImageErrorCode

  constructor(code: ProjectImageErrorCode) {
    super(code)
    this.code = code
    this.name = 'ProjectImageError'
  }
}

type DecodedImage = {
  height: number
  source: CanvasImageSource
  dispose: () => void
  width: number
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(file)
      return {
        height: bitmap.height,
        source: bitmap,
        dispose: () => bitmap.close(),
        width: bitmap.width,
      }
    } catch {
      // WebKit may expose createImageBitmap without decoding files reliably.
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new ProjectImageError('unreadable'))
      nextImage.src = objectUrl
    })
    return {
      height: image.naturalHeight,
      source: image,
      dispose: () => URL.revokeObjectURL(objectUrl),
      width: image.naturalWidth,
    }
  } catch (caught) {
    URL.revokeObjectURL(objectUrl)
    throw caught
  }
}

export async function projectIconDataUrlFromFile(file: File) {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new ProjectImageError('unsupported-type')
  }
  if (file.size > MAX_SOURCE_IMAGE_SIZE) {
    throw new ProjectImageError('too-large')
  }

  const image = await decodeImage(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = PROJECT_ICON_SIZE
    canvas.height = PROJECT_ICON_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new ProjectImageError('processing-unavailable')

    const sourceSize = Math.min(image.width, image.height)
    if (!sourceSize) throw new ProjectImageError('unreadable')
    const sourceX = (image.width - sourceSize) / 2
    const sourceY = (image.height - sourceSize) / 2
    context.drawImage(
      image.source,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      PROJECT_ICON_SIZE,
      PROJECT_ICON_SIZE,
    )
    const dataUrl = canvas.toDataURL('image/png')
    if (!dataUrl.startsWith('data:image/png;base64,')) {
      throw new ProjectImageError('png-unavailable')
    }
    return dataUrl
  } finally {
    image.dispose()
  }
}
