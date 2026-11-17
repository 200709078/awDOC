import { Node, mergeAttributes, type Editor, type JSONContent } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode, type ResolvedPos } from '@tiptap/pm/model'
import { Plugin, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type ChoicesLayout = 'list' | 'row' | 'grid'
export const CHOICES_LAYOUTS: readonly ChoicesLayout[] = ['list', 'row', 'grid']
/** A to F: Turkish exams have four (A–D) or five (A–E). */
export const MAX_CHOICES = 6
export const DEFAULT_CHOICES = 5

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    question: {
      /** A new question after the block the cursor is in (in place of an empty paragraph); `choices` 0 for open-ended. */
      insertQuestion: (choices: number) => ReturnType
      /** A new choice after the one the cursor is in, or the first ones for an open-ended question. */
      addChoice: () => ReturnType
      /** The choice the cursor is in goes; with the last one, the choices go. */
      removeChoice: () => ReturnType
      setChoicesLayout: (layout: ChoicesLayout) => ReturnType
      /** Points of the question the cursor is in; null for none. */
      setQuestionPoints: (points: number | null) => ReturnType
      /** The question swaps places with the one before (-1) or after (1). */
      moveQuestion: (direction: -1 | 1) => ReturnType
      deleteQuestion: () => ReturnType
      /** Marks the choice the cursor is in as the right answer (the only one of its question); again, unmarks it. */
      toggleCorrectChoice: () => ReturnType
      /** Two open-ended questions side by side, after the block the cursor is in. */
      insertQuestionRow: () => ReturnType
      /** The question the cursor is in and the next one go side by side. */
      pairWithNextQuestion: () => ReturnType
      /** Two questions side by side go back one under the other. */
      unpairQuestions: () => ReturnType
      /** A question (or pair) from the question bank, after the block the cursor is in. */
      insertQuestionBlock: (content: JSONContent) => ReturnType
    }
  }
}

/** The question around a position: its node, its position and its depth. */
export function questionAt($pos: ResolvedPos): { node: ProseMirrorNode; pos: number; depth: number } | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (node.type.name === 'question') return { node, pos: $pos.before(depth), depth }
  }
  return null
}

/**
 * The block of the document a question stands in: the question itself, or the pair of questions
 * side by side it is part of. Moving and leaving work on this.
 */
export function questionBlockAt($pos: ResolvedPos): { node: ProseMirrorNode; pos: number } | null {
  const question = questionAt($pos)
  if (!question) return null
  if (question.depth === 1) return { node: question.node, pos: question.pos }
  if (question.depth === 2 && $pos.node(1).type.name === 'questionRow') return { node: $pos.node(1), pos: $pos.before(1) }
  return null
}

function rowAt($pos: ResolvedPos): { node: ProseMirrorNode; pos: number } | null {
  return $pos.depth >= 1 && $pos.node(1).type.name === 'questionRow' ? { node: $pos.node(1), pos: $pos.before(1) } : null
}

function choiceDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth--) if ($pos.node(depth).type.name === 'choice') return depth
  return null
}

function choicesOf(question: ProseMirrorNode): { node: ProseMirrorNode; offset: number } | null {
  let found: { node: ProseMirrorNode; offset: number } | null = null
  question.forEach((child, offset) => { if (child.type.name === 'choices') found = { node: child, offset } })
  return found
}

export function currentQuestion(state: EditorState): ProseMirrorNode | null {
  return questionAt(state.selection.$from)?.node ?? null
}

const LETTERS = 'ABCDEF'

/** Each question's right answer in order: its letter, "?" when none is marked, null for an open-ended question. */
export function answersOf(doc: ProseMirrorNode): (string | null)[] {
  const answers: (string | null)[] = []
  doc.descendants(node => {
    if (node.type.name !== 'question') return true
    const choices = node.lastChild?.type.name === 'choices' ? node.lastChild : null
    if (!choices) answers.push(null)
    else {
      let letter = '?'
      choices.forEach((choice, _offset, index) => { if (choice.attrs.correct) letter = LETTERS[index] ?? '?' })
      answers.push(letter)
    }
    return false
  })
  return answers
}

/** The points of every question, added up. */
export function totalPoints(doc: ProseMirrorNode): number {
  let total = 0
  doc.descendants(node => {
    if (node.type.name === 'question') total += Number(node.attrs.points) || 0
    return node.type.name !== 'question'
  })
  return total
}

/** Puts the cursor in the textblock that starts at (or just after) `pos`. */
function cursorInto(tr: Transaction, pos: number): void {
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))))
}

/** An empty question; with `count` empty choices (0: open-ended). */
function newQuestion(state: EditorState, count: number): ProseMirrorNode {
  const { schema } = state
  const parts: ProseMirrorNode[] = [schema.nodes.paragraph.create()]
  if (count > 0) parts.push(schema.nodes.choices.create(null, Array.from({ length: Math.min(count, MAX_CHOICES) }, () => schema.nodes.choice.create())))
  return schema.nodes.question.create(null, parts)
}

/**
 * Puts a question (or a pair) after the question or top-level block the cursor is in, in place of
 * an empty paragraph, with a paragraph after it so writing goes on below; the cursor goes
 * `inside` positions into it (its first paragraph).
 */
function placeQuestionBlock(state: EditorState, tr: Transaction, block: ProseMirrorNode, inside: number): void {
  const { $from } = state.selection
  const top = $from.depth > 0 ? { node: $from.node(1), pos: $from.before(1) } : null
  let at: number
  if (top && top.node.type.name === 'paragraph' && top.node.content.size === 0) {
    tr.delete(top.pos, top.pos + top.node.nodeSize)
    at = top.pos
  } else at = top ? top.pos + top.node.nodeSize : $from.pos
  tr.insert(at, block)
  const after = at + block.nodeSize
  if (after >= tr.doc.content.size || tr.doc.resolve(after).nodeAfter?.type.name !== 'paragraph') {
    tr.insert(after, state.schema.nodes.paragraph.create())
  }
  cursorInto(tr, at + inside)
  tr.scrollIntoView()
}

/** Two questions side by side, as a pair of columns; numbered left, then right. */
export const QuestionRow = Node.create({
  name: 'questionRow',
  group: 'block',
  content: 'question question',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-question-row]', priority: 60 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-question-row': '', class: 'question-row' }), 0]
  },
})

/** One choice of a multiple-choice question; its letter (A, B…) comes from its place. */
export const Choice = Node.create({
  name: 'choice',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      correct: {
        default: false,
        parseHTML: element => element.hasAttribute('data-correct'),
        renderHTML: attributes => (attributes.correct ? { 'data-correct': '' } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-choice]', priority: 60 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-choice': '', class: 'choice' }), 0]
  },
})

/** The choices of a question, one under another, side by side or in two columns. */
export const Choices = Node.create({
  name: 'choices',
  content: 'choice+',
  defining: true,

  addAttributes() {
    return {
      layout: {
        default: 'list',
        parseHTML: element => {
          const layout = element.getAttribute('data-layout') as ChoicesLayout
          return CHOICES_LAYOUTS.includes(layout) ? layout : 'list'
        },
        renderHTML: attributes => ({ 'data-layout': attributes.layout }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-choices]', priority: 60 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-choices': '', class: 'choices' }), 0]
  },
})

/**
 * A question: its text (paragraphs, lists, tables, pictures, formulas) and, for a multiple-choice
 * one, its choices last. Numbered by its place in the document; points are optional.
 */
export const Question = Node.create({
  name: 'question',
  // Its keys (Tab, Enter in a choice) come before the paragraph's Tab (indent).
  priority: 110,
  group: 'block',
  content: '(paragraph | bulletList | orderedList | table)+ choices?',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      points: {
        default: null,
        parseHTML: element => {
          const points = Number(element.getAttribute('data-points'))
          return Number.isFinite(points) && points > 0 ? points : null
        },
        renderHTML: attributes => (attributes.points ? { 'data-points': String(attributes.points).replace('.', ',') } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-question]', priority: 60 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-question': '', class: 'question' }), 0]
  },

  addCommands() {
    return {
      insertQuestion: count => ({ state, tr, dispatch }) => {
        if (dispatch) placeQuestionBlock(state, tr, newQuestion(state, count), 2)
        return true
      },

      addChoice: () => ({ state, tr, dispatch }) => {
        const { $from } = state.selection
        const question = questionAt($from)
        if (!question) return false
        const { schema } = state
        const depth = choiceDepth($from)
        const existing = choicesOf(question.node)
        if (existing && existing.node.childCount >= MAX_CHOICES) return false
        if (dispatch) {
          let at: number
          if (depth !== null) {
            at = $from.after(depth)
            tr.insert(at, schema.nodes.choice.create())
          } else if (existing) {
            at = question.pos + 1 + existing.offset + existing.node.nodeSize - 1
            tr.insert(at, schema.nodes.choice.create())
          } else {
            at = question.pos + question.node.nodeSize - 1
            tr.insert(at, schema.nodes.choices.create(null, [schema.nodes.choice.create()]))
            at += 1
          }
          cursorInto(tr, at + 1)
        }
        return true
      },

      removeChoice: () => ({ state, tr, dispatch }) => {
        const { $from } = state.selection
        const depth = choiceDepth($from)
        if (depth === null) return false
        if (dispatch) {
          const choices = $from.node(depth - 1)
          if (choices.childCount === 1) {
            const start = $from.before(depth - 1)
            tr.delete(start, start + choices.nodeSize)
            cursorInto(tr, start - 1)
          } else {
            const start = $from.before(depth)
            tr.delete(start, start + $from.node(depth).nodeSize)
            cursorInto(tr, start)
          }
        }
        return true
      },

      setChoicesLayout: layout => ({ state, tr, dispatch }) => {
        const question = questionAt(state.selection.$from)
        const choices = question && choicesOf(question.node)
        if (!question || !choices) return false
        if (dispatch) tr.setNodeAttribute(question.pos + 1 + choices.offset, 'layout', layout)
        return true
      },

      setQuestionPoints: points => ({ state, tr, dispatch }) => {
        const question = questionAt(state.selection.$from)
        if (!question) return false
        if (dispatch) tr.setNodeAttribute(question.pos, 'points', points && points > 0 ? points : null)
        return true
      },

      moveQuestion: direction => ({ state, tr, dispatch }) => {
        const question = questionBlockAt(state.selection.$from)
        if (!question) return false
        const $question = state.doc.resolve(question.pos)
        const index = $question.index(0)
        const neighbour = state.doc.maybeChild(index + direction)
        if (!neighbour) return false
        if (dispatch) {
          const offsetInQuestion = state.selection.from - question.pos
          const from = direction < 0 ? question.pos - neighbour.nodeSize : question.pos
          const to = direction < 0 ? question.pos + question.node.nodeSize : question.pos + question.node.nodeSize + neighbour.nodeSize
          const swapped = direction < 0 ? Fragment.from([question.node, neighbour]) : Fragment.from([neighbour, question.node])
          tr.replaceWith(from, to, swapped)
          const newStart = direction < 0 ? from : from + neighbour.nodeSize
          cursorInto(tr, newStart + offsetInQuestion)
          tr.scrollIntoView()
        }
        return true
      },

      toggleCorrectChoice: () => ({ state, tr, dispatch }) => {
        const { $from } = state.selection
        const depth = choiceDepth($from)
        if (depth === null) return false
        if (dispatch) {
          const mark = !$from.node(depth).attrs.correct
          const choices = $from.node(depth - 1)
          let pos = $from.before(depth - 1) + 1
          choices.forEach((choice, _offset, index) => {
            const wanted = mark && index === $from.index(depth - 1)
            if (Boolean(choice.attrs.correct) !== wanted) tr.setNodeAttribute(pos, 'correct', wanted)
            pos += choice.nodeSize
          })
        }
        return true
      },

      insertQuestionBlock: content => ({ state, tr, dispatch }) => {
        let block: ProseMirrorNode
        try {
          block = state.schema.nodeFromJSON(content)
          block.check()
        } catch {
          return false
        }
        if (block.type.name !== 'question' && block.type.name !== 'questionRow') return false
        if (dispatch) placeQuestionBlock(state, tr, block, block.type.name === 'questionRow' ? 3 : 2)
        return true
      },

      insertQuestionRow: () => ({ state, tr, dispatch }) => {
        if (dispatch) {
          const row = state.schema.nodes.questionRow.create(null, [newQuestion(state, 0), newQuestion(state, 0)])
          placeQuestionBlock(state, tr, row, 3)
        }
        return true
      },

      pairWithNextQuestion: () => ({ state, tr, dispatch }) => {
        const question = questionAt(state.selection.$from)
        if (!question || question.depth !== 1) return false
        const index = state.doc.resolve(question.pos).index(0)
        const next = state.doc.maybeChild(index + 1)
        if (next?.type.name !== 'question') return false
        if (dispatch) {
          const offset = state.selection.from - question.pos
          tr.replaceWith(question.pos, question.pos + question.node.nodeSize + next.nodeSize, this.editor.schema.nodes.questionRow.create(null, [question.node, next]))
          cursorInto(tr, question.pos + 1 + offset)
        }
        return true
      },

      unpairQuestions: () => ({ state, tr, dispatch }) => {
        const row = rowAt(state.selection.$from)
        if (!row) return false
        if (dispatch) {
          const offset = state.selection.from - row.pos
          tr.replaceWith(row.pos, row.pos + row.node.nodeSize, row.node.content)
          cursorInto(tr, row.pos + offset - 1)
        }
        return true
      },

      deleteQuestion: () => ({ state, tr, dispatch }) => {
        const question = questionAt(state.selection.$from)
        if (!question) return false
        const row = rowAt(state.selection.$from)
        if (row && dispatch) {
          // Out of a pair, the other question stays, on its own.
          const other = row.node.child(state.selection.$from.index(1) === 0 ? 1 : 0)
          tr.replaceWith(row.pos, row.pos + row.node.nodeSize, other)
          cursorInto(tr, row.pos + 2)
          return true
        }
        if (dispatch) {
          tr.delete(question.pos, question.pos + question.node.nodeSize)
          if (tr.doc.childCount === 0) tr.insert(0, state.schema.nodes.paragraph.create())
          cursorInto(tr, question.pos)
        }
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          // The question the cursor is in, marked for the screen (a line in its margin).
          decorations: state => {
            const question = questionAt(state.selection.$from)
            return question ? DecorationSet.create(state.doc, [Decoration.node(question.pos, question.pos + question.node.nodeSize, { class: 'has-cursor' })]) : null
          },
        },
      }),
    ]
  },

  addKeyboardShortcuts() {
    const editor = this.editor as Editor
    /** The cursor to the end of the choice `step` places away; false when there is none. */
    const toChoice = (step: -1 | 1) => {
      const { $from } = editor.state.selection
      const depth = choiceDepth($from)
      if (depth === null) return false
      const choices = $from.node(depth - 1)
      const index = $from.index(depth - 1) + step
      if (index < 0 || index >= choices.childCount) return false
      let pos = $from.before(depth - 1) + 1
      for (let i = 0; i < index; i++) pos += choices.child(i).nodeSize
      return editor.chain().command(({ tr }) => {
        tr.setSelection(TextSelection.create(tr.doc, pos + 1 + choices.child(index).content.size))
        tr.scrollIntoView()
        return true
      }).run()
    }
    return {
      // Tab / Shift+Tab go from choice to choice, as in a form.
      Tab: () => (choiceDepth(editor.state.selection.$from) === null ? false : (toChoice(1), true)),
      'Shift-Tab': () => (choiceDepth(editor.state.selection.$from) === null ? false : (toChoice(-1), true)),
      Enter: () => {
        const { $from, empty } = editor.state.selection
        const depth = choiceDepth($from)
        if (!empty || depth === null) return false
        const choices = $from.node(depth - 1)
        const last = $from.index(depth - 1) === choices.childCount - 1
        const full = choices.childCount >= MAX_CHOICES
        /** Out of the question, into the paragraph below it; `dropChoice` removes the (empty) choice first. */
        const leave = (dropChoice: boolean) => {
          const question = questionBlockAt($from)
          return editor.chain().command(({ tr }) => {
            if (dropChoice) {
              const start = $from.before(depth)
              tr.delete(start, start + $from.parent.nodeSize)
            }
            if (question) {
              const after = tr.mapping.map(question.pos + question.node.nodeSize)
              const next = tr.doc.resolve(after).nodeAfter
              if (next?.type.name !== 'paragraph' || next.content.size > 0) tr.insert(after, editor.schema.nodes.paragraph.create())
              cursorInto(tr, after + 1)
            }
            return true
          }).run()
        }
        if ($from.parent.content.size > 0) {
          // In the middle of a choice: a split would be a new choice; with no room for one, nothing.
          if ($from.parentOffset !== $from.parent.content.size) return full
          // At the end of a written choice: on to the next one while it is still empty (the new
          // question's A–E are there to be filled); after the last, a new choice, or out when full.
          if (!last && choices.child($from.index(depth - 1) + 1).content.size === 0) return toChoice(1)
          if (last && full) return leave(false)
          return full ? toChoice(1) : false
        }
        // Enter in an empty last choice leaves the question, as Enter in an empty list item leaves the list.
        if (!last || choices.childCount < 2) return false
        return leave(true)
      },
      // Backspace at the start of a choice: an empty one goes; a written one stays (it would merge into the question's text).
      Backspace: () => {
        const { $from, empty } = editor.state.selection
        const depth = choiceDepth($from)
        if (!empty || depth === null || $from.parentOffset > 0) return false
        if ($from.parent.content.size === 0) return editor.commands.removeChoice()
        return $from.index(depth - 1) === 0
      },
    }
  },
})
