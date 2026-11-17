import { Node, mergeAttributes } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { loadMath } from '../math/load'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    formula: {
      /** Puts a formula where the cursor is (in place of a selected one). */
      insertFormula: (latex: string) => ReturnType
    }
  }
  interface Storage {
    formula: FormulaStorage
  }
}

export interface FormulaStorage {
  /** Set by the app: opens the formula window for the formula at `pos` (double click, Enter). */
  edit: ((pos: number) => void) | null
}

/**
 * A formula: an inline node holding its LaTeX. On screen it is drawn by MathLive (loaded the first
 * time a formula is seen); its text for copying, plain text and search is the LaTeX itself.
 */
export const Formula = Node.create<Record<string, never>, FormulaStorage>({
  name: 'formula',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return { edit: null }
  },

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: element => element.getAttribute('data-latex') ?? element.textContent ?? '',
        renderHTML: attributes => ({ 'data-latex': attributes.latex }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-formula]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-formula': '', class: 'formula' }), String(node.attrs.latex)]
  },

  renderText({ node }) {
    return String(node.attrs.latex)
  },

  addCommands() {
    return {
      insertFormula: latex => ({ commands }) => commands.insertContent({ type: this.name, attrs: { latex } }),
    }
  },

  addKeyboardShortcuts() {
    // Enter on a selected formula opens it, as a double click does.
    const editSelected = () => {
      const { selection } = this.editor.state
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name || !this.storage.edit) return false
      this.storage.edit(selection.from)
      return true
    }
    return { Enter: editSelected }
  },

  addNodeView() {
    return ({ node, getPos }) => {
      const dom = document.createElement('span')
      dom.className = 'formula'
      dom.dataset.formula = ''
      dom.contentEditable = 'false'
      let latex = String(node.attrs.latex)
      const draw = () => {
        dom.dataset.latex = latex
        dom.title = 'Formül (düzenlemek için çift tıklayın)'
        // The LaTeX shows until MathLive has come; a formula it cannot read stays as LaTeX, marked.
        dom.textContent = latex
        void loadMath().then(math => {
          if (dom.dataset.latex !== latex) return
          try {
            dom.innerHTML = math.toMarkup(latex)
            dom.classList.remove('is-wrong')
          } catch {
            dom.classList.add('is-wrong')
          }
        })
      }
      draw()
      dom.addEventListener('dblclick', event => {
        event.preventDefault()
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (typeof pos === 'number') this.storage.edit?.(pos)
      })
      return {
        dom,
        update: updated => {
          if (updated.type !== node.type) return false
          if (updated.attrs.latex !== latex) {
            latex = String(updated.attrs.latex)
            draw()
          }
          return true
        },
        ignoreMutation: () => true,
      }
    }
  },
})
