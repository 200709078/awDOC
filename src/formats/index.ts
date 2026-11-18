import { awdFormat } from './awd'
import { docFormat } from './doc'
import { docxFormat } from './docx'
import type { DocumentFormat } from './format'
import { odtFormat } from './odt'
import { txtFormat } from './txt'

/** Every format, awDOC's own first; `.doc` only opens (through LibreOffice on the desktop). */
export const FORMATS: readonly DocumentFormat[] = [awdFormat, docxFormat, odtFormat, docFormat, txtFormat]

export { docxFormat, odtFormat }

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
