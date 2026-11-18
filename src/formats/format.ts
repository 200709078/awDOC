import type { JSONContent } from '@tiptap/core'

/**
 * One kind of file the app reads or writes. The document itself is always the editor's own model
 * (ProseMirror JSON); a format only turns bytes into that model and back. A new kind (`.docx`,
 * `.odt`, `.doc`) is a new file in this folder plus a line in `formats/index.ts`: the editor, the
 * menus and the platforms take their lists from there and need no change.
 */
export interface DocumentFormat {
  /** Unique, such as `awd`. */
  readonly id: string
  /** Shown in pickers and save dialogs, such as "awDOC belgesi". */
  readonly description: string
  /** Lower case, without the dot; the first is the one a saved file gets. */
  readonly extensions: readonly string[]
  readonly mime: string
  /** Absent when the app cannot open this kind. */
  read?(bytes: Uint8Array): Promise<JSONContent> | JSONContent
  /** Absent when the app cannot save this kind. */
  write?(document: JSONContent): Promise<Uint8Array> | Uint8Array
  /**
   * False when saving to it loses something the editor has (plain text drops all styling), so
   * the app keeps asking where to save instead of writing over the file it came from. A function
   * when it depends on the document (Word keeps everything but the teacher's blocks).
   */
  readonly keepsEverything: boolean | ((document: JSONContent) => boolean)
}

/** The file could not be read as the format it claims to be. */
export class FormatError extends Error {}

/** Whether `format` keeps all of `document`. */
export function keepsAll(format: DocumentFormat, document: JSONContent): boolean {
  return typeof format.keepsEverything === 'function' ? format.keepsEverything(document) : format.keepsEverything
}
