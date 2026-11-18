import type { Editor } from '@tiptap/core'

/** Dipnot: a new footnote where the cursor is, or (with `pos`) the text of one; "Dipnotu sil" removes it. */
export function showFootnoteDialog(editor: Editor, pos?: number): void {
  const dialog = document.querySelector<HTMLDialogElement>('#footnoteDialog')!
  const text = document.querySelector<HTMLTextAreaElement>('#footnoteText')!
  const existing = pos === undefined ? null : editor.state.doc.nodeAt(pos)
  const editing = existing?.type.name === 'footnote' ? existing : null
  text.value = editing ? String(editing.attrs.text ?? '') : ''
  document.querySelector<HTMLElement>('#footnoteDelete')!.hidden = !editing
  dialog.onclose = () => {
    const value = text.value.replace(/\s+/g, ' ').trim()
    if (dialog.returnValue === 'delete' && editing && pos !== undefined) editor.chain().focus().setFootnoteText(pos, '').run()
    else if (dialog.returnValue === 'save' && value && editing && pos !== undefined) editor.chain().focus().setFootnoteText(pos, value).run()
    else if (dialog.returnValue === 'save' && value && !editing) editor.chain().focus().insertFootnote(value).run()
    else editor.commands.focus()
  }
  dialog.returnValue = ''
  dialog.showModal()
  text.focus()
}
