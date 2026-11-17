import { Capacitor } from '@capacitor/core'
import type { DocumentFormat } from '../formats/format'
import { androidPlatform } from './android'
import { browserPlatform } from './browser'
import { desktopPlatform } from './desktop'
import { isSmartBoard } from './smart-board'

/**
 * How the platform finds a file again to write over it: a file handle in a Chromium browser, the
 * shell's number on the desktop, a content address on Android. The rest of the app never looks inside.
 */
export type FileRef = unknown

/** A file the user opened, read whole: documents are small next to a PDF book. */
export interface OpenedFile {
  readonly name: string
  readonly data: Uint8Array
  /** Absent where the platform cannot write the file back (a download-only browser). */
  readonly ref?: FileRef
}

export interface SavedFile {
  readonly name: string
  readonly ref?: FileRef
}

/** What kind of file is saved. */
export interface FileType {
  readonly mime: string
  readonly extension: string
  readonly description: string
}

export const fileTypeOf = (format: DocumentFormat): FileType => ({
  mime: format.mime,
  extension: format.extensions[0],
  description: format.description,
})

/**
 * Everything that differs between Electron, Android and the web. The rest of the app talks only
 * to this. Files arrive through `onFile` because they do not always come from the picker: the
 * system's "open with" and a drop on the window hand the app a file too.
 */
export interface Platform {
  /** Shows the file picker for `types`; a chosen file arrives through `onFile`. */
  pickFile(types: readonly FileType[]): void
  onFile(listener: (file: OpenedFile) => void): void
  /** Writes over the file `ref` stands for. False when that is not possible; the app then asks where to save. */
  write(ref: FileRef, data: Uint8Array): Promise<boolean>
  /**
   * What can be kept between visits (in IndexedDB) to find the file of `ref` again: a file handle,
   * the shell's source, a content address. Undefined where the platform cannot come back to it.
   */
  storableRef(ref: FileRef): unknown
  /** Opens a file again from `storableRef`'s value; null when it is gone or no longer allowed. */
  reopen(stored: unknown): Promise<OpenedFile | null>
  /** Writes a new file where the user chooses, offering `name`; null when the user cancelled. */
  saveAs(name: string, data: Uint8Array, type: FileType, near?: FileRef): Promise<SavedFile | null>
  /**
   * Saves the printed document as a PDF where the user chooses, resolving the file's name (null
   * when cancelled). Absent where only the print dialog can make one (its "Save as PDF").
   */
  exportPdf?(name: string, near?: FileRef): Promise<string | null>
  /** Hands a link to the system's browser or mail app. */
  openExternal(url: string): void
  /** Prints what the `@media print` styles show. */
  print(): void
  /** A smart board has no keys; absent everywhere else, where the system sees to its own keyboard. */
  readonly screenKeyboard?: DesktopScreenKeyboard
  /** The system's own bars around the app take the interface's colour; absent where it has none. */
  setSystemBars?(bars: { color: string; dark: boolean }): void
  readonly isFullscreen: boolean
  toggleFullscreen(): void
  onFullscreenChange(listener: () => void): void
  /**
   * The device's back button, where it has one. The listener answers whether it closed something;
   * when it did not, the platform leaves the app.
   */
  onBack?(listener: () => boolean): void
}

export function currentPlatform(): Platform {
  if (Capacitor.getPlatform() === 'android') return androidPlatform()
  const { windowControls, files, screenKeyboard } = window.awDOCDesktop ?? {}
  if (!windowControls || !files) return browserPlatform()
  return desktopPlatform(windowControls, files, isSmartBoard() ? screenKeyboard : undefined)
}
