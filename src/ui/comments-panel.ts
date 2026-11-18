import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { authorName, setAuthorName } from '../app/author'
import { commentedText, commentsOf } from '../editor/review'

const DATE = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Yorumlar: the document's comments beside it, with the text each is on. A tap on one selects its
 * text; Çözüldü greys it out; Sil takes it away. Tapping commented text in the document opens it.
 */
export class CommentsPanel {
  private readonly panel = document.querySelector<HTMLElement>('#commentsPanel')!
  private readonly list = document.querySelector<HTMLElement>('#commentsList')!
  private shown = ''
  private readonly listeners = new Set<() => void>()

  constructor(private readonly editor: Editor) {
    document.querySelector('#commentsClose')!.addEventListener('click', () => this.setOpen(false))
    editor.on('update', () => this.draw())
    editor.view.dom.addEventListener('click', event => {
      const mark = (event.target as Element | null)?.closest?.('.comment-mark')
      if (mark) this.show(mark.getAttribute('data-comment') ?? '')
    })
  }

  get isOpen(): boolean {
    return !this.panel.hidden
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  setOpen(open: boolean): void {
    this.panel.hidden = !open
    document.body.classList.toggle('comments-open', open)
    if (open) this.draw(true)
    for (const listener of this.listeners) listener()
  }

  /** Opens the panel at one comment. */
  show(id: string): void {
    this.setOpen(true)
    const item = this.list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
    this.list.querySelectorAll('.is-current').forEach(element => element.classList.remove('is-current'))
    item?.classList.add('is-current')
    item?.scrollIntoView({ block: 'nearest' })
  }

  private draw(force = false): void {
    if (this.panel.hidden) return
    const { doc } = this.editor.state
    const entries = commentsOf(doc)
    const key = JSON.stringify([entries, entries.map(entry => commentedText(doc, entry.id).text)])
    if (key === this.shown && !force) return
    this.shown = key
    this.list.replaceChildren(...entries.map(entry => {
      const item = document.createElement('article')
      item.className = `comment-item${entry.done ? ' is-done' : ''}`
      item.dataset.id = entry.id
      const head = document.createElement('div')
      head.className = 'comment-item__head'
      head.textContent = `${entry.author || 'Yazar'} · ${DATE.format(new Date(entry.date))}`
      const quote = document.createElement('div')
      quote.className = 'comment-item__quote'
      const target = commentedText(doc, entry.id)
      quote.textContent = target.text ? `“${target.text.length > 80 ? `${target.text.slice(0, 80)}…` : target.text}”` : '(yorumlanan yazı silindi)'
      const text = document.createElement('p')
      text.className = 'comment-item__text'
      text.textContent = entry.text
      const actions = document.createElement('div')
      actions.className = 'comment-item__actions'
      const button = (label: string, run: () => void) => {
        const element = document.createElement('button')
        element.type = 'button'
        element.className = 'secondary-button'
        element.textContent = label
        element.addEventListener('click', event => {
          event.stopPropagation()
          run()
        })
        return element
      }
      actions.append(
        button(entry.done ? 'Yeniden aç' : 'Çözüldü', () => { this.editor.commands.updateComment(entry.id, { done: !entry.done }) }),
        button('Sil', () => { this.editor.commands.deleteComment(entry.id) }),
      )
      item.append(head, quote, text, actions)
      item.addEventListener('click', () => {
        const range = commentedText(this.editor.state.doc, entry.id)
        if (range.from < 0) return
        const { tr } = this.editor.state
        tr.setSelection(TextSelection.create(tr.doc, range.from, range.to)).scrollIntoView()
        this.editor.view.dispatch(tr)
      })
      return item
    }))
    if (!entries.length) {
      const empty = document.createElement('p')
      empty.className = 'comments-panel__empty'
      empty.textContent = 'Yorum yok. Bir yazıyı seçip Gözden Geçir ▾ → Yorum Ekle ile yorum yazılır.'
      this.list.append(empty)
    }
  }
}

/** Yorum Ekle: the comment's text and the writer's name (remembered). */
export function showCommentDialog(editor: Editor, panel: CommentsPanel): void {
  const { from, to, empty } = editor.state.selection
  if (empty) return
  const dialog = document.querySelector<HTMLDialogElement>('#commentDialog')!
  const text = document.querySelector<HTMLTextAreaElement>('#commentText')!
  const author = document.querySelector<HTMLInputElement>('#commentAuthor')!
  const quoted = editor.state.doc.textBetween(from, to, ' ')
  document.querySelector('#commentQuote')!.textContent = `“${quoted.length > 120 ? `${quoted.slice(0, 120)}…` : quoted}”`
  text.value = ''
  author.value = authorName()
  dialog.onclose = () => {
    if (dialog.returnValue !== 'save' || !text.value.trim()) {
      editor.commands.focus()
      return
    }
    setAuthorName(author.value)
    editor.chain().focus().setTextSelection({ from, to }).addComment(text.value, author.value.trim()).run()
    panel.setOpen(true)
  }
  dialog.returnValue = ''
  dialog.showModal()
  ;(author.value ? text : author).focus()
}

/** The name tracked changes are signed with, asked when there is none yet; null when cancelled. */
export function askAuthor(): Promise<string | null> {
  const known = authorName()
  if (known) return Promise.resolve(known)
  const dialog = document.querySelector<HTMLDialogElement>('#authorDialog')!
  const input = document.querySelector<HTMLInputElement>('#authorName')!
  input.value = ''
  return new Promise(resolve => {
    dialog.onclose = () => {
      if (dialog.returnValue !== 'save' || !input.value.trim()) return resolve(null)
      setAuthorName(input.value)
      resolve(input.value.trim())
    }
    dialog.returnValue = ''
    dialog.showModal()
  })
}
