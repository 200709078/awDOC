import type { JSONContent } from '@tiptap/core'
import { headingsOfJson } from '../editor/contents'
import { FONTS } from '../editor/fonts'
import { LINE_HEIGHTS } from '../editor/paragraph-format'
import { answerKeyLine } from './txt'

/**
 * What the Word (`docx.ts`) and LibreOffice (`odt.ts`) formats share: fonts, colours, sizes,
 * pictures, and the teacher's blocks turned into ordinary ones (those files have no questions).
 */

export const LETTERS = 'ABCDEF'
/** Twentieths of a point (Word's "twips") in a millimetre, and pixels (96 DPI) in a twip. */
export const TWIPS_PER_MM = 1440 / 25.4
export const EMU_PER_PX = 9525

export type Marks = NonNullable<JSONContent['marks']>

/** "Calibri" from the font setting's CSS list ('Calibri, Carlito, …'). */
export function fontName(css: unknown): string | null {
  if (typeof css !== 'string' || !css.trim()) return null
  return css.split(',')[0].trim().replace(/^["']|["']$/g, '') || null
}

/** The setting for a font named in a file: ours with its look-alikes, or the name alone. */
export function fontCss(name: string): string {
  const known = FONTS.find(font => font.name.toLowerCase() === name.toLowerCase())
  if (known) return known.css
  return /[\s,]/.test(name) ? `"${name.replace(/"/g, '')}"` : name
}

/** "#c00000" from a CSS colour ("#C00000", "#c00", "rgb(192, 0, 0)"); null for none. */
export function hexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  let match = text.match(/^#([0-9a-f]{6})$/)
  if (match) return `#${match[1]}`
  match = text.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/)
  if (match) return `#${match[1]}${match[1]}${match[2]}${match[2]}${match[3]}${match[3]}`
  match = text.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/)
  if (match) return `#${match.slice(1, 4).map(part => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('')}`
  return null
}

/** Points of a size setting ("14pt", "18.5pt", "16px"). */
export function pointsOf(size: unknown): number | null {
  if (typeof size !== 'string') return null
  const number = Number.parseFloat(size)
  if (!Number.isFinite(number) || number <= 0) return null
  return size.trim().endsWith('px') ? number * 0.75 : number
}

/** One of the editor's line spacings when a file's is close to it, else the file's own. */
export function lineHeightOf(ratio: number): string | null {
  if (!Number.isFinite(ratio) || ratio <= 0) return null
  const near = LINE_HEIGHTS.find(choice => Math.abs(Number(choice) - ratio) < 0.04)
  if (near) return near === '1.15' ? null : near
  return String(Math.round(ratio * 100) / 100)
}

const IMAGE_TYPES: Readonly<Record<string, string>> = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }

export function imageMime(name: string): string | null {
  return IMAGE_TYPES[name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''] ?? null
}

export function extensionOfMime(mime: string): string {
  return mime === 'image/jpeg' ? 'jpeg' : mime.split('/')[1] ?? 'png'
}

/** The bytes of a picture kept as a data URL; null for anything else. */
export function dataUrlBytes(src: unknown): { bytes: Uint8Array; mime: string } | null {
  if (typeof src !== 'string') return null
  const match = src.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,(.*)$/i)
  if (!match) return null
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { bytes, mime: match[1].toLowerCase() }
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(binary)}`
}

/** Width and height in pixels read from a PNG, JPEG or GIF header. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) return { width: view.getUint32(16), height: view.getUint32(20) }
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49) return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null
      const marker = bytes[offset + 1]
      const length = view.getUint16(offset + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
      }
      offset += 2 + length
    }
  }
  return null
}

/** The size a picture is shown at, in pixels: its set width, its height kept in proportion. */
export function shownSize(attrs: Record<string, unknown>, bytes: Uint8Array): { width: number; height: number } {
  const natural = imageSize(bytes) ?? { width: 300, height: 200 }
  const width = Number(attrs.width) > 0 ? Number(attrs.width) : natural.width
  const height = Number(attrs.height) > 0 ? Number(attrs.height) : Math.round(width * natural.height / Math.max(1, natural.width))
  return { width: Math.round(width), height: Math.round(height) }
}

/** All the formulas' LaTeX in the document, to turn them into the file's own maths first. */
export function formulasIn(document: JSONContent): string[] {
  const found = new Set<string>()
  const walk = (node: JSONContent) => {
    if (node.type === 'formula' && node.attrs?.latex) found.add(String(node.attrs.latex))
    node.content?.forEach(walk)
  }
  walk(document)
  return [...found]
}

/** Whether saving to Word / LibreOffice would turn something into plain text (questions, the answer key, captions). */
export function hasTeacherBlocks(document: JSONContent): boolean {
  const walk = (node: JSONContent): boolean =>
    ['question', 'questionRow', 'answerKey', 'choices'].includes(node.type ?? '') || Boolean(node.type === 'paragraph' && node.attrs?.caption) || (node.content ?? []).some(walk)
  return walk(document)
}

const text = (value: string, marks?: Marks): JSONContent => (marks?.length ? { type: 'text', text: value, marks } : { type: 'text', text: value })
const BOLD: Marks = [{ type: 'bold' }]

/** A table the Word / LibreOffice writers draw without lines (two questions side by side). */
export const BORDERLESS = 'awdocBorderless'

/**
 * The document with only blocks Word and LibreOffice have: a question becomes its paragraphs with
 * "1. " in front (and its points after), its choices "A) …" lines, or one line of tab-separated
 * choices when they sit side by side; two paired questions a table of two cells without lines; the
 * answer key its line; a caption "Şekil 1: …".
 */
export function officeBlocks(document: JSONContent): JSONContent[] {
  // A mail merge's copies (apart by page breaks that restart the numbers) are numbered on their own.
  const sections: JSONContent[][] = [[]]
  for (const block of document.content ?? []) {
    if (block.type === 'pageBreak' && block.attrs?.restart) sections.push([])
    sections.at(-1)!.push(block)
  }
  const contents = headingsOfJson(document)
  return sections.flatMap(section => sectionBlocks({ ...document, content: section }, contents))
}

function sectionBlocks(document: JSONContent, contents: { level: number; text: string }[]): JSONContent[] {
  let questions = 0
  let figures = 0
  const answerKey = answerKeyLine(document)

  const question = (node: JSONContent): JSONContent[] => {
    const number = ++questions
    const points = Number(node.attrs?.points)
    const blocks: JSONContent[] = []
    let first = true
    for (const part of node.content ?? []) {
      if (part.type === 'choices') {
        const lines = (part.content ?? []).map((choice, index) => [text(`${LETTERS[index] ?? '?'}) `, BOLD), ...(choice.content ?? [])])
        const layout = part.attrs?.layout
        const perLine = layout === 'row' ? lines.length : layout === 'grid' ? 2 : 1
        for (let i = 0; i < lines.length; i += perLine) {
          const content = lines.slice(i, i + perLine).flatMap((line, index) => (index ? [text('\t'), ...line] : line))
          blocks.push({ type: 'paragraph', attrs: { indent: 1 }, content })
        }
        continue
      }
      if (first && part.type === 'paragraph') {
        const content: JSONContent[] = [text(`${number}. `, BOLD), ...(part.content ?? [])]
        if (points > 0) content.push(text(` (${String(points).replace('.', ',')} puan)`))
        blocks.push({ ...part, content })
      } else {
        blocks.push(...walk(part))
      }
      first = false
    }
    return blocks
  }

  const walk = (node: JSONContent): JSONContent[] => {
    switch (node.type) {
      case 'question':
        return question(node)
      case 'questionRow':
        return [{
          type: 'table',
          attrs: { [BORDERLESS]: true },
          content: [{ type: 'tableRow', content: (node.content ?? []).map(part => ({ type: 'tableCell', content: question(part) })) }],
        }]
      case 'answerKey':
        return [{ type: 'paragraph', content: [text(answerKey, BOLD)] }]
      case 'tableOfContents':
        return [{ type: 'tableOfContents', attrs: { entries: contents } }]
      case 'paragraph':
        if (node.attrs?.caption) return [{ ...node, content: [text(`Şekil ${++figures}: `, BOLD), ...(node.content ?? [])] }]
        return [node]
      case 'blockquote':
        return (node.content ?? []).flatMap(walk).map(block => (block.type === 'paragraph' ? { ...block, attrs: { ...block.attrs, indent: Number(block.attrs?.indent ?? 0) + 1 } } : block))
      case 'codeBlock':
        return ((node.content ?? []).map(part => part.text ?? '').join('').split('\n')).map(line => ({
          type: 'paragraph',
          content: line ? [text(line, [{ type: 'textStyle', attrs: { fontFamily: fontCss('Courier New') } }])] : undefined,
        }))
      case 'bulletList': case 'orderedList': case 'listItem': case 'table': case 'tableRow': case 'tableCell': case 'tableHeader':
        return [{ ...node, content: (node.content ?? []).flatMap(walk) }]
      default:
        return [node]
    }
  }
  return (document.content ?? []).flatMap(walk)
}

/** What the editor accepts in a list item, a table cell and the document: never empty. */
export function tidy(blocks: JSONContent[]): JSONContent[] {
  return blocks.length ? blocks : [{ type: 'paragraph' }]
}
