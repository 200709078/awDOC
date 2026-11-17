import { Extension } from '@tiptap/core'

/** Word's default step: one indent is 1,27 cm. */
export const INDENT_STEP_PT = 36
export const MAX_INDENT = 8
/** The document's own line spacing (app.css `.document`); choosing it removes the setting. */
export const DEFAULT_LINE_HEIGHT = '1.15'
export const LINE_HEIGHTS = ['1', '1.15', '1.5', '2'] as const

const BLOCKS = ['paragraph', 'heading']

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      /** Line spacing of the paragraphs in the selection, such as "1.5". */
      setLineHeight: (lineHeight: string) => ReturnType
      unsetLineHeight: () => ReturnType
      /** One step further in; in a list the item moves under the one before. */
      indent: () => ReturnType
      outdent: () => ReturnType
    }
  }
}

/**
 * Paragraph settings Word has and StarterKit does not: line spacing and indent, as attributes of
 * paragraphs and headings, so they are saved with the document.
 */
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [{
      types: BLOCKS,
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: element => element.style.lineHeight || null,
          renderHTML: attributes => (attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {}),
        },
        indent: {
          default: 0,
          parseHTML: element => Math.min(MAX_INDENT, Math.max(0, Math.round(Number.parseFloat(element.style.marginLeft) / INDENT_STEP_PT) || 0)),
          renderHTML: attributes => (attributes.indent ? { style: `margin-left: ${attributes.indent * INDENT_STEP_PT}pt` } : {}),
        },
      },
    }]
  },

  addCommands() {
    // `commands` here, not `editor.commands`: they join this transaction, and a dry run (`can()`)
    // stays a dry run instead of changing the document.
    const shift = (delta: number) => (): import('@tiptap/core').Command => ({ commands, editor, state, tr }) => {
      if (editor.isActive('listItem')) {
        return delta > 0 ? commands.sinkListItem('listItem') : commands.liftListItem('listItem')
      }
      let changed = false
      const { from, to } = state.selection
      state.doc.nodesBetween(from, to, (node, position) => {
        if (!BLOCKS.includes(node.type.name)) return true
        const indent = Math.min(MAX_INDENT, Math.max(0, Number(node.attrs.indent ?? 0) + delta))
        if (indent !== node.attrs.indent) {
          tr.setNodeMarkup(position, undefined, { ...node.attrs, indent })
          changed = true
        }
        return false
      })
      return changed
    }
    return {
      setLineHeight: lineHeight => ({ commands }) => BLOCKS.map(type => commands.updateAttributes(type, { lineHeight })).some(Boolean),
      unsetLineHeight: () => ({ commands }) => BLOCKS.map(type => commands.resetAttributes(type, 'lineHeight')).some(Boolean),
      indent: shift(1),
      outdent: shift(-1),
    }
  },

  // Tab never leaves the document, as in Word: it indents, or moves a list item.
  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent() || true,
      'Shift-Tab': () => this.editor.commands.outdent() || true,
    }
  },
})
