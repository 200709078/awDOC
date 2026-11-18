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
import { PageView } from '../ui/page-view'
import { Welcome, welcomeAtStart } from '../ui/welcome'
import { askRestore } from '../ui/dialogs'
import { showFormulaDialog } from '../ui/formula-dialog'
import { restoreAnswersShown } from '../ui/answers'
import { imageTypeOfName } from './images'
import { dropRecovery, readRecovery } from './recovery'
import { DocumentSession } from './session'

/** The composition root: the platform, the editor, the open document and the toolbar. */
export function startApp(): void {
  const platform = currentPlatform()
  const theme = new Theme()
  const editorHost = document.querySelector<HTMLElement>('#editorHost')!
  const editor = createEditor(editorHost)
  const session = new DocumentSession(editor, platform)
  // A double click (or Enter) on a formula opens it in the formula window.
  editor.storage.formula.edit = pos => { void showFormulaDialog(editor, pos) }
  // At once, not through TipTap's `autofocus`, which comes a moment later and would move a cursor
  // the user has already placed.
  editor.commands.focus('start')
  const searchBar = new SearchBar(editor)
  const pageView = new PageView(editor, editorHost)
  restoreAnswersShown()
  const welcome = new Welcome(editor, session, pageView)
  const context: ToolContext = { editor, session, platform, theme, searchBar, pageView, welcome }
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
  // The print dialog's "Save as PDF" names the file after the page's title: the document's name.
  window.addEventListener('beforeprint', () => { document.title = session.name.replace(/\.[^.]+$/, '') })
  window.addEventListener('afterprint', showTitle)

  // Closing the desktop window with unsaved changes: the app's own question (as before Yeni or Aç);
  // Kaydet saves first (a save given up, at the "where" question, keeps the window open).
  const windowControls = window.awDOCDesktop?.windowControls
  let askingToClose = false
  windowControls?.onCloseRequested?.(() => {
    // Already asked (by Yeni or Aç, or by a click on ✕ a moment ago): that answer decides.
    if (askingToClose || document.querySelector<HTMLDialogElement>('#unsavedDialog')!.open) return
    askingToClose = true
    void session.confirmLeave()
      .then(leave => { if (leave) windowControls.closeNow?.() })
      .finally(() => { askingToClose = false })
  })

  // The browser holds the page back while there are unsaved changes; in Electron the page asks (above).
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
  // Android's back button, as in awPDF: the topmost thing on screen closes first (a window, the ☰
  // menu, the find bar, full screen); then the welcome screen opened over a document gives the
  // document back; then the document closes (unsaved changes asked about) and the welcome screen
  // comes; from the welcome screen the app goes behind the others.
  platform.onBack?.(() => {
    const dialog = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1)
    if (dialog) {
      if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close()
    } else if (toolbar.close()) return true
    else if (searchBar.isOpen) searchBar.close()
    else if (platform.isFullscreen) platform.toggleFullscreen()
    else if (welcome.closeOnBack()) return true
    else if (welcome.isOpen) return false
    else {
      void session.newDocument().then(closed => { if (closed) welcome.show(false) })
    }
    return true
  })

  // The welcome screen opens with the app, unless turned off there; a file the app was opened
  // with (Electron's command line, Android's "open with" / "share") closes it as it comes.
  if (welcomeAtStart()) welcome.show(false)

  // Work left unsaved when the app was last closed (or killed by the phone) is offered back once:
  // on the welcome screen as a card, otherwise in a window.
  void readRecovery().then(async copy => {
    if (!copy) return
    if (welcome.isOpen) {
      welcome.offerRecovery(copy)
      return
    }
    if (await askRestore(copy)) session.restore(copy)
    else await dropRecovery()
  })
}
