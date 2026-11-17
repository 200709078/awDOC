import { awdFormat } from './awd'
import type { DocumentFormat } from './format'
import { txtFormat } from './txt'

/**
 * Every format, awDOC's own first. Planned (docs/yol-haritasi.md, aşama 5): `.docx`, `.odt`, and
 * `.doc` through LibreOffice on the desktop.
 */
export const FORMATS: readonly DocumentFormat[] = [awdFormat, txtFormat]

export const NATIVE_FORMAT = awdFormat

export const openableFormats = (): DocumentFormat[] => FORMATS.filter(format => format.read)

export function formatOfName(name: string): DocumentFormat | undefined {
  const extension = name.toLowerCase().match(/\.([^.]+)$/)?.[1]
  return extension ? FORMATS.find(format => format.extensions.includes(extension)) : undefined
}

/** For an `<input type=file>`: every extension the app opens. */
export const acceptList = (): string => openableFormats().flatMap(format => format.extensions.map(extension => `.${extension}`)).join(',')

/** The name a file of `format` would get, keeping the document's own name. */
export function nameWithExtension(name: string, format: DocumentFormat): string {
  return `${name.replace(/\.[^.]+$/, '')}.${format.extensions[0]}`
}
