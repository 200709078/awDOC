import type { JSONContent } from '@tiptap/core'
import { FormatError, type DocumentFormat } from './format'

/** Raised when the file layout changes; an older app then says the file is newer instead of breaking it. */
export const AWD_VERSION = 1
const MAGIC = 'awDOC'

/** What is in an `.awd` file: plain UTF-8 JSON, so it can be read and repaired with any text editor. */
export interface AwdFile {
  format: typeof MAGIC
  version: number
  /** The app that wrote it, such as "awDOC 0.0.1"; for finding the cause of a bad file only. */
  app: string
  document: JSONContent
}

/**
 * awDOC's own format: the editor's model as it is, so nothing is lost. A later version may become
 * a ZIP container (pictures as separate files); `read` tells the two apart by the first byte.
 */
export const awdFormat: DocumentFormat = {
  id: 'awd',
  description: 'awDOC belgesi',
  extensions: ['awd'],
  mime: 'application/x-awdoc',
  keepsEverything: true,
  read(bytes) {
    let file: Partial<AwdFile>
    try {
      file = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Partial<AwdFile>
    } catch {
      throw new FormatError('Bu dosya bir awDOC belgesi değil ya da bozulmuş.')
    }
    if (file?.format !== MAGIC || typeof file.version !== 'number' || file.document?.type !== 'doc') {
      throw new FormatError('Bu dosya bir awDOC belgesi değil ya da bozulmuş.')
    }
    if (file.version > AWD_VERSION) {
      throw new FormatError('Bu belge awDOC\'un daha yeni bir sürümüyle kaydedilmiş. Açmak için awDOC\'u güncelleyin.')
    }
    return file.document
  },
  write(document) {
    const file: AwdFile = { format: MAGIC, version: AWD_VERSION, app: `awDOC ${__APP_VERSION__}`, document }
    return new TextEncoder().encode(`${JSON.stringify(file)}\n`)
  },
}
