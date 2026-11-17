import type { Editor } from '@tiptap/core'
import { makeBooklet, questionCount } from '../app/booklet'
import { UNTITLED, type DocumentSession } from '../app/session'
import { showToast } from './messages'

/**
 * B kitapçığı: the same exam with its questions and choices in another order, opened as a new
 * document (the A paper stays in its file; unsaved changes are asked about first).
 */
export function showBookletDialog(editor: Editor, session: DocumentSession): void {
  const count = questionCount(editor.getJSON())
  if (count.questions < 2 && count.withChoices === 0) {
    showToast('B kitapçığı için belgede en az iki soru ya da şıklı bir soru olmalı.')
    return
  }
  const dialog = document.querySelector<HTMLDialogElement>('#bookletDialog')!
  const questions = document.querySelector<HTMLInputElement>('#bookletQuestions')!
  const choices = document.querySelector<HTMLInputElement>('#bookletChoices')!
  questions.disabled = count.questions < 2
  questions.checked = count.questions >= 2
  choices.disabled = count.withChoices === 0
  choices.checked = count.withChoices > 0
  dialog.onclose = async () => {
    if (dialog.returnValue !== 'make' || (!questions.checked && !choices.checked)) {
      editor.commands.focus()
      return
    }
    // Taken before anything else: the question about unsaved changes may save A first.
    const booklet = makeBooklet(editor.getJSON(), { questions: questions.checked, choices: choices.checked, label: 'B Kitapçığı' })
    const name = `${session.name === UNTITLED ? 'Sınav' : session.name.replace(/\.[^.]+$/, '')} - B`
    if (await session.newDocument(booklet, name)) showToast('B kitapçığı açıldı; kaydetmeyi unutmayın.')
  }
  dialog.returnValue = ''
  dialog.showModal()
}
