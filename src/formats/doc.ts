import { readDocx } from './docx'
import { FormatError, type DocumentFormat } from './format'

/** Turns an old Word file into a `.docx` (LibreOffice on the desktop); null when it cannot. */
type Converter = (data: Uint8Array) => Promise<Uint8Array | null>

let convert: Converter | null = null

/** Set by the desktop platform when its shell offers LibreOffice. */
export function setOldWordConverter(converter: Converter | null): void {
  convert = converter
}

/**
 * Old Word documents (`.doc`, Word 97–2003). No browser reads them reliably, so the desktop app
 * has LibreOffice turn them into `.docx` (user's decision, 2026-11-18); elsewhere the user is told
 * what to do. They are never written: Kaydet saves an awDOC file, Farklı Kaydet offers Word too.
 */
export const docFormat: DocumentFormat = {
  id: 'doc',
  description: 'Eski Word belgesi',
  extensions: ['doc'],
  mime: 'application/msword',
  keepsEverything: false,
  async read(bytes) {
    const cannot = 'Eski Word belgeleri (.doc) bilgisayardaki awDOC uygulamasında, LibreOffice kuruluysa açılır. Belgeyi Word ya da LibreOffice ile .docx olarak kaydedip açın.'
    if (!convert) throw new FormatError(cannot)
    let docx: Uint8Array | null
    try {
      docx = await convert(bytes)
    } catch (error) {
      console.error(error)
      throw new FormatError('LibreOffice bu eski Word belgesini çeviremedi.')
    }
    if (!docx) throw new FormatError(cannot)
    return readDocx(docx)
  },
}
