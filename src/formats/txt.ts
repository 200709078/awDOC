import type { JSONContent } from '@tiptap/core'
import type { DocumentFormat } from './format'

/** The text of a node and its children; a hard break is a new line. */
function textOf(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  // A formula as its LaTeX: the closest plain text has to it.
  if (node.type === 'formula') return String(node.attrs?.latex ?? '')
  return (node.content ?? []).map(textOf).join('')
}

/** Questions are numbered through the whole document. */
interface Counter {
  questions: number
  /** The answer key's line, worked out from the whole document. */
  answerKey: string
}

const LETTERS = 'ABCDEF'

/** "Cevap Anahtarı: 1. B, 2. —, 3. ?", as the answer key block shows it. */
function answerKeyLine(document: JSONContent): string {
  const answers: string[] = []
  const walk = (node: JSONContent) => {
    if (node.type !== 'question') {
      node.content?.forEach(walk)
      return
    }
    const choices = node.content?.at(-1)?.type === 'choices' ? node.content.at(-1)! : null
    const index = choices?.content?.findIndex(choice => choice.attrs?.correct) ?? -1
    answers.push(`${answers.length + 1}. ${choices ? (index >= 0 ? LETTERS[index] : '?') : '—'}`)
  }
  walk(document)
  return `Cevap Anahtarı: ${answers.join(', ')}`
}

/** Each block on its own line; list items, questions and choices keep their marks so they still read as such. */
function linesOf(node: JSONContent, counter: Counter, prefix = ''): string[] {
  switch (node.type) {
    case 'question': {
      const number = `${++counter.questions}. `
      const lines = (node.content ?? []).flatMap(child => linesOf(child, counter, `${prefix}${' '.repeat(number.length)}`))
      if (lines.length) lines[0] = `${prefix}${number}${lines[0].slice(prefix.length + number.length)}`
      const points = Number(node.attrs?.points)
      if (lines.length && points > 0) lines[0] += ` (${String(points).replace('.', ',')} puan)`
      return lines
    }
    case 'answerKey':
      return [prefix + counter.answerKey]
    case 'choices':
      return (node.content ?? []).map((choice, index) => `${prefix}${LETTERS[index] ?? '?'}) ${textOf(choice)}`)
    case 'paragraph':
    case 'heading':
      return [prefix + textOf(node)]
    // A table row is one line, its cells apart by tabs, as a spreadsheet pastes them.
    case 'tableRow':
      return [prefix + (node.content ?? []).map(cell => (cell.content ?? []).map(textOf).join(' ')).join('\t')]
    case 'bulletList':
      return (node.content ?? []).flatMap(item => (item.content ?? []).flatMap((child, index) => linesOf(child, counter, index === 0 ? `${prefix}• ` : `${prefix}  `)))
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1)
      return (node.content ?? []).flatMap((item, number) => (item.content ?? []).flatMap((child, index) => linesOf(child, counter, index === 0 ? `${prefix}${start + number}. ` : `${prefix}   `)))
    }
    default:
      return (node.content ?? []).flatMap(child => linesOf(child, counter, prefix))
  }
}

/** Plain text, UTF-8: every line becomes a paragraph; saving keeps only the words. */
export const txtFormat: DocumentFormat = {
  id: 'txt',
  description: 'Düz metin',
  extensions: ['txt'],
  mime: 'text/plain',
  keepsEverything: false,
  read(bytes) {
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '')
    const lines = text.split(/\r\n|\r|\n/)
    if (lines.length > 1 && lines.at(-1) === '') lines.pop()
    return {
      type: 'doc',
      content: lines.map(line => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
    }
  },
  write(document) {
    return new TextEncoder().encode(`${linesOf(document, { questions: 0, answerKey: answerKeyLine(document) }).join('\n')}\n`)
  },
}
