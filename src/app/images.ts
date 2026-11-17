/** Pictures the app takes; SVG is left out (it can carry scripts and has no pixels to scale). */
export const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

export const IMAGE_ACCEPT = Object.keys(IMAGE_TYPES).map(extension => `.${extension}`).join(',')

/** Longest side kept in the document: sharp on paper at full width, small in the file. */
const MAX_SIDE_PX = 1600
/** The page's writing width at 96 DPI (A4 less the margins); a picture starts no wider. */
const START_WIDTH_PX = 600
const JPEG_QUALITY = 0.85

export function imageTypeOfName(name: string): string | undefined {
  return IMAGE_TYPES[name.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? '']
}

export const isImage = (file: Blob & { name?: string }) => Object.values(IMAGE_TYPES).includes(file.type) || Boolean(file.name && imageTypeOfName(file.name))

export interface PreparedImage {
  readonly src: string
  /** CSS pixels the picture starts at in the document. */
  readonly width: number
}

/**
 * A picture as the document keeps it: turned as the camera meant (EXIF), at most 1600 px on its
 * longest side, as a data address. Photos become JPEG; pictures that may be see-through stay PNG.
 * `toDataURL`, not `toBlob`: an Android WebView holds `toBlob` back for seconds (awPDF, 2026-11-06).
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    const seeThrough = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp'
    if (!seeThrough) {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
    }
    context.drawImage(bitmap, 0, 0, width, height)
    const src = seeThrough ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    return { src, width: Math.min(bitmap.width, START_WIDTH_PX) }
  } finally {
    bitmap.close()
  }
}
