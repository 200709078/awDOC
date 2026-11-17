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
  /** Space pushed in on screen: the rest of the page, the margins and the gap. */
  readonly height: number
  readonly forced: boolean
  /** Columns of the row's table, for the gap row. */
  readonly columns?: number
}

export interface Pagination {
  readonly breaks: readonly PageBreakPoint[]
  readonly pages: number
}

/** A line ending this close to the bottom margin still counts as not fitting: print must never need more room than the screen. */
const SAFETY = 2

type Unit =
  | { readonly kind: 'text'; readonly pos: number; readonly node: ProseMirrorNode }
  | { readonly kind: 'row'; readonly pos: number; readonly node: ProseMirrorNode }
  | { readonly kind: 'block'; readonly pos: number; readonly node: ProseMirrorNode }
  | { readonly kind: 'pageBreak'; readonly pos: number }

/** The pieces that are laid out one under another: paragraphs, table rows, other blocks. */
function unitsOf(doc: ProseMirrorNode): Unit[] {
  const units: Unit[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'pageBreak') units.push({ kind: 'pageBreak', pos })
    else if (node.isTextblock) units.push({ kind: 'text', pos, node })
    else if (node.type.name === 'tableRow') units.push({ kind: 'row', pos, node })
    else if (node.isBlock && node.isAtom) units.push({ kind: 'block', pos, node })
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
export function paginate(view: EditorView, page: PageGeometry): Pagination {
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

  const push = (kind: PageBreakPoint['kind'], pos: number, top: number, columns?: number) => {
    const height = contentStart(index + 1) - top
    breaks.push({ kind, pos, height, forced, ...(columns === undefined ? {} : { columns }) })
    shift += height
    index++
    forced = false
  }

  for (const unit of unitsOf(view.state.doc)) {
    if (unit.kind === 'pageBreak') {
      // Two page breaks in a row leave an empty page between them.
      if (forced) index++
      forced = true
      continue
    }
    const element = view.nodeDOM(unit.pos)
    if (!(element instanceof HTMLElement)) continue
    const rect = element.getBoundingClientRect()
    // The box's own edges: a gap at its start is inside it, below its top; a gap inside it is above its bottom.
    const top = rect.top - measuredOrigin - pushedBy(rect.top - measuredOrigin + 0.5)
    const bottom = rect.bottom - measuredOrigin - pushedBy(rect.bottom - measuredOrigin - 0.5)

    if (unit.kind !== 'text') {
      const columns = unit.kind === 'row' ? columnsOf(unit.node) : undefined
      const atPageTop = top + shift <= contentStart(index) + SAFETY
      if (forced || (!atPageTop && bottom + shift > contentEnd(index) - SAFETY)) push(unit.kind, unit.pos, top + shift, columns)
      continue
    }

    const start = unit.pos + 1
    const end = unit.pos + unit.node.nodeSize - 1
    if (forced) push('line', start, top + shift)
    let from = start
    // A paragraph may run over several pages: each page end it crosses is a break.
    while (bottom + shift > contentEnd(index) - SAFETY) {
      const limit = contentEnd(index) - SAFETY - shift
      const crossing = lineCrossing(from, end, limit)
      // Only an empty paragraph has no line to find: it moves as a whole. Lines that all fit
      // (only the box's edge crosses) stay.
      if (crossing === null && start < end) break
      const pos = crossing ?? start
      const lineTop = crossing === null ? top : charRect(crossing).top
      // A single line taller than the page stays where it is.
      if (lineTop + shift <= contentStart(index) + SAFETY) break
      push('line', pos, lineTop + shift)
      from = pos + 1
    }
  }
  if (forced) index++
  return { breaks, pages: index + 1 }
}

function gapElement(point: PageBreakPoint): HTMLElement {
  const className = `page-gap page-gap--${point.kind}${point.forced ? ' page-gap--forced' : ''}`
  if (point.kind === 'row') {
    const row = document.createElement('tr')
    row.className = className
    const cell = document.createElement('td')
    cell.colSpan = point.columns ?? 1
    cell.style.height = `${point.height}px`
    row.append(cell)
    return row
  }
  const gap = document.createElement(point.kind === 'line' ? 'span' : 'div')
  gap.className = className
  gap.style.height = `${point.height}px`
  gap.setAttribute('aria-hidden', 'true')
  return gap
}

function decorationsOf(doc: ProseMirrorNode, breaks: readonly PageBreakPoint[]): DecorationSet {
  return DecorationSet.create(doc, breaks.map(point => Decoration.widget(point.pos, () => gapElement(point), {
    side: -1,
    ignoreSelection: true,
    key: `page-gap-${point.kind}-${Math.round(point.height * 10)}-${point.forced ? 1 : 0}-${point.columns ?? 0}`,
  })))
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
      && point.columns === other.columns && Math.abs(point.height - other.height) < 0.5
  })
}

export function paginationOf(state: EditorState): Pagination | null {
  return paginationKey.getState(state)?.result ?? null
}

/** Puts a new layout in place (or none: `null`, where the screen is not laid out as the page). */
export function applyPagination(view: EditorView, result: Pagination | null): void {
  const current = paginationOf(view.state)
  if (result === current) return
  if (result && current && result.pages === current.pages && sameBreaks(result.breaks, current.breaks)) return
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
            if (meta !== undefined) return { decorations: meta ? decorationsOf(tr.doc, meta.breaks) : DecorationSet.empty, result: meta }
            if (!tr.docChanged) return value
            // The breaks move with the text, as their gaps do, so a new layout compares with where they are.
            const result = value.result && { ...value.result, breaks: value.result.breaks.map(point => ({ ...point, pos: tr.mapping.map(point.pos, -1) })) }
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
