import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mergeField: {
      /** «Ad»: a place for a column of the merge data, where the cursor is. */
      insertMergeField: (name: string) => ReturnType
    }
  }
}

/**
 * A mail-merge field: «Ad» stands for the value of the data's "Ad" column in each copy
 * (`app/mail-merge.ts`). An inline atom, so it moves and is deleted as one piece and takes the
 * text's marks (a bold field is written bold).
 */
export const MergeField = Node.create({
  name: 'mergeField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: element => element.getAttribute('data-merge-field') ?? '',
        renderHTML: attributes => ({ 'data-merge-field': attributes.name }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-merge-field]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'merge-field', title: `Adres-mektup alanı: ${node.attrs.name}` }), `«${node.attrs.name}»`]
  },

  renderText({ node }) {
    return `«${node.attrs.name}»`
  },

  addCommands() {
    return {
      insertMergeField: name => ({ commands }) => commands.insertContent({ type: this.name, attrs: { name } }),
    }
  },
})
