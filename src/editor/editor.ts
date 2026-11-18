import { Editor, type JSONContent } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { authorName } from '../app/author'
import { AnswerKey } from './answer-key'
import { TableOfContents } from './contents'
import { MergeField } from './merge-field'
import { Formula } from './formula'
import { DocumentImage, ImageCaption, ImageInput } from './image'
import { PageBreak, PageSetupExtension } from './page-setup'
import { PaginationExtension } from './pagination'
import { Choice, Choices, Question, QuestionRow } from './question'
import { ParagraphFormat } from './paragraph-format'
import { CommentMark, DeletionMark, InsertionMark, Review } from './review'
import { Search } from './search'

export const HEADING_LEVELS = [1, 2, 3] as const

/** Meta of the transaction that follows a new document (`replaceDocument`). */
export const DOCUMENT_REPLACED = 'awdocDocumentReplaced'

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
      Search,
      DocumentImage,
      ImageCaption,
      ImageInput,
      // Columns can be widened by dragging their edge.
      TableKit.configure({ table: { resizable: true } }),
      // The page (size, margins, header, footer) is part of the document; page breaks too.
      Formula,
      Question,
      QuestionRow,
      Choices,
      Choice,
      AnswerKey,
      TableOfContents,
      MergeField,
      CommentMark,
      InsertionMark,
      DeletionMark,
      Review.configure({ author: authorName }),
      PageSetupExtension,
      PageBreak,
      PaginationExtension,
    ],
    content: EMPTY_DOCUMENT,
    editorProps: {
      // Ahead of every key binding (Enter, Tab, Ctrl+Enter, Ctrl+B…): see a selection the keyboard
      // has just made (End, Shift+Home) before acting on it. Typed letters go through the DOM anyway.
      handleKeyDown: (view, event) => {
        if (!event.isComposing && event.keyCode !== 229 && (event.key.length > 1 || event.ctrlKey || event.metaKey || event.altKey)) readPendingSelection(view)
        return false
      },
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

/**
 * ProseMirror reads a selection made by the keyboard a moment later (on `selectionchange`); a key
 * pressed right after (End, then Ctrl+Enter) would act on the old one. This reads it now.
 */
export function readPendingSelection(view: EditorView): void {
  ;(view as unknown as { domObserver?: { flush?(): void } }).domObserver?.flush?.()
}

/** The editor's model of `content`; throws when it holds something the editor does not know. */
export function documentNode(editor: Editor, content: JSONContent): ProseMirrorNode {
  const node = editor.schema.nodeFromJSON(content)
  node.check()
  return node
}

/**
 * Puts a whole new document in the editor with a new state, so undo has no history that leads
 * back to the one before. No update event (the document is as it was in its file), but a
 * transaction marked `DOCUMENT_REPLACED`.
 */
export function replaceDocument(editor: Editor, node: ProseMirrorNode): void {
  editor.view.updateState(EditorState.create({ doc: node, plugins: editor.state.plugins, selection: TextSelection.atStart(node) }))
  // A transaction that changes nothing, so the page view and the toolbar look at the new document.
  editor.view.dispatch(editor.state.tr.setMeta(DOCUMENT_REPLACED, true).setMeta('addToHistory', false))
}
