import type { JSONContent } from '@tiptap/core'

export interface BookletOptions {
  /** Questions change places among their neighbours. */
  readonly questions: boolean
  /** Each multiple-choice question's choices change places; the right one stays marked. */
  readonly choices: boolean
  /** "B Kitapçığı", written in the page header. */
  readonly label: string
}

const isQuestionBlock = (node: JSONContent) => node.type === 'question' || node.type === 'questionRow'
const isEmptyParagraph = (node: JSONContent) => node.type === 'paragraph' && !(node.content?.length)

/** A new order of `items` (Fisher–Yates); with two or more, never the order they came in. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  if (items.length < 2) return [...items]
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    if (result.some((item, index) => item !== items[index])) return result
  }
  // Unlucky (or a fixed `random`): the last one goes first.
  return [items[items.length - 1], ...items.slice(0, -1)]
}

function withShuffledChoices(question: JSONContent, random: () => number): JSONContent {
  const content = (question.content ?? []).map(part => (part.type === 'choices' ? { ...part, content: shuffled(part.content ?? [], random) } : part))
  return { ...question, content }
}

function shuffleChoicesIn(block: JSONContent, random: () => number): JSONContent {
  if (block.type === 'question') return withShuffledChoices(block, random)
  if (block.type === 'questionRow') return { ...block, content: (block.content ?? []).map(question => withShuffledChoices(question, random)) }
  return block
}

/**
 * The B booklet of an exam paper: the same paper with the questions in another order, within each
 * run of questions (a heading or written text between them keeps the parts apart, empty
 * paragraphs do not), and each question's choices in another order. Everything else (the header,
 * the student table, directions, the answer key) stays where it is; the answer key follows the
 * new order by itself.
 */
export function makeBooklet(document: JSONContent, options: BookletOptions, random: () => number = Math.random): JSONContent {
  const blocks = (document.content ?? []).map(block => (options.choices ? shuffleChoicesIn(block, random) : block))
  if (options.questions) {
    let run: number[] = []
    const flush = () => {
      const order = shuffled(run.map(index => blocks[index]), random)
      run.forEach((index, i) => { blocks[index] = order[i] })
      run = []
    }
    blocks.forEach((block, index) => {
      if (isQuestionBlock(block)) run.push(index)
      else if (!isEmptyParagraph(block)) flush()
    })
    flush()
  }
  const page = { ...(document.attrs?.page as Record<string, unknown> | undefined ?? {}) }
  const header = typeof page.header === 'string' ? page.header.trim() : ''
  page.header = header ? `${header} — ${options.label}` : options.label
  return { ...document, attrs: { ...document.attrs, page }, content: blocks }
}

/** How many questions a document has; a booklet makes sense with two or more, or with choices. */
export function questionCount(document: JSONContent): { questions: number; withChoices: number } {
  let questions = 0
  let withChoices = 0
  const walk = (node: JSONContent) => {
    if (node.type === 'question') {
      questions++
      if (node.content?.some(part => part.type === 'choices' && (part.content?.length ?? 0) > 1)) withChoices++
      return
    }
    node.content?.forEach(walk)
  }
  walk(document)
  return { questions, withChoices }
}
