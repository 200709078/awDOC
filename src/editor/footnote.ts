import { Node, mergeAttributes, type JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { noteItem } from './pagination'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      /** A footnote where the cursor is, with its text. */
      insertFootnote: (text: string) => ReturnType
      /** The text of the footnote at `pos`; an empty text deletes it. */
      setFootnoteText: (pos: number, text: string) => ReturnType
    }
  }
  interface Storage {
    footnote: FootnoteStorage
  }
}

export interface FootnoteStorage {
  /** Set by the app: opens the footnote window for the footnote at `pos` (a tap on its number). */
  edit: ((pos: number) => void) | null
}

export interface Footnote {
  readonly pos: number
  /** 1, 2, 3… through the document; a mail merge's copies start again. */
  readonly number: number
  readonly text: string
}

const found = new WeakMap<ProseMirrorNode, Footnote[]>()

/** The footnotes in order with their numbers. */
export function footnotesOf(doc: ProseMirrorNode): Footnote[] {
  const known = found.get(doc)
  if (known) return known
  const notes = findFootnotes(doc)
  found.set(doc, notes)
  return notes
}

function findFootnotes(doc: ProseMirrorNode): Footnote[] {
  const notes: Footnote[] = []
  let number = 0
  doc.descendants((node, pos) => {
    if (node.type.name === 'pageBreak' && node.attrs.restart) number = 0
    if (node.type.name === 'footnote') notes.push({ pos, number: ++number, text: String(node.attrs.text ?? '') })
    return true
  })
  return notes
}

/** The same from JSON (writers): text by order. */
export function footnotesOfJson(document: JSONContent): string[] {
  const notes: string[] = []
  const walk = (node: JSONContent) => {
    if (node.type === 'footnote') notes.push(String(node.attrs?.text ?? ''))
    node.content?.forEach(walk)
  }
  walk(document)
  return notes
}

/**
 * Dipnot: a small raised number in the text; its text is shown at the foot of the page it is on
 * (page view and print, `editor/pagination.ts`) or at the end of the document (continuous view,
 * phones). The text is kept in the node itself; a tap on the number edits it.
 */
export const FootnoteNode = Node.create<Record<string, never>, FootnoteStorage>({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addStorage() {
    return { edit: null }
  },

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: element => element.getAttribute('data-footnote') ?? '',
        renderHTML: attributes => ({ 'data-footnote': attributes.text }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, { class: 'footnote-ref', title: `Dipnot: ${node.attrs.text}` })]
  },

  renderText({ node }) {
    return ` (${node.attrs.text})`
  },

  addCommands() {
    return {
      insertFootnote: text => ({ commands }) => (text.trim() ? commands.insertContent({ type: this.name, attrs: { text: text.trim() } }) : false),
      setFootnoteText: (pos, text) => ({ state, tr, dispatch }) => {
        const node = state.doc.nodeAt(pos)
        if (node?.type.name !== this.name) return false
        if (dispatch) {
          if (text.trim()) tr.setNodeAttribute(pos, 'text', text.trim())
          else tr.delete(pos, pos + node.nodeSize)
        }
        return true
      },
    }
  },

  // Where there are no pages on screen (the continuous view, phones), the notes are listed at the end.
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations: state => {
          const notes = footnotesOf(state.doc)
          if (!notes.length) return null
          const key = notes.map(note => `${note.number}:${note.text}`).join('|')
          return DecorationSet.create(state.doc, [Decoration.widget(state.doc.content.size, () => {
            const list = document.createElement('div')
            list.className = 'footnotes-list'
            list.contentEditable = 'false'
            const title = document.createElement('div')
            title.className = 'footnotes-list__title'
            title.textContent = 'Dipnotlar'
            list.append(title, ...notes.map(note => noteItem(note.number, note.text)))
            return list
          }, { side: 2, ignoreSelection: true, key: `footnotes-list-${key}` })])
        },
      },
    })]
  },

  addNodeView() {
    return ({ node, getPos }) => {
      const dom = document.createElement('sup')
      dom.className = 'footnote-ref'
      dom.dataset.footnote = node.attrs.text
      dom.title = `Dipnot: ${node.attrs.text}`
      dom.addEventListener('click', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos !== undefined) this.storage.edit?.(pos)
      })
      return {
        dom,
        update: updated => {
          if (updated.type.name !== this.name) return false
          dom.dataset.footnote = updated.attrs.text
          dom.title = `Dipnot: ${updated.attrs.text}`
          return true
        },
      }
    }
  },
})
