import type { Editor } from '@tiptap/core'
import { countText } from '../core/count'
import { normalizeLink } from '../core/links'
import { clearRecent, listRecent } from '../app/recent'
import type { RecoveryCopy } from '../app/recovery'
import type { DocumentSession } from '../app/session'
import type { Platform } from '../platform/platform'

/**
 * Bağlantı: on a link it edits, opens or removes it; on selected words it makes them a link; with
 * nothing selected it asks for the words too and puts them in.
 */
export function showLinkDialog(editor: Editor, platform: Platform): void {
  const dialog = document.querySelector<HTMLDialogElement>('#linkDialog')!
  const textField = document.querySelector<HTMLElement>('#linkTextField')!
  const textInput = document.querySelector<HTMLInputElement>('#linkText')!
  const urlInput = document.querySelector<HTMLInputElement>('#linkUrl')!
  const error = document.querySelector<HTMLElement>('#linkError')!
  const existing = editor.isActive('link')
  if (existing) editor.chain().extendMarkRange('link').run()
  const { empty } = editor.state.selection
  urlInput.value = existing ? String(editor.getAttributes('link').href ?? '') : ''
  textInput.value = ''
  textField.hidden = !empty
  error.hidden = true
  for (const id of ['#linkRemove', '#linkOpen']) document.querySelector<HTMLElement>(id)!.hidden = !existing

  const form = dialog.querySelector('form')!
  // A wrong address keeps the window open with the reason under the field.
  form.onsubmit = event => {
    const action = (event.submitter as HTMLButtonElement | null)?.value
    if (action !== 'save' && action !== 'open') return
    const href = normalizeLink(urlInput.value)
    if (!href) {
      event.preventDefault()
      error.textContent = 'Bu bir web ya da e-posta adresi değil (ör. madematik.com).'
      error.hidden = false
      urlInput.focus()
    }
  }
  dialog.onclose = () => {
    const href = normalizeLink(urlInput.value)
    const chain = editor.chain().focus()
    if (dialog.returnValue === 'remove') chain.extendMarkRange('link').unsetLink().run()
    else if (dialog.returnValue === 'open' && href) platform.openExternal(href)
    else if (dialog.returnValue === 'save' && href) {
      if (empty) {
        const text = textInput.value.trim() || href.replace(/^mailto:/, '')
        chain.insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }).run()
      } else {
        chain.extendMarkRange('link').setLink({ href }).run()
      }
    } else chain.run()
  }
  dialog.returnValue = ''
  dialog.showModal()
  ;(empty ? textInput : urlInput).focus()
}

/** Kelime sayısı, of the selection when there is one, as Word does. */
export function showWordCount(editor: Editor): void {
  const { state } = editor
  const { from, to, empty } = state.selection
  const [start, end] = empty ? [0, state.doc.content.size] : [from, to]
  const count = countText(state.doc.textBetween(start, end, '\n', ' '))
  let paragraphs = 0
  state.doc.nodesBetween(start, end, node => {
    if (node.isTextblock && node.textContent.trim()) paragraphs++
    return !node.isTextblock
  })
  document.querySelector('#countTitle')!.textContent = empty ? 'Kelime sayısı' : 'Kelime sayısı (seçili bölüm)'
  const rows: [string, number][] = [
    ['Kelime', count.words],
    ['Karakter (boşluksuz)', count.charactersWithoutSpaces],
    ['Karakter (boşluklu)', count.characters],
    ['Paragraf', paragraphs],
  ]
  const list = document.querySelector('#countList')!
  list.replaceChildren(...rows.flatMap(([name, value]) => {
    const term = document.createElement('dt')
    term.textContent = name
    const detail = document.createElement('dd')
    detail.textContent = value.toLocaleString('tr-TR')
    return [term, detail]
  }))
  const dialog = document.querySelector<HTMLDialogElement>('#countDialog')!
  dialog.showModal()
}

/** Tablo Ekle: rows and columns, a header row if wanted; the table goes where the cursor is. */
export function showTableDialog(editor: Editor): void {
  const dialog = document.querySelector<HTMLDialogElement>('#tableDialog')!
  const rows = document.querySelector<HTMLInputElement>('#tableRows')!
  const columns = document.querySelector<HTMLInputElement>('#tableColumns')!
  const header = document.querySelector<HTMLInputElement>('#tableHeader')!
  dialog.onclose = () => {
    const chain = editor.chain().focus()
    if (dialog.returnValue === 'insert' && rows.validity.valid && columns.validity.valid) {
      chain.insertTable({ rows: Number(rows.value), cols: Number(columns.value), withHeaderRow: header.checked }).run()
    } else chain.run()
  }
  dialog.returnValue = ''
  dialog.showModal()
  rows.select()
}

const DATE = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })

/** Son Belgeler: a tap opens the file again (asking first about unsaved changes). */
export async function showRecentDocuments(session: DocumentSession): Promise<void> {
  const dialog = document.querySelector<HTMLDialogElement>('#recentDialog')!
  const list = document.querySelector<HTMLElement>('#recentList')!
  const entries = await listRecent()
  document.querySelector<HTMLElement>('#recentEmpty')!.hidden = entries.length > 0
  document.querySelector<HTMLElement>('#recentClear')!.hidden = entries.length === 0
  list.replaceChildren(...entries.map(entry => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'recent-item'
    const name = document.createElement('span')
    name.className = 'recent-item__name'
    name.textContent = entry.name.replace(/\.awd$/i, '')
    const date = document.createElement('span')
    date.className = 'recent-item__date'
    date.textContent = DATE.format(entry.usedAt)
    item.append(name, date)
    item.addEventListener('click', () => {
      dialog.close()
      void session.openRecent(entry)
    })
    return item
  }))
  document.querySelector<HTMLButtonElement>('#recentClear')!.onclick = () => {
    void clearRecent()
    dialog.close()
  }
  dialog.showModal()
}

/** Asked once at start when a copy of unsaved work was left behind; true to bring it back. */
export function askRestore(copy: RecoveryCopy): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>('#recoveryDialog')!
  document.querySelector('#recoveryMessage')!.textContent = `"${copy.name}" belgesindeki kaydedilmemiş değişiklikler (${DATE.format(copy.savedAt)}) bu cihazda saklanmış.`
  dialog.returnValue = ''
  dialog.showModal()
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'restore'), { once: true })
  })
}
