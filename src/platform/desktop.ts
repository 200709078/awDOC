import { browserPlatform, onPickedFile, openedFromBlob, showFileInput } from './browser'
import type { OpenedFile, Platform } from './platform'

/** The shell's lasting name for each file it numbered; kept so the recent list can find it again. */
const sources = new Map<number, string>()

const fromDisk = ({ id, name, data, source }: DesktopOpenedFile): OpenedFile => {
  sources.set(id, source)
  return { name, data, ref: id }
}

/**
 * The Electron window: full screen belongs to the window and files come from the shell, which
 * knows where they are and writes them again. The rest works as in a browser.
 */
export function desktopPlatform(controls: DesktopWindowControls, files: DesktopFiles, screenKeyboard?: DesktopScreenKeyboard): Platform {
  const fullscreenListeners = new Set<() => void>()
  let isFullscreen = false
  const show = (enabled: boolean) => {
    isFullscreen = enabled
    for (const listener of fullscreenListeners) listener()
  }
  controls.onFullscreenChanged(show)
  void controls.isFullscreen().then(show).catch(() => undefined)
  return {
    ...browserPlatform(),
    screenKeyboard,
    pickFile: showFileInput,
    onFile: listener => {
      files.onOpened(file => listener(fromDisk(file)))
      onPickedFile(file => {
        void files.adopt(file).catch(() => null).then(async opened => {
          listener(opened ? fromDisk(opened) : await openedFromBlob(file))
        })
      })
    },
    storableRef: ref => (typeof ref === 'number' ? sources.get(ref) : undefined),
    reopen: async stored => {
      if (typeof stored !== 'string') return null
      const file = await files.reopen(stored).catch(() => null)
      return file && fromDisk(file)
    },
    write: async (ref, data) => typeof ref === 'number' && files.write(ref, data),
    saveAs: async (name, data, type, near) => {
      const saved = await files.saveAs(name, data, typeof near === 'number' ? near : undefined, type)
      if (!saved) return null
      sources.set(saved.id, saved.source)
      return { name: saved.name, ref: saved.id }
    },
    get isFullscreen() {
      return isFullscreen
    },
    toggleFullscreen: () => controls.toggleFullscreen(),
    onFullscreenChange: listener => { fullscreenListeners.add(listener) },
  }
}
