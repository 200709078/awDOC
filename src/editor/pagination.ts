import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

/** The page in CSS pixels, as the editor is laid out on screen. */
export interface PageGeometry {
  readonly height: number
  readonly marginTop: number
  readonly marginBottom: number
  /** Grey space between two sheets on screen. */
  readonly gap: number
}

/**
 * Where the text moves on to the next page. `line`: inside a paragraph, before the line at `pos`;
 * `row`: before a table row; `block`: before a block such as a horizontal line. `forced` follows
 * a page break, which itself starts the new page when printed.
 */
export interface PageBreakPoint {
  readonly kind: 'line' | 'row' | 'block'
  readonly pos: number
  /** Space pushed in on screen: the rest of the page, the margins and the gap (the notes block included). */
  readonly height: number
  readonly forced: boolean
  /** Columns of the row's table, for the gap row. */
  readonly columns?: number
  /** The footnotes of the page that ends here, written at its foot. */
  readonly notes?: PageNotes
}

/** A page's footnotes: written after `fill` (the rest of the page above them), `height` tall. */
export interface PageNotes {
  readonly items: readonly { readonly number: number; readonly text: string }[]
  readonly fill: number
  readonly height: number
  /** Where the block goes: right after the page's last line (in its paragraph), or at the break. */
  readonly at?: number
  /** The element it takes there: inside a paragraph, between table rows, or between blocks. */
  readonly kind?: 'line' | 'row' | 'block' | 'after'
}

export interface Pagination {
  readonly breaks: readonly PageBreakPoint[]
  readonly pages: number
  /** The last page's footnotes, at the end of the document. */
  readonly endNotes?: PageNotes
}

/** What the layout needs of the footnotes: where they are and how tall their text is at the page's foot. */
export interface NoteSource {
  readonly pos: number
  readonly number: number
  readonly text: string
  readonly height: number
}

/** The line above a page's footnotes, and the room it takes. */
export const NOTES_SEPARATOR = 12

/** A line ending this close to the bottom margin still counts as not fitting: print must never need more room than the screen. */
const SAFETY = 2

type Unit =
  /** `wholeAt`: where the gap goes when the paragraph moves as a whole: before the block carrying its label (a question's number, a choice's letter). */
  | { readonly kind: 'text'; readonly pos: number; readonly node: ProseMirrorNode; readonly wholeAt?: number }
  | { readonly kind: 'row'; readonly pos: number; readonly node: ProseMirrorNode }
  | { readonly kind: 'block'; readonly pos: number; readonly node: ProseMirrorNode }
  | { readonly kind: 'pageBreak'; readonly pos: number }
  /** Kept on one page when it fits on one (a question); its own pieces follow it in the list. */
  | { readonly kind: 'keep'; readonly pos: number; readonly end: number; readonly unsplittable?: boolean }

/** The pieces that are laid out one under another: paragraphs, table rows, other blocks. */
function unitsOf(doc: ProseMirrorNode): Unit[] {
  const units: Unit[] = []
  doc.descendants((node, pos, parent, index) => {
    const name = node.type.name
    // Two questions side by side cannot break line by line: always one piece.
    if (name === 'questionRow') {
      units.push({ kind: 'keep', pos, end: pos + node.nodeSize, unsplittable: true })
      return false
    }
    if (name === 'question') {
      units.push({ kind: 'keep', pos, end: pos + node.nodeSize })
      return true
    }
    if (name === 'pageBreak') units.push({ kind: 'pageBreak', pos })
    else if (name === 'choice') units.push({ kind: 'text', pos, node, wholeAt: pos })
    else if (node.isTextblock) {
      // The first paragraph of a question carries the question's number: the question moves with it.
      const first = index === 0 && parent?.type.name === 'question'
      units.push({ kind: 'text', pos, node, ...(first ? { wholeAt: pos - 1 } : {}) })
    } else if (name === 'tableRow') units.push({ kind: 'row', pos, node })
    // Choices side by side are one piece.
    else if ((name === 'choices' && node.attrs.layout !== 'list') || (node.isBlock && node.isAtom)) units.push({ kind: 'block', pos, node })
    else return true
    return false
  })
  return units
}

function columnsOf(row: ProseMirrorNode): number {
  let columns = 0
  row.forEach(cell => { columns += Number(cell.attrs.colspan) || 1 })
  return columns
}

/**
 * How far the gaps on screen have pushed down what is at `y`: the heights of the gaps that end
 * above it. A gap only ever sits at a line's start (or between rows and blocks), so it moves what
 * is below it by its own height and changes nothing else; the caller hides the gaps that edited
 * text may have left in the middle of a line. Ask with a point inside the thing measured (a
 * character's middle): a glyph's box may reach a little above its line, into the gap's last pixel.
 */
function gapsAbove(view: EditorView, origin: number): (y: number) => number {
  const gaps = [...view.dom.querySelectorAll<HTMLElement>('.page-gap')]
    .map(gap => gap.getBoundingClientRect())
    .filter(rect => rect.height > 0)
    .map(rect => ({ bottom: rect.bottom - origin, height: rect.height }))
    .sort((a, b) => a.bottom - b.bottom)
  if (!gaps.length) return () => 0
  const before: number[] = []
  let total = 0
  for (const gap of gaps) before.push(total += gap.height)
  return y => {
    // The gaps that end above y, by binary search.
    let low = 0
    let high = gaps.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (gaps[middle].bottom <= y) low = middle + 1
      else high = middle
    }
    return low ? before[low - 1] : 0
  }
}

/**
 * Lays the document out on pages. It measures the editor as it is now, takes the gaps on screen
 * out of the measures, and walks down the text: whatever would cross the bottom margin of a page
 * goes to the top of the next one, line by line inside a paragraph, row by row in a table.
 */
/** Where a notes block goes, as the key its correction is kept under (the end of the document is -1). */
export const notesPlace = (notes: PageNotes, breakPos: number | null) => notes.at ?? breakPos ?? -1

export function paginate(view: EditorView, page: PageGeometry, notes: readonly NoteSource[] = [], corrections: ReadonlyMap<number, number> = new Map()): Pagination {
  const box = view.dom.getBoundingClientRect()
  const measuredOrigin = box.top + view.dom.clientTop
  const pushedBy = gapsAbove(view, measuredOrigin)
  const step = page.height + page.gap
  const contentEnd = (index: number) => index * step + page.height - page.marginBottom
  const contentStart = (index: number) => index * step + page.marginTop
  const breaks: PageBreakPoint[] = []
  let index = 0
  let shift = 0
  let forced = false
  /** Footnotes placed on the page being filled, and where a page break before them stood. */
  let pageNotes: NoteSource[] = []
  let forcedAt: { pos: number; top: number } | null = null
  /** The lowest thing placed so far (laid-out coordinates): the last page's notes come below it. */
  let lowest = 0
  const notesHeight = (list: readonly NoteSource[]) => (list.length ? NOTES_SEPARATOR + list.reduce((sum, note) => sum + note.height, 0) : 0)
  const notesIn = (from: number, to: number) => notes.filter(note => note.pos >= from && note.pos < to)
  /** The page's foot for text: above its footnotes (those placed and those about to be). */
  const pageEnd = (extra: readonly NoteSource[] = []) => contentEnd(index) - SAFETY - notesHeight([...pageNotes, ...extra])

  const charRect = (pos: number) => {
    const rect = view.coordsAtPos(pos, 1)
    const shift = pushedBy((rect.top + rect.bottom) / 2 - measuredOrigin)
    return { top: rect.top - measuredOrigin - shift, bottom: rect.bottom - measuredOrigin - shift }
  }
  // Two positions are on one line when their characters overlap by more than half the smaller height.
  const sameLine = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) =>
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.bottom - a.top, b.bottom - b.top) / 2

  /** The first position from `from` whose line ends below `limit` (natural coordinates), at its line's start. */
  const lineCrossing = (from: number, to: number, limit: number): number | null => {
    if (from >= to || charRect(to - 1).bottom <= limit) return null
    let low = from
    let high = to - 1
    while (low < high) {
      const middle = (low + high) >> 1
      if (charRect(middle).bottom > limit) high = middle
      else low = middle + 1
    }
    // Back to the start of that line, so the line breaks where it already broke: the line's
    // positions follow one another, so the first one is found by binary search too.
    const here = charRect(low)
    let first = from
    let last = low
    while (first < last) {
      const middle = (first + last) >> 1
      if (sameLine(charRect(middle), here)) last = middle
      else first = middle + 1
    }
    return first
  }

  /**
   * Where the page's last thing ends, so its notes come right under it (no margin between): the
   * end of a paragraph at the top of the document, or the place after a table row.
   */
  let lastPlace: { pos: number; top: number; kind: 'after' | 'row' } | null = null

  /** The current page's footnotes, closed: under its last line (a paragraph broken here: at the break). */
  const closeNotes = (top: number, breakPos: number | null, midParagraph = false): PageNotes | undefined => {
    if (!pageNotes.length) return undefined
    const height = notesHeight(pageNotes)
    const place = midParagraph && breakPos !== null ? { pos: breakPos, top, kind: 'line' as const }
      : lastPlace ?? (forcedAt ? { pos: forcedAt.pos, top: forcedAt.top, kind: 'block' as const }
        : { pos: breakPos ?? view.state.doc.content.size, top, kind: 'block' as const })
    // Margins around the block may still set it a little off: measured and corrected (page-view.ts).
    const correction = corrections.get(place.pos) ?? 0
    const fill = Math.max(0, contentEnd(index) - height - place.top - SAFETY - correction)
    const items = pageNotes.map(note => ({ number: note.number, text: note.text }))
    pageNotes = []
    return { items, fill, height, at: place.pos, kind: place.kind }
  }

  /** Notes of a page that ended with two page breaks in a row: they go with the next break. */
  let carried: PageNotes | undefined
  const push = (kind: PageBreakPoint['kind'], pos: number, top: number, columns?: number, midParagraph = false) => {
    const notesBlock = carried ?? closeNotes(top, pos, midParagraph)
    carried = undefined
    lastPlace = null
    const height = contentStart(index + 1) - top
    breaks.push({ kind, pos, height, forced, ...(columns === undefined ? {} : { columns }), ...(notesBlock ? { notes: notesBlock } : {}) })
    shift += height
    index++
    forced = false
    forcedAt = null
  }

  const pageText = contentEnd(0) - contentStart(0) - SAFETY
  /** Pieces of a question already placed as a whole. */
  let skipUntil = -1
  for (const unit of unitsOf(view.state.doc)) {
    if (unit.pos < skipUntil) continue
    if (unit.kind === 'pageBreak') {
      // Two page breaks in a row leave an empty page between them.
      if (forced) {
        carried = carried ?? closeNotes(0, null)
        lastPlace = null
        index++
      }
      forced = true
      const element = view.nodeDOM(unit.pos)
      if (element instanceof HTMLElement) {
        const rect = element.getBoundingClientRect()
        forcedAt = { pos: unit.pos, top: rect.top - measuredOrigin - pushedBy(rect.top - measuredOrigin + 0.5) + shift }
      }
      continue
    }
    const element = view.nodeDOM(unit.pos)
    if (!(element instanceof HTMLElement)) continue
    const rect = element.getBoundingClientRect()
    // The box's own edges: a gap at its start is inside it, below its top; a gap inside it is above its bottom.
    const top = rect.top - measuredOrigin - pushedBy(rect.top - measuredOrigin + 0.5)
    const bottom = rect.bottom - measuredOrigin - pushedBy(rect.bottom - measuredOrigin - 0.5)

    if (unit.kind === 'keep') {
      // A question is not split between pages: it moves on whole, unless it is longer than a page.
      const own = notesIn(unit.pos, unit.end)
      const fitsOnAPage = unit.unsplittable || bottom - top <= pageText
      const atPageTop = top + shift <= contentStart(index) + SAFETY
      if (fitsOnAPage && (forced || (!atPageTop && bottom + shift > pageEnd(own)))) push('block', unit.pos, top + shift)
      if (bottom + shift <= pageEnd(own)) {
        skipUntil = unit.end
        pageNotes.push(...own)
        lowest = Math.max(lowest, bottom + shift)
        lastPlace = null
      }
      continue
    }

    if (unit.kind !== 'text') {
      const columns = unit.kind === 'row' ? columnsOf(unit.node) : undefined
      const own = notesIn(unit.pos, unit.pos + unit.node.nodeSize)
      const atPageTop = top + shift <= contentStart(index) + SAFETY
      if (forced || (!atPageTop && bottom + shift > pageEnd(own))) push(unit.kind, unit.pos, top + shift, columns)
      pageNotes.push(...own)
      lowest = Math.max(lowest, bottom + shift)
      lastPlace = unit.kind === 'row' ? { pos: unit.pos + unit.node.nodeSize, top: bottom + shift, kind: 'row' } : null
      continue
    }

    const start = unit.pos + 1
    const end = unit.pos + unit.node.nodeSize - 1
    const own = notesIn(start, end + 1)
    const moveWhole = (lineTop: number) => {
      if (unit.wholeAt === undefined) push('line', start, lineTop)
      else push('block', unit.wholeAt, lineTop)
    }
    if (forced) moveWhole(top + shift)
    // A picture beside the text may reach below the paragraph's last line.
    let floatBottom = Number.NEGATIVE_INFINITY
    for (const image of element.querySelectorAll('img[data-wrap="left"], img[data-wrap="right"]')) {
      const box = (image.closest('[data-resize-container]') ?? image).getBoundingClientRect()
      floatBottom = Math.max(floatBottom, box.bottom - measuredOrigin - pushedBy(box.bottom - measuredOrigin - 0.5))
    }
    let from = start
    // A paragraph may run over several pages: each page end it crosses is a break. The page's foot
    // is above its footnotes, and a note goes where its line goes: worked out until they agree.
    const fitWith = (list: readonly NoteSource[]) => {
      const overflows = Math.max(bottom, floatBottom) + shift > pageEnd(list)
      return { overflows, crossing: overflows ? lineCrossing(from, end, pageEnd(list) - shift) : null }
    }
    for (;;) {
      // The notes are tried in order: each stays on this page if its line still fits with it; the
      // first that does not ends the page at its line (or before), with every note before that line.
      const pending = own.filter(note => note.pos >= from)
      const included: NoteSource[] = []
      let { overflows, crossing } = fitWith(included)
      for (const note of pending) {
        const trial = fitWith([...included, note])
        overflows = trial.overflows
        crossing = trial.crossing
        // (No line found to cross: only the paragraph's box edge does; the note stays with its line.)
        if (!trial.overflows || trial.crossing === null || note.pos < trial.crossing) {
          included.push(note)
          continue
        }
        break
      }
      const extra = crossing === null ? included : included.filter(note => note.pos < crossing!)
      if (!overflows) {
        pageNotes.push(...extra)
        break
      }
      // Only an empty paragraph has no line to find: it moves as a whole. Lines that all fit
      // (only the box's edge crosses) stay, unless a picture beside them runs over: then the
      // paragraph goes on with it (from its start; a picture cannot be split).
      if (crossing === null && start < end) {
        if (floatBottom + shift > pageEnd(extra) && from === start && top + shift > contentStart(index) + SAFETY) {
          moveWhole(top + shift)
          continue
        }
        pageNotes.push(...extra)
        break
      }
      const pos = crossing ?? start
      const lineTop = crossing === null ? top : charRect(crossing).top
      // A single line taller than the page stays where it is.
      if (lineTop + shift <= contentStart(index) + SAFETY) {
        pageNotes.push(...extra)
        break
      }
      pageNotes.push(...extra.filter(note => note.pos < pos))
      if (pos === start) moveWhole(lineTop + shift)
      else push('line', pos, lineTop + shift, undefined, true)
      from = pos + 1
    }
    lowest = Math.max(lowest, Math.max(bottom, floatBottom) + shift)
    // A paragraph at the top of the document: its page's notes may go right under its last line.
    const topLevel = view.state.doc.resolve(unit.pos).depth === 0
    lastPlace = topLevel && floatBottom === Number.NEGATIVE_INFINITY ? { pos: unit.pos + unit.node.nodeSize, top: bottom + shift, kind: 'after' } : null
  }
  // A page break at the very end: the notes go before it, the page after it is empty.
  const endNotes = carried ?? closeNotes(lowest, null)
  if (forced) index++
  return { breaks, pages: index + 1, ...(endNotes ? { endNotes } : {}) }
}

function gapElement(point: PageBreakPoint): HTMLElement {
  const className = `page-gap page-gap--${point.kind}${point.forced ? ' page-gap--forced' : ''}`
  // The page's footnotes block takes its share of the space.
  const height = Math.max(0, point.height - (point.notes ? point.notes.fill + point.notes.height : 0))
  if (point.kind === 'row') {
    const row = document.createElement('tr')
    row.className = className
    const cell = document.createElement('td')
    cell.colSpan = point.columns ?? 1
    cell.style.height = `${height}px`
    row.append(cell)
    return row
  }
  const gap = document.createElement(point.kind === 'line' ? 'span' : 'div')
  gap.className = className
  gap.style.height = `${height}px`
  gap.setAttribute('aria-hidden', 'true')
  return gap
}

/** A page's footnotes at its foot: the rest of the page, then a short line and the notes. */
export function notesElement(notes: PageNotes, kind: 'line' | 'row' | 'block' | 'after', columns = 1): HTMLElement {
  const body = document.createElement('div')
  const fill = document.createElement('div')
  fill.className = 'page-notes__fill'
  fill.style.height = `${notes.fill}px`
  const list = document.createElement('div')
  list.className = 'page-notes__list'
  list.style.height = `${notes.height}px`
  for (const item of notes.items) list.append(noteItem(item.number, item.text))
  body.append(fill, list)
  // After a paragraph: pulled up over its bottom margin (its last line's foot), the margin given back below.
  const className = `page-gap page-notes${kind === 'after' ? ' page-notes--after' : ''}`
  if (kind === 'row') {
    const row = document.createElement('tr')
    row.className = className
    const cell = document.createElement('td')
    cell.colSpan = columns
    cell.append(...body.childNodes)
    row.append(cell)
    return row
  }
  const element = document.createElement(kind === 'line' ? 'span' : 'div')
  element.className = className
  element.contentEditable = 'false'
  element.append(...body.childNodes)
  return element
}

/** One footnote as written at the foot of a page or in the list at the end. */
export function noteItem(number: number, text: string): HTMLElement {
  const item = document.createElement('div')
  item.className = 'page-notes__item'
  const mark = document.createElement('sup')
  mark.textContent = String(number)
  item.append(mark, ` ${text}`)
  return item
}

const withPlace = (element: HTMLElement, place: number) => {
  element.dataset.notesPlace = String(place)
  return element
}

const notesKey = (notes: PageNotes | undefined) => (notes ? `${notes.items.map(item => `${item.number}:${item.text}`).join('|')}/${Math.round(notes.fill)}/${Math.round(notes.height)}/${notes.at ?? ''}/${notes.kind ?? ''}` : '')

function decorationsOf(doc: ProseMirrorNode, result: Pagination): DecorationSet {
  const decorations: Decoration[] = []
  for (const point of result.breaks) {
    if (point.notes) {
      const notes = point.notes
      const kind = notes.kind ?? point.kind
      decorations.push(Decoration.widget(notes.at ?? point.pos, () => withPlace(notesElement(notes, kind, point.columns ?? 1), notesPlace(notes, point.pos)), {
        side: -2,
        ignoreSelection: true,
        key: `page-notes-${kind}-${notesKey(notes)}`,
      }))
    }
    decorations.push(Decoration.widget(point.pos, () => gapElement(point), {
      side: -1,
      ignoreSelection: true,
      key: `page-gap-${point.kind}-${Math.round(point.height * 10)}-${point.forced ? 1 : 0}-${point.columns ?? 0}-${point.notes ? Math.round((point.notes.fill + point.notes.height) * 10) : 0}`,
    }))
  }
  const end = result.endNotes
  if (end) {
    decorations.push(Decoration.widget(end.at ?? doc.content.size, () => withPlace(notesElement(end, end.kind ?? 'block'), notesPlace(end, null)), {
      side: end.kind === 'after' || end.at === undefined ? 1 : -2,
      ignoreSelection: true,
      key: `page-notes-end-${notesKey(end)}`,
    }))
  }
  return DecorationSet.create(doc, decorations)
}

interface PaginationState {
  readonly decorations: DecorationSet
  readonly result: Pagination | null
}

export const paginationKey = new PluginKey<PaginationState>('pagination')

/** Same breaks: nothing to redraw (heights within half a pixel). */
export function sameBreaks(a: readonly PageBreakPoint[], b: readonly PageBreakPoint[]): boolean {
  return a.length === b.length && a.every((point, i) => {
    const other = b[i]
    return point.kind === other.kind && point.pos === other.pos && point.forced === other.forced
      && point.columns === other.columns && Math.abs(point.height - other.height) < 0.5 && notesKey(point.notes) === notesKey(other.notes)
  })
}

export function paginationOf(state: EditorState): Pagination | null {
  return paginationKey.getState(state)?.result ?? null
}

/** Puts a new layout in place (or none: `null`, where the screen is not laid out as the page). */
export function applyPagination(view: EditorView, result: Pagination | null): void {
  const current = paginationOf(view.state)
  if (result === current) return
  if (result && current && result.pages === current.pages && sameBreaks(result.breaks, current.breaks) && notesKey(result.endNotes) === notesKey(current.endNotes)) return
  view.dispatch(view.state.tr.setMeta(paginationKey, result).setMeta('addToHistory', false))
}

/**
 * Keeps the gaps between pages as decorations: they move with the text as it is typed and are
 * recomputed by the page view (`ui/page-view.ts`) right after, before the screen is drawn.
 */
export const PaginationExtension = Extension.create({
  name: 'pagination',

  addProseMirrorPlugins() {
    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty, result: null }),
          apply(tr, value) {
            const meta = tr.getMeta(paginationKey) as Pagination | null | undefined
            if (meta !== undefined) return { decorations: meta ? decorationsOf(tr.doc, meta) : DecorationSet.empty, result: meta }
            if (!tr.docChanged) return value
            // The breaks move with the text, as their gaps do, so a new layout compares with where they are.
            const mapNotes = (notes: PageNotes | undefined) => (notes?.at === undefined ? notes : { ...notes, at: tr.mapping.map(notes.at, -1) })
            const result = value.result && {
              ...value.result,
              breaks: value.result.breaks.map(point => ({ ...point, pos: tr.mapping.map(point.pos, -1), ...(point.notes ? { notes: mapNotes(point.notes) } : {}) })),
              ...(value.result.endNotes ? { endNotes: mapNotes(value.result.endNotes) } : {}),
            }
            return { decorations: value.decorations.map(tr.mapping, tr.doc), result }
          },
        },
        props: {
          decorations: state => paginationKey.getState(state)?.decorations,
        },
      }),
    ]
  },
})
