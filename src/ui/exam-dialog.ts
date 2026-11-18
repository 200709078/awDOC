import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { examHeader, examPaper, storedExamDetails, storeExamDetails, type ExamDetails } from '../app/exam-template'
import type { DocumentSession } from '../app/session'

const FIELDS: Record<keyof ExamDetails, string> = {
  year: '#examYear',
  school: '#examSchool',
  grade: '#examGrade',
  subject: '#examSubject',
  exam: '#examName',
  teacher: '#examTeacher',
}

/**
 * Sınav kâğıdı: the details of the exam (remembered on the device), then a new exam paper, or the
 * header put at the top of the document on screen.
 */
export function showExamDialog(editor: Editor, session: DocumentSession): void {
  const dialog = document.querySelector<HTMLDialogElement>('#examDialog')!
  const inputs = Object.fromEntries(Object.entries(FIELDS).map(([key, selector]) => [key, document.querySelector<HTMLInputElement>(selector)!])) as Record<keyof ExamDetails, HTMLInputElement>
  const stored = storedExamDetails()
  for (const key of Object.keys(FIELDS) as (keyof ExamDetails)[]) inputs[key].value = stored[key]
  try {
    document.querySelector<HTMLInputElement>('#examColumns')!.checked = localStorage.getItem('awDOC.sinavIkiSutun') === 'evet'
  } catch {
    // The box stays as it is.
  }
  dialog.onclose = async () => {
    const choice = dialog.returnValue
    if (choice !== 'new' && choice !== 'header') {
      editor.commands.focus()
      return
    }
    const details = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value.trim()])) as unknown as ExamDetails
    storeExamDetails(details)
    if (choice === 'header') {
      editor.chain().focus().insertContentAt(0, examHeader(details)).run()
      return
    }
    const twoColumns = document.querySelector<HTMLInputElement>('#examColumns')!.checked
    try {
      localStorage.setItem('awDOC.sinavIkiSutun', twoColumns ? 'evet' : 'hayir')
    } catch {
      // Only not remembered.
    }
    if (!await session.newDocument(examPaper(details, twoColumns))) return
    // The cursor in the first question, ready for its text.
    let stem = -1
    editor.state.doc.descendants((node, pos) => {
      if (stem < 0 && node.type.name === 'question') stem = pos + 2
      return stem < 0
    })
    if (stem > 0) editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, stem)).scrollIntoView())
    editor.commands.focus()
  }
  dialog.returnValue = ''
  dialog.showModal()
  ;(stored.school ? inputs.exam : inputs.school).select()
}
