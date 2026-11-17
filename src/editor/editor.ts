import { Editor, type JSONContent } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { ParagraphFormat } from './paragraph-format'

export const HEADING_LEVELS = [1, 2, 3] as const

/** An empty document: one empty paragraph. */
export const EMPTY_DOCUMENT: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

/**
 * The editor: TipTap (ProseMirror) with the features of the first stage. New features are TipTap
 * extensions added here; the document model they make is what `formats/` reads and writes.
 */
export function createEditor(element: HTMLElement): Editor {
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [...HEADING_LEVELS] },
        // A link is followed only on purpose; a tap in the text is for writing.
        link: { openOnClick: false },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
      // Font, size and colour live on one inline style; a highlight is a mark of its own colour.
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      ParagraphFormat,
    ],
    content: EMPTY_DOCUMENT,
    autofocus: 'start',
    editorProps: {
      attributes: {
        class: 'document',
        id: 'document',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Belge',
        lang: 'tr',
        spellcheck: 'true',
      },
    },
  })
}

/** The editor's model of `content`; throws when it holds something the editor does not know. */
export function documentNode(editor: Editor, content: JSONContent): ProseMirrorNode {
  const node = editor.schema.nodeFromJSON(content)
  node.check()
  return node
}

/**
 * Puts a whole new document in the editor with a new state, so undo has no history that leads
 * back to the one before. No update event: the document is as it was in its file.
 */
export function replaceDocument(editor: Editor, node: ProseMirrorNode): void {
  editor.view.updateState(EditorState.create({ doc: node, plugins: editor.state.plugins, selection: TextSelection.atStart(node) }))
}
