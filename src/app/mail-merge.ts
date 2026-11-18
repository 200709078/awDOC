import type { JSONContent } from '@tiptap/core'

/** The data a mail merge fills in: column names (the first row) and the rows under them. */
export interface MergeData {
  readonly name: string
  readonly columns: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

/** One row of a CSV / tab-separated text, quotes as spreadsheets write them ("a ""b""", "x;y"). */
function splitRows(text: string, separator: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell === '') quoted = true
    else if (char === separator) { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

/** The separator of a spreadsheet's text export: the one the first line has most of (Excel in Turkish writes ";"). */
function separatorOf(firstLine: string): string {
  const counts = [';', ',', '\t'].map(separator => [separator, firstLine.split(separator).length - 1] as const)
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ';'
}

function tidy(name: string, table: string[][]): MergeData {
  const [header = [], ...body] = table.filter(row => row.some(cell => cell.trim() !== ''))
  const columns = header.map((column, index) => column.trim() || `Sütun ${index + 1}`)
  if (!columns.length) throw new Error('Veri dosyasında sütun adı yok: ilk satır sütunların adları olmalı.')
  // Two columns of the same name: the second gets a number.
  const unique = columns.map((column, index) => (columns.indexOf(column) === index ? column : `${column} ${index + 1}`))
  return { name, columns: unique, rows: body.map(row => unique.map((_, index) => (row[index] ?? '').trim())) }
}

/** An awCELL file's first (active) sheet: its first row names the columns. */
function fromAwcell(name: string, text: string): MergeData {
  const file = JSON.parse(text) as { app?: string; activeSheetIndex?: number; sheets?: { tableData?: ({ value?: unknown } | null)[][] }[] }
  if (file.app !== 'awCELL' || !Array.isArray(file.sheets)) throw new Error('Bu dosya bir awCELL tablosu değil.')
  const sheet = file.sheets[file.activeSheetIndex ?? 0] ?? file.sheets[0]
  const table = (sheet?.tableData ?? []).map(row => (row ?? []).map(cell => (cell?.value === undefined || cell.value === null ? '' : String(cell.value))))
  return tidy(name, table)
}

/** The rows of a `.csv`, a tab-separated `.txt` or an awCELL `.awc` file. */
export function readMergeData(name: string, bytes: Uint8Array): MergeData {
  const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '')
  if (/\.awc$/i.test(name)) return fromAwcell(name, text)
  return tidy(name, splitRows(text, separatorOf(text.split(/\r?\n/, 1)[0] ?? '')))
}

/** The fields the document has, in order, each once. */
export function fieldsIn(document: JSONContent): string[] {
  const found: string[] = []
  const walk = (node: JSONContent) => {
    if (node.type === 'mergeField' && node.attrs?.name && !found.includes(String(node.attrs.name))) found.push(String(node.attrs.name))
    node.content?.forEach(walk)
  }
  walk(document)
  return found
}

/** One copy: every field replaced by its value in `row` (with the field's marks; nothing for an empty value). */
export function fillFields(node: JSONContent, value: (field: string) => string): JSONContent {
  if (!node.content) return node
  const content: JSONContent[] = []
  for (const child of node.content) {
    if (child.type === 'mergeField') {
      const text = value(String(child.attrs?.name ?? ''))
      if (text) content.push(child.marks?.length ? { type: 'text', text, marks: child.marks } : { type: 'text', text })
    } else {
      content.push(fillFields(child, value))
    }
  }
  return { ...node, content }
}

/**
 * The merged document: one copy of `document` for each row, each starting on a new page, the
 * fields filled with the row's values. A field with no column of its name stays empty.
 */
export function mergeDocument(document: JSONContent, data: MergeData, rows: readonly (readonly string[])[] = data.rows): JSONContent {
  const blocks: JSONContent[] = []
  rows.forEach((row, index) => {
    const copy = fillFields(document, field => {
      const column = data.columns.indexOf(field)
      return column < 0 ? '' : row[column] ?? ''
    })
    if (index) {
      // A page break stands only between paragraphs at the top: one is added where needed.
      if (blocks.at(-1)?.type !== 'paragraph') blocks.push({ type: 'paragraph' })
      blocks.push({ type: 'pageBreak', attrs: { restart: true } })
      if (copy.content?.[0]?.type !== 'paragraph') blocks.push({ type: 'paragraph' })
    }
    blocks.push(...(copy.content ?? []))
  })
  return { ...document, content: blocks.length ? blocks : [{ type: 'paragraph' }] }
}
