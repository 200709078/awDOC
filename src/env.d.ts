/** The app's version from package.json (vite.config.ts `define`), shown in Hakkında. */
declare const __APP_VERSION__: string

/** Window controls exposed by the Electron preload; absent in the browser. */
interface DesktopWindowControls {
  minimize(): void
  toggleMaximize(): void
  toggleFullscreen(): void
  setFullscreen(enabled: boolean): void
  close(): void
  isMaximized(): Promise<boolean>
  isFullscreen(): Promise<boolean>
  onMaximizeChanged(callback: (maximized: boolean) => void): void
  onFullscreenChanged(callback: (fullscreen: boolean) => void): void
}

/** A file on disk, read whole by the Electron shell; `id` lets the page write it again. */
interface DesktopOpenedFile {
  id: number
  name: string
  data: Uint8Array
  /** Stands for the path, which the page never learns; `reopen` takes it back later. */
  source: string
}

/** The disk as the page may see it: only files the user gave the app, and only by number. */
interface DesktopFiles {
  onOpened(callback: (file: DesktopOpenedFile) => void): void
  adopt(file: File): Promise<DesktopOpenedFile | null>
  /** Writes over the file the shell knows as `id`. */
  write(id: number, data: Uint8Array): Promise<boolean>
  /** Asks where to save, next to the file `nearId` when given; null when the user cancelled. */
  saveAs(name: string, data: Uint8Array, nearId: number | undefined, type: { extension: string; description: string }): Promise<{ id: number; name: string; source: string } | null>
  /** Opens again the file `source` stood for; null when it is gone. */
  reopen(source: string): Promise<DesktopOpenedFile | null>
  /** Prints the page to a PDF and asks where to save it; null when the user cancelled. */
  exportPdf(name: string, nearId: number | undefined): Promise<{ name: string } | null>
}

/** Opens the system's on-screen keyboard for a text field. */
interface DesktopScreenKeyboard {
  show(requestId: string): Promise<'shown' | 'unavailable' | 'cancelled'>
  hide(requestId: string): void
}

interface FileSystemFileHandle {
  queryPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

interface Window {
  /** Chromium browsers on computers only. */
  showSaveFilePicker?(options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }): Promise<FileSystemFileHandle>
  showOpenFilePicker?(options: { types: { description: string; accept: Record<string, string[]> }[]; multiple: boolean }): Promise<FileSystemFileHandle[]>
  awDOCDesktop?: {
    windowControls?: DesktopWindowControls
    files?: DesktopFiles
    screenKeyboard?: DesktopScreenKeyboard
  }
}
