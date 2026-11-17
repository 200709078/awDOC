import { browserPlatform, onPickedFile, openedFromBlob, showFileInput } from './browser'
import type { OpenedFile, Platform } from './platform'

const fromDisk = ({ id, name, data }: DesktopOpenedFile): OpenedFile => ({ name, data, ref: id })

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
    write: async (ref, data) => typeof ref === 'number' && files.write(ref, data),
    saveAs: async (name, data, type, near) => {
      const saved = await files.saveAs(name, data, typeof near === 'number' ? near : undefined, type)
      return saved && { name: saved.name, ref: saved.id }
    },
    get isFullscreen() {
      return isFullscreen
    },
    toggleFullscreen: () => controls.toggleFullscreen(),
    onFullscreenChange: listener => { fullscreenListeners.add(listener) },
  }
}
