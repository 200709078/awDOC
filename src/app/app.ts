import { createEditor } from '../editor/editor'
import { insertImages } from '../editor/image'
import { acceptList } from '../formats/index'
import { currentPlatform } from '../platform/platform'
import { TOOLBAR } from '../tools/index'
import type { ToolContext } from '../tools/tool'
import { connectScreenKeyboard } from '../ui/screen-keyboard'
import { SearchBar } from '../ui/search-bar'
import { Theme } from '../ui/theme'
import { mountToolbar } from '../ui/toolbar'
import { askRestore } from '../ui/dialogs'
import { imageTypeOfName } from './images'
import { dropRecovery, readRecovery } from './recovery'
import { DocumentSession } from './session'

/** The composition root: the platform, the editor, the open document and the toolbar. */
export function startApp(): void {
  const platform = currentPlatform()
  const theme = new Theme()
  const editor = createEditor(document.querySelector<HTMLElement>('#editorHost')!)
  const session = new DocumentSession(editor, platform)
  // At once, not through TipTap's `autofocus`, which comes a moment later and would move a cursor
  // the user has already placed.
  editor.commands.focus('start')
  const searchBar = new SearchBar(editor)
  const context: ToolContext = { editor, session, platform, theme, searchBar }
  const toolbar = mountToolbar(document.querySelector<HTMLElement>('#toolbar')!, TOOLBAR, context)

  document.querySelector<HTMLInputElement>('#fileInput')!.accept = acceptList()
  // A picture dropped on the window or opened with the app goes into the document; anything else opens.
  platform.onFile(file => {
    const imageType = imageTypeOfName(file.name)
    if (imageType) void insertImages(editor, [new Blob([file.data as Uint8Array<ArrayBuffer>], { type: imageType })])
    else void session.open(file)
  })
  if (platform.screenKeyboard) connectScreenKeyboard(platform.screenKeyboard)

  // A tap on the grey around the page puts the cursor at the end, as it would on paper.
  document.querySelector('#workspace')!.addEventListener('pointerdown', event => {
    if (event.target === event.currentTarget) {
      event.preventDefault()
      editor.commands.focus('end')
    }
  })

  const showTitle = () => {
    document.title = `${session.isDirty ? '• ' : ''}${session.name} | awDOC`
  }
  session.onChange(showTitle)
  showTitle()

  // The browser holds the page back while there are unsaved changes; Electron asks the user.
  window.addEventListener('beforeunload', event => {
    if (session.isDirty) event.preventDefault()
  })

  if (platform.setSystemBars) {
    const setBars = platform.setSystemBars
    const paintBars = () => setBars({ color: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(), dark: theme.isDark })
    theme.onChange(paintBars)
    paintBars()
  }

  // Android's back button: the topmost thing on screen closes first; with nothing open the app goes behind the others.
  platform.onBack?.(() => {
    const dialog = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1)
    if (dialog) {
      if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close()
      return true
    }
    if (toolbar.close()) return true
    if (searchBar.isOpen) {
      searchBar.close()
      return true
    }
    if (platform.isFullscreen) {
      platform.toggleFullscreen()
      return true
    }
    return false
  })

  // Work left unsaved when the app was last closed (or killed by the phone) is offered back once.
  void readRecovery().then(async copy => {
    if (!copy) return
    if (await askRestore(copy)) session.restore(copy)
    else await dropRecovery()
  })
}
