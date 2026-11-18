import { Node, type JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      /** İçindekiler where the cursor is (in place of an empty paragraph); where there is one, the cursor goes to it. */
      insertTableOfContents: () => ReturnType
    }
  }
  interface Storage {
    tableOfContents: ContentsStorage
  }
}

export interface ContentsStorage {
  /** Set by the app: the page a position is on, or null where the screen has no pages (a phone). */
  pageOf: ((pos: number) => number | null) | null
  /** The lists drawn now; the app redraws them when the pages change. */
  readonly redraws: Set<() => void>
}

export interface ContentsEntry {
  readonly pos: number
  readonly level: number
  readonly text: string
}

/** The headings, in order: what İçindekiler lists. */
export function headingsOf(doc: ProseMirrorNode): ContentsEntry[] {
  const entries: ContentsEntry[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const text = node.textContent.replace(/\s+/g, ' ').trim()
      if (text) entries.push({ pos, level: Number(node.attrs.level) || 1, text })
      return false
    }
    return node.type.name !== 'table'
  })
  return entries
}

/** The same from a document's JSON (for the Word and LibreOffice writers). */
export function headingsOfJson(document: JSONContent): { level: number; text: string }[] {
  const entries: { level: number; text: string }[] = []
  const textOf = (node: JSONContent): string => (node.type === 'text' ? node.text ?? '' : (node.content ?? []).map(textOf).join(''))
  const walk = (node: JSONContent) => {
    if (node.type === 'heading') {
      const text = textOf(node).replace(/\s+/g, ' ').trim()
      if (text) entries.push({ level: Number(node.attrs?.level) || 1, text })
      return
    }
    if (node.type !== 'table') node.content?.forEach(walk)
  }
  walk(document)
  return entries
}

/** Redraws every İçindekiler (the pages moved). */
export function redrawContents(storage: ContentsStorage): void {
  for (const redraw of storage.redraws) redraw()
}

/**
 * İçindekiler: the document's headings with their page numbers, always up to date (drawn from the
 * headings and the page layout, so it holds nothing of its own). A click on an entry goes there.
 */
export const TableOfContents = Node.create<Record<string, never>, ContentsStorage>({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return { pageOf: null, redraws: new Set() }
  },

  parseHTML() {
    return [{ tag: 'div[data-contents]' }]
  },

  renderHTML() {
    return ['div', { 'data-contents': '', class: 'contents' }, 'İçindekiler']
  },

  renderText() {
    return 'İçindekiler'
  },

  addCommands() {
    return {
      insertTableOfContents: () => ({ state, tr, dispatch }) => {
        let existing = -1
        state.doc.forEach((child, offset) => { if (existing < 0 && child.type.name === this.name) existing = offset })
        if (dispatch) {
          if (existing < 0) {
            // At the top level, where the cursor's block is: in place of it when it is an empty paragraph.
            const $from = state.selection.$from
            const depth = Math.min(1, $from.depth)
            const block = depth ? $from.node(1) : null
            const start = depth ? $from.before(1) : 0
            const empty = block?.type.name === 'paragraph' && block.content.size === 0
            const at = !block ? 0 : empty ? start : $from.after(1)
            const node = this.type.create()
            if (empty) tr.replaceWith(start, start + block!.nodeSize, [node, state.schema.nodes.paragraph.create()])
            else tr.insert(at, node)
            existing = at
          }
          tr.setSelection(NodeSelection.create(tr.doc, existing))
          tr.scrollIntoView()
        }
        return true
      },
    }
  },

  addNodeView() {
    return ({ editor }) => {
      const storage = this.storage
      const dom = document.createElement('div')
      dom.className = 'contents'
      dom.dataset.contents = ''
      dom.contentEditable = 'false'
      const title = document.createElement('div')
      title.className = 'contents__title'
      title.textContent = 'İçindekiler'
      const list = document.createElement('div')
      list.className = 'contents__list'
      dom.append(title, list)
      let shown = ''
      const draw = () => {
        const entries = headingsOf(editor.state.doc)
        const pages = entries.map(entry => storage.pageOf?.(entry.pos) ?? null)
        const key = JSON.stringify([entries.map(entry => [entry.level, entry.text]), pages])
        if (key === shown) return
        shown = key
        list.replaceChildren(...entries.map((entry, index) => {
          const item = document.createElement('button')
          item.type = 'button'
          item.className = `contents__entry contents__entry--${entry.level}`
          const text = document.createElement('span')
          text.className = 'contents__text'
          text.textContent = entry.text
          const leader = document.createElement('span')
          leader.className = 'contents__leader'
          const page = document.createElement('span')
          page.className = 'contents__page'
          page.textContent = pages[index] === null ? '' : String(pages[index])
          item.append(text, leader, page)
          // The heading's place now (the list may be older than the last edit).
          item.addEventListener('mousedown', event => event.preventDefault())
          item.addEventListener('click', () => {
            const target = headingsOf(editor.state.doc)[index]
            if (!target) return
            const { tr } = editor.state
            tr.setSelection(TextSelection.create(tr.doc, target.pos + 1)).scrollIntoView()
            editor.view.dispatch(tr)
            editor.view.focus()
          })
          return item
        }))
        if (!entries.length) {
          const empty = document.createElement('div')
          empty.className = 'contents__empty'
          empty.textContent = 'Belgede henüz başlık yok. Paragraf ▾ → Başlık 1, 2, 3 ile yazılan başlıklar burada listelenir.'
          list.append(empty)
        }
      }
      draw()
      editor.on('update', draw)
      storage.redraws.add(draw)
      return {
        dom,
        ignoreMutation: () => true,
        stopEvent: event => event.type === 'mousedown' || event.type === 'click',
        destroy: () => {
          editor.off('update', draw)
          storage.redraws.delete(draw)
        },
      }
    }
  },
})
