import type { FileRef, FileType, OpenedFile, Platform, SavedFile } from './platform'

const DROPPING_CLASS = 'is-dropping'
/** Long enough for the browser to have taken the download. */
const DOWNLOAD_URL_LIFETIME_MS = 60_000

export async function openedFromBlob(file: File, ref?: FileRef): Promise<OpenedFile> {
  return { name: file.name, data: new Uint8Array(await file.arrayBuffer()), ref }
}

/** Files from the picker and from a drop anywhere on the window. */
export function onPickedFile(listener: (file: File) => void): void {
  const input = document.querySelector<HTMLInputElement>('#fileInput')!
  input.addEventListener('change', () => {
    const [file] = input.files ?? []
    // Cleared so that choosing the same file again fires `change` again.
    input.value = ''
    if (file) listener(file)
  })
  const carriesFiles = ({ dataTransfer }: DragEvent) => dataTransfer?.types.includes('Files') ?? false
  const setDropping = (dropping: boolean) => document.body.classList.toggle(DROPPING_CLASS, dropping)
  window.addEventListener('dragover', event => {
    if (!carriesFiles(event)) return
    event.preventDefault()
    setDropping(true)
  })
  window.addEventListener('dragleave', event => {
    // Null only on leaving the window; moving between elements names the next one.
    if (event.relatedTarget === null) setDropping(false)
  })
  window.addEventListener('drop', event => {
    if (!carriesFiles(event)) return
    event.preventDefault()
    setDropping(false)
    const [file] = event.dataTransfer?.files ?? []
    if (file) listener(file)
  })
}

export function showFileInput(): void {
  document.querySelector<HTMLInputElement>('#fileInput')!.click()
}

const pickerTypes = (types: readonly FileType[]) => types.map(type => ({ description: type.description, accept: { [type.mime]: [`.${type.extension}`] } }))

const isAbort = (error: unknown) => (error as DOMException | undefined)?.name === 'AbortError'

async function writeHandle(handle: FileSystemFileHandle, data: Uint8Array): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(data as Uint8Array<ArrayBuffer>)
  await writable.close()
}

/** The file goes to the downloads; the browser cannot write it again, so there is no `ref`. */
function download(name: string, data: Uint8Array, type: FileType): SavedFile {
  const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: type.mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS)
  return { name }
}

/**
 * Chromium on a computer opens and saves through file handles, so "Kaydet" writes the same file
 * again. Other browsers read through `<input type=file>` and save to the downloads.
 */
export function browserPlatform(): Platform {
  const listeners = new Set<(file: OpenedFile) => void>()
  const deliver = (file: OpenedFile) => {
    for (const listener of listeners) listener(file)
  }
  let wired = false
  return {
    pickFile: types => {
      if (!window.showOpenFilePicker) {
        showFileInput()
        return
      }
      window.showOpenFilePicker({ types: pickerTypes(types), multiple: false }).then(async ([handle]) => {
        if (handle) deliver(await openedFromBlob(await handle.getFile(), handle))
      }).catch((error: unknown) => {
        if (!isAbort(error)) console.error(error)
      })
    },
    onFile: listener => {
      listeners.add(listener)
      if (wired) return
      wired = true
      onPickedFile(file => { void openedFromBlob(file).then(deliver) })
    },
    write: async (ref, data) => {
      if (!(typeof FileSystemFileHandle === 'function' && ref instanceof FileSystemFileHandle)) return false
      // Asked once per visit; a keyboard shortcut counts as the user's own act.
      if (await ref.queryPermission({ mode: 'readwrite' }) !== 'granted'
        && await ref.requestPermission({ mode: 'readwrite' }) !== 'granted') return false
      await writeHandle(ref, data)
      return true
    },
    saveAs: async (name, data, type) => {
      if (!window.showSaveFilePicker) return download(name, data, type)
      let handle: FileSystemFileHandle
      try {
        handle = await window.showSaveFilePicker({ suggestedName: name, types: pickerTypes([type]) })
      } catch (error) {
        if (isAbort(error)) return null
        throw error
      }
      await writeHandle(handle, data)
      return { name: handle.name, ref: handle }
    },
    openExternal: url => { window.open(url, '_blank', 'noopener,noreferrer') },
    print: () => window.print(),
    get isFullscreen() {
      return document.fullscreenElement !== null
    },
    toggleFullscreen: () => {
      const change = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
      void change.catch(console.error)
    },
    onFullscreenChange: listener => { document.addEventListener('fullscreenchange', listener) },
  }
}
