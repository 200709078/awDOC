import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import type { Mark as ProseMirrorMark, Node as ProseMirrorNode, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'

/**
 * Gözden Geçir, as in Word: comments on a stretch of text, and tracked changes (what is typed is
 * marked as inserted, what is deleted stays, struck through, until accepted or rejected). Both
 * live in the document, so they are saved with it and go to Word / LibreOffice files.
 */

export interface CommentEntry {
  readonly id: string
  readonly author: string
  /** ISO date. */
  readonly date: string
  readonly text: string
  readonly done?: boolean
}

export interface ChangeInfo {
  readonly author: string
  readonly date: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    review: {
      /** A comment on the selected text. */
      addComment: (text: string, author: string) => ReturnType
      updateComment: (id: string, changes: Partial<Pick<CommentEntry, 'text' | 'done'>>) => ReturnType
      deleteComment: (id: string) => ReturnType
      /** Değişiklikleri İzle on or off (kept in the document, as Word does). */
      setTrackChanges: (on: boolean, author?: string) => ReturnType
      /** The changes in the selection (or under the cursor; with `all`, the whole document) accepted or rejected. */
      acceptChanges: (all?: boolean) => ReturnType
      rejectChanges: (all?: boolean) => ReturnType
    }
  }
}

/** Skips the tracking of a transaction (accepting, rejecting, a whole new document). */
export const UNTRACKED = 'awdocUntracked'
const trackingKey = new PluginKey('trackChanges')

export function commentsOf(doc: ProseMirrorNode): CommentEntry[] {
  const value = doc.attrs.comments
  return Array.isArray(value) ? value.filter((entry): entry is CommentEntry => Boolean(entry && typeof entry.id === 'string')) : []
}

export function isTracking(doc: ProseMirrorNode): boolean {
  return doc.attrs.track === true
}

/** The text a comment is on, as it is now ('' when it was deleted). */
export function commentedText(doc: ProseMirrorNode, id: string): { text: string; from: number; to: number } {
  let text = ''
  let from = -1
  let to = -1
  doc.descendants((node, pos) => {
    if (!node.isText || !node.marks.some(mark => mark.type.name === 'comment' && mark.attrs.id === id)) return true
    if (from < 0) from = pos
    to = pos + node.nodeSize
    text += node.text
    return false
  })
  return { text, from, to }
}

export function newId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `${prefix}${Date.now().toString(36)}${random}`
}

/** A comment's stretch of text: a mark holding the comment's id; several may overlap. */
export const CommentMark = Mark.create({
  name: 'comment',
  excludes: '',
  inclusive: false,

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: element => element.getAttribute('data-comment') ?? '',
        renderHTML: attributes => ({ 'data-comment': attributes.id }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-mark' }), 0]
  },
})

const changeAttributes = () => ({
  author: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-author') ?? '', renderHTML: (attributes: Record<string, unknown>) => ({ 'data-author': attributes.author }) },
  date: { default: '', parseHTML: (element: HTMLElement) => element.getAttribute('data-date') ?? '', renderHTML: (attributes: Record<string, unknown>) => ({ 'data-date': attributes.date }) },
})

export const InsertionMark = Mark.create({
  name: 'insertion',
  excludes: 'insertion deletion',
  addAttributes: changeAttributes,
  parseHTML() {
    return [{ tag: 'ins[data-author]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['ins', mergeAttributes(HTMLAttributes, { class: 'change-insertion', title: `Eklendi: ${HTMLAttributes['data-author'] ?? ''}` }), 0]
  },
})

export const DeletionMark = Mark.create({
  name: 'deletion',
  excludes: 'deletion insertion',
  addAttributes: changeAttributes,
  parseHTML() {
    return [{ tag: 'del[data-author]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['del', mergeAttributes(HTMLAttributes, { class: 'change-deletion', title: `Silindi: ${HTMLAttributes['data-author'] ?? ''}` }), 0]
  },
})

/** The ranges of marks of one kind in [from, to]: whole marked runs, even where they reach outside. */
function markRanges(doc: ProseMirrorNode, from: number, to: number, names: readonly string[]): { from: number; to: number; mark: ProseMirrorMark }[] {
  const ranges: { from: number; to: number; mark: ProseMirrorMark }[] = []
  const look = (start: number, end: number) => {
    doc.nodesBetween(start, end, (node, pos) => {
      if (!node.isInline) return true
      const mark = node.marks.find(candidate => names.includes(candidate.type.name))
      if (!mark) return false
      const last = ranges.at(-1)
      if (last && last.to === pos && last.mark.eq(mark)) last.to = pos + node.nodeSize
      else if (!ranges.some(range => range.from <= pos && range.to >= pos + node.nodeSize && range.mark.eq(mark))) ranges.push({ from: pos, to: pos + node.nodeSize, mark })
      return false
    })
  }
  look(from, to)
  // A cursor inside a change takes the whole change.
  if (from === to && ranges.length === 0) look(Math.max(0, from - 1), Math.min(doc.content.size, from + 1))
  return ranges
}

/** Accepting or rejecting: the marked text goes or stays, the mark goes. */
function settle(state: EditorState, tr: Transaction, all: boolean, accept: boolean): boolean {
  const { from, to } = all ? { from: 0, to: state.doc.content.size } : state.selection
  const ranges = markRanges(state.doc, from, to, ['insertion', 'deletion'])
  if (!ranges.length) return false
  // From the end, so earlier positions stay right.
  for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
    const removeText = range.mark.type.name === 'insertion' ? !accept : accept
    if (removeText) tr.delete(range.from, range.to)
    else tr.removeMark(range.from, range.to, range.mark.type)
  }
  tr.setMeta(UNTRACKED, true)
  return true
}

/**
 * The stored attributes of the document node and the commands. The comments are a list in the
 * document's `comments` attribute; their stretches of text carry the comment mark.
 */
export const Review = Extension.create<{ author: () => string }>({
  name: 'review',

  addOptions() {
    return { author: () => '' }
  },

  addGlobalAttributes() {
    return [{ types: ['doc'], attributes: { comments: { default: null, rendered: false }, track: { default: null, rendered: false } } }]
  },

  addCommands() {
    return {
      addComment: (text, author) => ({ state, tr, dispatch }) => {
        const { from, to, empty } = state.selection
        if (empty || !text.trim()) return false
        if (dispatch) {
          const id = newId('c')
          tr.addMark(from, to, state.schema.marks.comment.create({ id }))
          tr.setDocAttribute('comments', [...commentsOf(state.doc), { id, author, date: new Date().toISOString(), text: text.trim() }])
          tr.setMeta(UNTRACKED, true)
        }
        return true
      },
      updateComment: (id, changes) => ({ state, tr, dispatch }) => {
        const entries = commentsOf(state.doc)
        if (!entries.some(entry => entry.id === id)) return false
        if (dispatch) tr.setDocAttribute('comments', entries.map(entry => (entry.id === id ? { ...entry, ...changes } : entry))).setMeta(UNTRACKED, true)
        return true
      },
      deleteComment: id => ({ state, tr, dispatch }) => {
        if (dispatch) {
          state.doc.descendants((node, pos) => {
            const mark = node.marks.find(candidate => candidate.type.name === 'comment' && candidate.attrs.id === id)
            if (mark) tr.removeMark(pos, pos + node.nodeSize, mark)
            return true
          })
          tr.setDocAttribute('comments', commentsOf(state.doc).filter(entry => entry.id !== id)).setMeta(UNTRACKED, true)
        }
        return true
      },
      setTrackChanges: on => ({ tr, dispatch }) => {
        if (dispatch) tr.setDocAttribute('track', on ? true : null).setMeta(UNTRACKED, true)
        return true
      },
      acceptChanges: (all = false) => ({ state, tr, dispatch }) => (dispatch ? settle(state, tr, all, true) : markRanges(state.doc, all ? 0 : state.selection.from, all ? state.doc.content.size : state.selection.to, ['insertion', 'deletion']).length > 0),
      rejectChanges: (all = false) => ({ state, tr, dispatch }) => (dispatch ? settle(state, tr, all, false) : markRanges(state.doc, all ? 0 : state.selection.from, all ? state.doc.content.size : state.selection.to, ['insertion', 'deletion']).length > 0),
    }
  },

  addProseMirrorPlugins() {
    const author = this.options.author
    return [new Plugin({
      key: trackingKey,
      appendTransaction: (transactions, before, after) => {
        if (!isTracking(after.doc) || !isTracking(before.doc)) return null
        const changed = transactions.filter(tr => tr.docChanged && !tr.getMeta(UNTRACKED) && !tr.getMeta('history$') && !tr.getMeta('awdocDocumentReplaced'))
        if (!changed.length || changed.length !== transactions.filter(tr => tr.docChanged).length) return null
        return track(transactions, before, after, author())
      },
    })]
  },
})

/** The part of a deleted slice to put back, struck through: text the same author inserted just goes. */
function struckThrough(slice: Slice, deletion: ProseMirrorMark): ProseMirrorNode[] | null {
  if (slice.openStart !== slice.openEnd || slice.content.childCount === 0) return null
  // Only text inside one paragraph (or a few inline pieces) is tracked; a deletion across blocks is not.
  const inline: ProseMirrorNode[] = []
  let ok = true
  slice.content.forEach(node => {
    if (!node.isInline) ok = false
    else if (node.marks.some(mark => mark.type.name === 'insertion')) return
    else inline.push(node.marks.some(mark => mark.type.name === 'deletion') ? node : node.mark(deletion.addToSet(node.marks)))
  })
  return ok ? inline : null
}

/**
 * What a change does when tracked: inserted text gets the insertion mark; deleted text is put back
 * with the deletion mark, before the cursor when deleted backwards (Backspace), after it otherwise.
 * Only text within paragraphs is tracked; splitting or joining paragraphs is not.
 */
function track(transactions: readonly Transaction[], before: EditorState, after: EditorState, author: string): Transaction | null {
  const info = { author: author || 'Yazar', date: new Date().toISOString().replace(/\.\d+Z$/, 'Z') }
  const insertion = after.schema.marks.insertion.create(info)
  const deletion = after.schema.marks.deletion.create(info)
  const tr = after.tr
  // Every step of every transaction: where it inserted (in the final document) and what it deleted.
  const inserted: { from: number; to: number }[] = []
  const deleted: { at: number; nodes: ProseMirrorNode[]; backwards: boolean; pure: boolean }[] = []
  let doc = before.doc
  const steps = transactions.flatMap(transaction => transaction.steps.map((step, index) => ({ step, rest: transaction.mapping.slice(index + 1), transaction })))
  const finalMap = (transaction: Transaction, rest: import('@tiptap/pm/transform').Mapping) => {
    const later = transactions.slice(transactions.indexOf(transaction) + 1)
    return (pos: number, assoc = 1) => later.reduce((value, next) => next.mapping.map(value, assoc), rest.map(pos, assoc))
  }
  for (const { step, rest, transaction } of steps) {
    if (step instanceof ReplaceStep) {
      const map = finalMap(transaction, rest)
      const { from, to } = step as unknown as { from: number; to: number }
      if (to > from) {
        const nodes = struckThrough(doc.slice(from, to), deletion)
        if (nodes?.length) {
          // Backspace: the cursor stood at the end of what went; Delete: at its start.
          const pure = step.slice.size === 0
          deleted.push({ at: map(from, -1), nodes, backwards: pure && before.selection.empty && before.selection.head === to, pure })
        }
      }
      const size = step.slice.size
      if (size > 0) inserted.push({ from: map(from, -1), to: map(from, -1) + size })
    }
    const result = step.apply(doc)
    if (result.doc) doc = result.doc
  }
  if (!inserted.length && !deleted.length) return null
  for (const range of inserted) {
    // Typing on after one's own insertion continues it (one change, not one per key).
    const $from = tr.doc.resolve(Math.min(range.from, tr.doc.content.size))
    const previous = $from.nodeBefore?.marks.find(mark => mark.type.name === 'insertion' && mark.attrs.author === info.author)
    const mark = previous ?? insertion
    tr.doc.nodesBetween(range.from, Math.min(range.to, tr.doc.content.size), (node, pos) => {
      if (node.isInline && !node.marks.some(candidate => candidate.type.name === 'deletion')) {
        tr.addMark(Math.max(pos, range.from), Math.min(pos + node.nodeSize, range.to), mark)
      }
      return true
    })
  }
  let cursor: number | null = null
  for (const removal of [...deleted].sort((a, b) => b.at - a.at)) {
    const size = removal.nodes.reduce((sum, node) => sum + node.nodeSize, 0)
    // Deleting on beside one's own deletion continues it (Backspace, Backspace: one change).
    const $at = tr.doc.resolve(Math.min(removal.at, tr.doc.content.size))
    const near = [$at.nodeAfter, $at.nodeBefore].flatMap(node => node?.marks ?? []).find(mark => mark.type.name === 'deletion' && mark.attrs.author === info.author)
    const nodes = near ? removal.nodes.map(node => (node.marks.includes(deletion) ? node.mark(near.addToSet(node.marks)) : node)) : removal.nodes
    tr.insert(removal.at, nodes)
    // The cursor stays before what Backspace took, after what Delete took (typed text keeps it after itself).
    if (cursor === null && removal.pure) cursor = removal.backwards ? removal.at : removal.at + size
  }
  if (!tr.docChanged) return null
  const head = cursor === null ? tr.mapping.map(after.selection.head) : cursor
  if (after.selection.empty) tr.setSelection(TextSelection.create(tr.doc, Math.min(head, tr.doc.content.size)))
  return tr.setMeta(UNTRACKED, true).setMeta('addToHistory', true)
}
