import type { JSONContent } from '@tiptap/core'
import type { DocumentFormat } from './format'

/** The text of a node and its children; a hard break is a new line. */
function textOf(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(textOf).join('')
}

/** Each block on its own line; list items keep a mark so a list still reads as one. */
function linesOf(node: JSONContent, prefix = ''): string[] {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return [prefix + textOf(node)]
    // A table row is one line, its cells apart by tabs, as a spreadsheet pastes them.
    case 'tableRow':
      return [prefix + (node.content ?? []).map(cell => (cell.content ?? []).map(textOf).join(' ')).join('\t')]
    case 'bulletList':
      return (node.content ?? []).flatMap(item => (item.content ?? []).flatMap((child, index) => linesOf(child, index === 0 ? `${prefix}• ` : `${prefix}  `)))
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1)
      return (node.content ?? []).flatMap((item, number) => (item.content ?? []).flatMap((child, index) => linesOf(child, index === 0 ? `${prefix}${start + number}. ` : `${prefix}   `)))
    }
    default:
      return (node.content ?? []).flatMap(child => linesOf(child, prefix))
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
    return new TextEncoder().encode(`${linesOf(document).join('\n')}\n`)
  },
}
