import { Node, type JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      /** İki Sütun: from the cursor's block on, two columns (on again: back to one). */
      toggleTwoColumns: () => ReturnType
    }
  }
}

/** Where the two columns begin (a top-level position), or null for one column throughout. */
export function columnsStartOf(doc: ProseMirrorNode): number | null {
  let start: number | null = null
  doc.forEach((child, offset) => {
    if (start === null && child.type.name === 'columnsStart') start = offset
  })
  return start
}

export function hasColumns(document: JSONContent): boolean {
  return (document.content ?? []).some(block => block.type === 'columnsStart')
}

/** Room between the two columns, in CSS pixels (6.35 mm, Word's 0,64 cm is close). */
export const COLUMN_GAP = 24

/**
 * Two columns from here on (the user's choice, 2026-11-18: our own layout): an exam paper's title
 * and student table stay the page's width, the questions run in two columns. The marker itself
 * takes no room on the pages; what follows it is laid out half as wide (`in-columns`) and moved
 * into its column and page by the layout (`editor/pagination.ts`); paper uses the browser's columns
 * with the same column breaks.
 */
export const ColumnsStart = Node.create({
  name: 'columnsStart',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-columns-start]' }]
  },

  renderHTML() {
    return ['div', { 'data-columns-start': '', class: 'columns-start', contenteditable: 'false', title: 'İki sütun buradan başlar' }]
  },

  renderText() {
    return ''
  },

  addCommands() {
    return {
      toggleTwoColumns: () => ({ state, tr, dispatch }) => {
        const existing = columnsStartOf(state.doc)
        if (dispatch) {
          if (existing !== null) {
            tr.delete(existing, existing + state.doc.nodeAt(existing)!.nodeSize)
          } else {
            const $from = state.selection.$from
            const at = $from.depth ? $from.before(1) : 0
            tr.insert(at, this.type.create())
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at + 2, tr.doc.content.size))))
          }
          tr.scrollIntoView()
        }
        return true
      },
    }
  },

  // What follows the marker is half as wide; what precedes it spans both columns on paper.
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations: state => {
          const start = columnsStartOf(state.doc)
          if (start === null) return null
          const decorations: Decoration[] = []
          state.doc.forEach((child, offset) => {
            if (offset === start) return
            decorations.push(Decoration.node(offset, offset + child.nodeSize, { class: offset < start ? 'before-columns' : 'in-columns' }))
          })
          return DecorationSet.create(state.doc, decorations)
        },
      },
    })]
  },
})
