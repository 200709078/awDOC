import type { Editor } from '@tiptap/core'
import { fieldsIn, mergeDocument, readMergeData, type MergeData } from '../app/mail-merge'
import { UNTITLED, type DocumentSession } from '../app/session'
import { showToast } from './messages'

/** The data chosen last, kept while the app is open: fields are put in, then the merge is made. */
let data: MergeData | null = null

function drawFields(editor: Editor): void {
  const box = document.querySelector<HTMLElement>('#mergeFieldsBox')!
  const list = document.querySelector<HTMLElement>('#mergeFields')!
  box.hidden = !data
  document.querySelector('#mergeSource')!.textContent = data
    ? `${data.name}: ${data.rows.length} satır, ${data.columns.length} sütun.`
    : 'Belgenin her satır için bir kopyası açılır: öğrenci listesiyle kişiye özel kâğıt ya da veli mektubu. Önce verinin olduğu dosyayı seçin (ilk satır sütunların adları).'
  list.replaceChildren(...(data?.columns ?? []).map(column => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'secondary-button merge-dialog__field'
    button.textContent = `«${column}»`
    button.addEventListener('click', () => {
      editor.chain().focus().insertMergeField(column).run()
      drawUsed(editor)
      showToast(`«${column}» alanı eklendi.`)
    })
    return button
  }))
  drawUsed(editor)
}

function drawUsed(editor: Editor): void {
  const fields = fieldsIn(editor.getJSON())
  const missing = data ? fields.filter(field => !data!.columns.includes(field)) : []
  document.querySelector('#mergeUsed')!.textContent = fields.length
    ? `Belgedeki alanlar: ${fields.map(field => `«${field}»`).join(', ')}.${missing.length ? ` Veride olmayanlar boş kalır: ${missing.join(', ')}.` : ''}`
    : 'Belgede henüz alan yok.'
  document.querySelector<HTMLButtonElement>('#mergeRun')!.disabled = !data || !data.rows.length || !fields.length
}

/** Adres-Mektup: the data file, its columns as fields to put in, and the merge into a new document. */
export function showMergeDialog(editor: Editor, session: DocumentSession): void {
  const dialog = document.querySelector<HTMLDialogElement>('#mergeDialog')!
  const input = document.querySelector<HTMLInputElement>('#mergeFile')!
  document.querySelector<HTMLButtonElement>('#mergeChoose')!.onclick = () => input.click()
  input.onchange = async () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      data = readMergeData(file.name, new Uint8Array(await file.arrayBuffer()))
      if (!data.rows.length) showToast(`${file.name} içinde sütun adlarından başka satır yok.`)
    } catch (error) {
      console.error(error)
      showToast(error instanceof Error && error.message ? error.message : `${file.name} okunamadı.`)
    }
    drawFields(editor)
  }
  dialog.onclose = async () => {
    if (dialog.returnValue !== 'merge' || !data) {
      editor.commands.focus()
      return
    }
    const merged = mergeDocument(editor.getJSON(), data)
    const name = `${session.name === UNTITLED ? 'Belge' : session.name.replace(/\.[^.]+$/, '')} - birleştirilmiş`
    if (await session.newDocument(merged, name)) showToast(`${data.rows.length} kopya yeni belgede açıldı; kaydetmeyi unutmayın.`)
  }
  drawFields(editor)
  dialog.returnValue = ''
  dialog.showModal()
}
