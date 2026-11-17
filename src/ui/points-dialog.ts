import type { Editor } from '@tiptap/core'
import { currentQuestion } from '../editor/question'

/** "10", "2,5" or "2.5"; NaN otherwise. */
function parsePoints(text: string): number {
  const clean = text.trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : Number.NaN
}

/** Puan: the points of the question the cursor is in, shown at its top right. */
export function showPointsDialog(editor: Editor): void {
  const question = currentQuestion(editor.state)
  if (!question) return
  const dialog = document.querySelector<HTMLDialogElement>('#pointsDialog')!
  const input = document.querySelector<HTMLInputElement>('#pointsInput')!
  const error = document.querySelector<HTMLElement>('#pointsError')!
  const current = Number(question.attrs.points) || null
  input.value = current === null ? '' : String(current).replace('.', ',')
  document.querySelector<HTMLElement>('#pointsRemove')!.hidden = current === null
  error.hidden = true
  const form = dialog.querySelector('form')!
  form.onsubmit = event => {
    if ((event.submitter as HTMLButtonElement | null)?.value !== 'save') return
    const points = parsePoints(input.value)
    if (!(points > 0 && points <= 1000)) {
      event.preventDefault()
      error.textContent = 'Puan 0\'dan büyük bir sayı olmalı (ör. 10 ya da 2,5).'
      error.hidden = false
      input.focus()
    }
  }
  dialog.onclose = () => {
    const chain = editor.chain().focus()
    if (dialog.returnValue === 'save') chain.setQuestionPoints(parsePoints(input.value)).run()
    else if (dialog.returnValue === 'remove') chain.setQuestionPoints(null).run()
    else chain.run()
  }
  dialog.returnValue = ''
  dialog.showModal()
  input.select()
}
