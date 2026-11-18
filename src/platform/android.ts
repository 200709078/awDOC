import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { withImageExtension } from '../app/images'
import { fromBase64, toBase64 } from '../core/base64'
import { FORMATS, formatOfName } from '../formats/index'
import { browserPlatform } from './browser'
import type { FileType, OpenedFile, Platform } from './platform'
import { showToast } from '../ui/messages'

/** A file from the picker or the system's "open with". Size -1 means it could not be opened. */
interface NativeFile {
  id: number
  name: string
  size: number
  /** Present when Android lets the app write the file again later. */
  source?: string
  /** Its MIME type, when the sender gave one (a shared picture). */
  type?: string
}

/** The Android app's own plugin (android/…/AwDocNativePlugin.java). */
interface AwDocNative {
  addListener(event: 'fileOpened', listener: (file: NativeFile) => void): Promise<PluginListenerHandle>
  addListener(event: 'backButton', listener: () => void): Promise<PluginListenerHandle>
  /** Puts the app behind the others; the open document is still there on coming back. */
  leaveApp(): Promise<void>
  pickFile(): Promise<void>
  /** Opens a file again by its kept address; size -1 when it is gone or no longer allowed. */
  reopenFile(options: { source: string }): Promise<NativeFile>
  readFile(options: { id: number; begin: number; end: number }): Promise<{ data: string }>
  print(options: { name: string }): Promise<void>
  setFullscreen(options: { enabled: boolean }): Promise<void>
  /** `color` is a CSS hex colour; `dark` turns the bars' icons light. */
  setSystemBars(options: { color: string; dark: boolean }): Promise<void>
  /** Adds base64 data to the copy waiting to be written; `first` starts a new copy. */
  appendOutput(options: { data: string; first: boolean }): Promise<void>
  /** Writes the waiting copy over `source`; false when Android no longer allows it. */
  writeFile(options: { source: string }): Promise<{ written: boolean }>
  /** Asks where to save the waiting copy; `name` is absent when the user cancelled. */
  saveFile(options: { name: string; type: string }): Promise<{ name?: string; source?: string }>
}

const native = registerPlugin<AwDocNative>('AwDocNative')

/** A multiple of 3: the chunks' base64 joins up without padding in the middle of the file. */
const CHUNK_BYTES = 3 * 256 * 1024

/** Android's `Color.parseColor` reads only #RRGGBB, and the build shortens #ffffff to #fff. */
function sixDigitHex(color: string): string {
  return /^#[0-9a-f]{3}$/i.test(color) ? `#${[...color.slice(1)].map(digit => digit + digit).join('')}` : color
}

/** The bridge carries text, so a file comes over piece by piece. */
/** A shared Word / LibreOffice file whose name came without its extension gets it from its type. */
function withDocumentExtension(name: string, type: string | undefined): string {
  if (formatOfName(name)) return name
  const format = FORMATS.find(candidate => candidate.mime === type && candidate.read)
  return format ? `${name}.${format.extensions[0]}` : name
}

async function readNative({ id, name: sentName, size, source, type }: NativeFile): Promise<OpenedFile> {
  const name = withDocumentExtension(withImageExtension(sentName, type), type)
  if (size < 0) throw new Error(`${name} açılamadı.`)
  const data = new Uint8Array(size)
  for (let begin = 0; begin < size; begin += CHUNK_BYTES) {
    data.set(fromBase64((await native.readFile({ id, begin, end: Math.min(begin + CHUNK_BYTES, size) })).data), begin)
  }
  return { name, data, ref: source }
}

async function sendToNative(data: Uint8Array): Promise<void> {
  for (let begin = 0; begin < data.length || begin === 0; begin += CHUNK_BYTES) {
    await native.appendOutput({ data: toBase64(data.subarray(begin, begin + CHUNK_BYTES)), first: begin === 0 })
  }
}

export function androidPlatform(): Platform {
  const fullscreenListeners = new Set<() => void>()
  let isFullscreen = false
  return {
    ...browserPlatform(),
    pickFile: () => { void native.pickFile().catch(console.error) },
    onFile: listener => {
      void native.addListener('fileOpened', file => {
        // A file that cannot be read (no permission, gone) is said, not dropped silently.
        readNative(file).then(listener).catch((error: unknown) => {
          console.error(error)
          showToast(`${withImageExtension(file.name, file.type)} açılamadı: dosyayı okuma izni yok ya da dosya bulunamadı.`)
        })
      })
    },
    storableRef: ref => (typeof ref === 'string' ? ref : undefined),
    reopen: async stored => {
      if (typeof stored !== 'string') return null
      const file = await native.reopenFile({ source: stored })
      return file.size < 0 ? null : readNative(file)
    },
    write: async (ref, data) => {
      if (typeof ref !== 'string') return false
      await sendToNative(data)
      return (await native.writeFile({ source: ref })).written
    },
    saveAs: async (name: string, data: Uint8Array, type: FileType) => {
      await sendToNative(data)
      const saved = await native.saveFile({ name, type: type.mime })
      return saved.name ? { name: saved.name, ref: saved.source } : null
    },
    // The WebView hands a page it may not open itself over to the system.
    openExternal: url => { window.location.href = url },
    print: () => { void native.print({ name: 'awDOC' }).catch(console.error) },
    setSystemBars: ({ color, dark }) => { void native.setSystemBars({ color: sixDigitHex(color), dark }).catch(console.error) },
    get isFullscreen() {
      return isFullscreen
    },
    toggleFullscreen: () => {
      isFullscreen = !isFullscreen
      void native.setFullscreen({ enabled: isFullscreen }).catch(console.error)
      for (const listener of fullscreenListeners) listener()
    },
    onFullscreenChange: listener => { fullscreenListeners.add(listener) },
    onBack: listener => {
      void native.addListener('backButton', () => {
        if (!listener()) void native.leaveApp().catch(console.error)
      })
    },
  }
}
