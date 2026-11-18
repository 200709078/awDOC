import { Node } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import { answersOf } from './question'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    answerKey: {
      /** The answer key at the end of the document, on a page of its own; where there is one, the cursor goes to it. */
      insertAnswerKey: () => ReturnType
    }
  }
}

/** The key's text: "1. B", one per question; "—" for an open-ended question, "?" for one with no right choice marked. */
export function answerKeyEntries(doc: ProseMirrorNode, around?: number): string[] {
  return answersOf(doc, around).map((answer, index) => `${index + 1}. ${answer ?? '—'}`)
}

/**
 * Cevap Anahtarı: a block that lists the right answer of every question, always up to date (it is
 * drawn from the questions, so it holds nothing of its own).
 */
export const AnswerKey = Node.create({
  name: 'answerKey',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-answer-key]' }]
  },

  renderHTML() {
    return ['div', { 'data-answer-key': '', class: 'answer-key' }, 'Cevap Anahtarı']
  },

  renderText() {
    return 'Cevap Anahtarı'
  },

  addCommands() {
    return {
      insertAnswerKey: () => ({ state, tr, dispatch }) => {
        let existing = -1
        state.doc.forEach((child, offset) => { if (child.type.name === this.name) existing = offset })
        if (dispatch) {
          if (existing < 0) {
            const end = state.doc.content.size
            const last = state.doc.lastChild
            const emptyLast = last?.type.name === 'paragraph' && last.content.size === 0
            const at = emptyLast ? end - last.nodeSize : end
            tr.insert(at, [state.schema.nodes.pageBreak.create(), this.type.create(), state.schema.nodes.paragraph.create()])
            existing = at + 1
          }
          tr.setSelection(NodeSelection.create(tr.doc, existing))
          tr.scrollIntoView()
        }
        return true
      },
    }
  },

  addNodeView() {
    return ({ editor, getPos }) => {
      const dom = document.createElement('div')
      dom.className = 'answer-key'
      dom.dataset.answerKey = ''
      dom.contentEditable = 'false'
      const title = document.createElement('div')
      title.className = 'answer-key__title'
      title.textContent = 'Cevap Anahtarı'
      const list = document.createElement('ol')
      list.className = 'answer-key__list'
      dom.append(title, list)
      let shown = ''
      const draw = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        const entries = answerKeyEntries(editor.state.doc, pos)
        const key = entries.join('|')
        if (key === shown) return
        shown = key
        list.replaceChildren(...entries.map(entry => {
          const item = document.createElement('li')
          const [number, letter] = entry.split(' ')
          const strong = document.createElement('strong')
          strong.textContent = number
          item.append(strong, ` ${letter}`)
          if (letter === '?') item.classList.add('is-missing')
          return item
        }))
        if (!entries.length) {
          const empty = document.createElement('li')
          empty.textContent = 'Belgede henüz soru yok.'
          list.append(empty)
        }
      }
      draw()
      // Questions change elsewhere in the document: the key follows them.
      editor.on('update', draw)
      return {
        dom,
        ignoreMutation: () => true,
        destroy: () => { editor.off('update', draw) },
      }
    }
  },
})
