import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { DOCUMENT_REPLACED, readPendingSelection } from '../editor/editor'
import { currentPageSetup, pageNumberText, pageSize, type PageSetup } from '../editor/page-setup'
import { footnotesOf } from '../editor/footnote'
import { applyPagination, noteItem, paginate, paginationKey, type NoteSource, type Pagination } from '../editor/pagination'

export type ViewMode = 'page' | 'continuous'

const VIEW_KEY = 'awDOC.gorunum'
/** CSS pixels in a millimetre. */
const MM = 96 / 25.4
/** Grey between two sheets on screen. */
const GAP = 20
/** Narrower windows start in the continuous view: an A4 sheet would not fit. */
const PAGE_VIEW_MIN_WIDTH = 900

function storedMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    if (stored === 'sayfa') return 'page'
    if (stored === 'surekli') return 'continuous'
  } catch {
    // Private windows may refuse; the width decides.
  }
  return window.innerWidth >= PAGE_VIEW_MIN_WIDTH ? 'page' : 'continuous'
}

/** A CSS string: the header's text goes into the print style. */
function cssString(text: string): string {
  return `"${text.replace(/[\\"]/g, match => `\\${match}`)}"`
}

const NUMBER_CONTENT: Record<PageSetup['numberFormat'], string> = {
  'number': 'counter(page)',
  'number-of-total': 'counter(page) " / " counter(pages)',
  'page-number': '"Sayfa " counter(page)',
}

/** Text of a margin box: the line, the page number, or both side by side. */
function boxContent(text: string, withNumber: boolean, setup: PageSetup): string | null {
  const parts = [text ? cssString(text) : '', withNumber ? NUMBER_CONTENT[setup.numberFormat] : ''].filter(Boolean)
  return parts.length ? parts.join(' "   " ') : null
}

/** The printed page: size, margins and, in the margins, the header, the footer and the page number. */
function printStyle(setup: PageSetup): string {
  const { width, height } = pageSize(setup)
  const { top, right, bottom, left } = setup.margins
  const boxes: string[] = []
  const box = (name: string, content: string | null) => {
    if (content) boxes.push(`@${name} { content: ${content}; font-family: Calibri, Carlito, "Liberation Sans", Arial, sans-serif; font-size: 10pt; color: #374151; }`)
  }
  const place = setup.pageNumbers
  box('top-center', boxContent(setup.header, false, setup))
  box('top-right', boxContent('', place === 'top-right', setup))
  box('bottom-center', boxContent(setup.footer, place === 'bottom-center', setup))
  box('bottom-right', boxContent('', place === 'bottom-right', setup))
  return `@page { size: ${width}mm ${height}mm; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; ${boxes.join(' ')} }`
}

/**
 * The page view. The text is laid out as on the page in both views (same width, same margins), so
 * the pages are always known: the page view draws the sheets and pushes the text past each page's
 * margins (`editor/pagination.ts`); the continuous view hides those gaps. Printing breaks the
 * pages where the screen does. Only a phone's continuous view, narrower than the page, has no
 * pages: the browser then breaks them itself.
 */
export class PageView {
  private viewMode = storedMode()
  private frame = 0
  private styleKey = ''
  private result: Pagination | null = null
  /** Text changed since the last layout (positions in the current document); its gaps may now be mid-line. */
  private dirty: { from: number; to: number } | null = null
  /** Everything is measured again: the page, a font or a picture changed, or a new document came. */
  private full = true
  private measuredHeight = -1
  private readonly sheets = document.createElement('div')
  private readonly style = document.createElement('style')
  private readonly listeners = new Set<() => void>()
  /** Footnotes are measured once per text and width, off screen. */
  private readonly noteHeights = new Map<string, number>()
  private noteMeasure: HTMLElement | null = null

  constructor(private readonly editor: Editor, private readonly host: HTMLElement) {
    this.sheets.className = 'page-sheets'
    this.sheets.setAttribute('aria-hidden', 'true')
    host.prepend(this.sheets)
    this.style.id = 'pageStyle'
    document.head.append(this.style)
    host.classList.toggle('is-paged', this.viewMode === 'page')

    editor.on('transaction', ({ transaction }) => {
      if (transaction.getMeta(DOCUMENT_REPLACED)) this.full = true
      else if (transaction.docChanged) this.markChanged(transaction)
      else return
      this.schedule()
    })
    // Pictures finishing loading, fonts arriving, the window changing: lines may wrap anew.
    const remeasure = () => {
      this.full = true
      this.schedule()
    }
    editor.view.dom.addEventListener('load', remeasure, true)
    window.addEventListener('resize', remeasure)
    document.fonts?.addEventListener?.('loadingdone', remeasure)
    void document.fonts?.ready.then(remeasure)
    // Anything else that changes the editor's height (the toolbar's row wrapping, say).
    new ResizeObserver(([entry]) => {
      if (Math.round(entry.target.getBoundingClientRect().height) !== this.measuredHeight) remeasure()
    }).observe(editor.view.dom)
    this.update()
  }

  get mode(): ViewMode {
    return this.viewMode
  }

  /** Pages of the document; null where the screen is not laid out as the page (a phone's continuous view). */
  get pages(): number | null {
    return this.result?.pages ?? null
  }

  /** The page (from 1) a position of the document is on; null where the screen has no pages. */
  pageOf(pos: number): number | null {
    if (!this.result) return null
    let page = 1
    // A block moved to the next page has its gap at its own start, a paragraph just inside it.
    for (const point of this.result.breaks) if (point.pos <= pos + 1) page++
    return page
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener)
  }

  setMode(mode: ViewMode): void {
    if (mode === this.viewMode) return
    this.viewMode = mode
    try {
      localStorage.setItem(VIEW_KEY, mode === 'page' ? 'sayfa' : 'surekli')
    } catch {
      // The choice still holds for this visit.
    }
    this.host.classList.toggle('is-paged', mode === 'page')
    this.full = true
    this.update()
    this.editor.commands.scrollIntoView()
  }

  /** The range of the document a change touched, kept until the next layout. */
  private markChanged(tr: Transaction): void {
    if (tr.before.attrs.page !== tr.doc.attrs.page) {
      this.full = true
      return
    }
    let from = this.dirty ? tr.mapping.map(this.dirty.from, -1) : Number.POSITIVE_INFINITY
    let to = this.dirty ? tr.mapping.map(this.dirty.to, 1) : Number.NEGATIVE_INFINITY
    tr.steps.forEach((step, index) => {
      const rest = tr.mapping.slice(index + 1)
      const add = (start: number, end: number) => {
        from = Math.min(from, rest.map(start, -1))
        to = Math.max(to, rest.map(end, 1))
      }
      // Text replaced; or marks and attributes changed in place (bold text is wider).
      step.getMap().forEach((_oldStart, _oldEnd, start, end) => add(start, end))
      const { from: stepFrom, to: stepTo, pos } = step as unknown as { from?: number; to?: number; pos?: number }
      if (typeof stepFrom === 'number' && typeof stepTo === 'number') add(Math.min(stepFrom, stepTo), Math.max(stepFrom, stepTo))
      if (typeof pos === 'number') add(pos, pos + 1)
    })
    if (from <= to) this.dirty = { from: Math.max(0, from), to: Math.min(tr.doc.content.size, to) }
    else this.full = true
  }

  /**
   * The gaps that edited text may have left in the middle of a line, hidden while measuring: those
   * in the paragraphs the changes touched. With `full`, all of them.
   */
  private suspectGaps(): HTMLElement[] {
    const { view } = this.editor
    if (this.full || !this.dirty) return this.full ? [...view.dom.querySelectorAll<HTMLElement>('.page-gap')] : []
    const gaps: HTMLElement[] = []
    view.state.doc.nodesBetween(this.dirty.from, this.dirty.to, (node, pos) => {
      if (!node.isTextblock) return true
      const element = view.nodeDOM(pos)
      if (element instanceof HTMLElement) gaps.push(...element.querySelectorAll<HTMLElement>('.page-gap'))
      return false
    })
    return gaps
  }

  /** Everything measured again soon: the editor was hidden (the welcome screen) and shows again. */
  remeasure(): void {
    this.full = true
    this.schedule()
  }

  /** Lays the pages out now (before printing, and in tests). */
  update(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    const { view } = this.editor
    // Not in the middle of a word being composed (phone keyboards): the gaps change after it.
    if (view.composing) {
      view.dom.addEventListener('compositionend', () => this.schedule(), { once: true })
      return
    }
    // A selection just made with the keyboard is read first, or redrawing the gaps would put back the old one.
    readPendingSelection(view)
    const setup = currentPageSetup(this.editor)
    const size = pageSize(setup)
    const geometry = {
      height: size.height * MM,
      marginTop: setup.margins.top * MM,
      marginBottom: setup.margins.bottom * MM,
      gap: GAP,
    }
    this.applyStyle(setup)

    const style = getComputedStyle(view.dom)
    const textWidth = view.dom.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const pageTextWidth = (size.width - setup.margins.left - setup.margins.right) * MM
    let result: Pagination | null = null
    if (Math.abs(textWidth - pageTextWidth) < 1) {
      // The continuous view measures its page breaks as on the sheets (no height); the gaps are
      // hidden there anyway. The page view hides only the gaps the edits may have displaced; they
      // come back, recomputed, before the screen is drawn.
      const continuous = this.viewMode === 'continuous'
      const hidden = continuous ? [] : this.suspectGaps()
      if (continuous) this.host.classList.add('is-measuring')
      for (const gap of hidden) gap.style.display = 'none'
      const notes = this.measureNotes(pageTextWidth)
      result = paginate(view, geometry, notes)
      for (const gap of hidden) gap.style.display = ''
      if (continuous) this.host.classList.remove('is-measuring')
    }
    this.full = false
    this.dirty = null
    applyPagination(view, result)
    this.result = paginationKey.getState(view.state)?.result ?? null
    this.host.classList.toggle('is-paginated', this.result !== null)
    this.drawSheets(setup, geometry.height)
    this.measuredHeight = Math.round(view.dom.getBoundingClientRect().height)
    for (const listener of this.listeners) listener()
  }

  /** How far below its page's bottom margin each footnotes block ends (place → pixels). */
  private notesOffsets(pageHeight: number, marginBottom: number): Map<number, number> {
    const offsets = new Map<number, number>()
    const origin = this.editor.view.dom.getBoundingClientRect().top + this.editor.view.dom.clientTop
    for (const element of this.editor.view.dom.querySelectorAll<HTMLElement>('.page-notes[data-notes-place]')) {
      const list = element.querySelector('.page-notes__list')
      if (!list) continue
      const bottom = list.getBoundingClientRect().bottom - origin
      const sheet = Math.floor(bottom / (pageHeight + GAP))
      const expected = sheet * (pageHeight + GAP) + pageHeight - marginBottom - 2
      const off = bottom - expected
      if (Math.abs(off) > 0.5) offsets.set(Number(element.dataset.notesPlace), off)
    }
    return offsets
  }

  /** The footnotes with the height their text takes at a page's foot. */
  private measureNotes(width: number): NoteSource[] {
    const notes = footnotesOf(this.editor.state.doc)
    if (!notes.length) return []
    if (!this.noteMeasure) {
      this.noteMeasure = document.createElement('div')
      this.noteMeasure.className = 'page-notes__list page-notes-measure'
      this.noteMeasure.setAttribute('aria-hidden', 'true')
      document.body.append(this.noteMeasure)
    }
    this.noteMeasure.style.width = `${width}px`
    if (this.noteHeights.size > 500) this.noteHeights.clear()
    return notes.map(note => {
      const key = `${Math.round(width)}|${note.number}|${note.text}`
      let height = this.noteHeights.get(key)
      if (height === undefined) {
        const item = noteItem(note.number, note.text)
        this.noteMeasure!.replaceChildren(item)
        height = Math.ceil(item.getBoundingClientRect().height)
        this.noteHeights.set(key, height)
      }
      return { pos: note.pos, number: note.number, text: note.text, height }
    })
  }

  private schedule(): void {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.update())
  }

  /** The page's measures as CSS variables on the host, and the print style; only when they change. */
  private applyStyle(setup: PageSetup): void {
    const key = JSON.stringify(setup)
    if (key === this.styleKey) return
    this.styleKey = key
    const size = pageSize(setup)
    const set = (name: string, millimetres: number) => this.host.style.setProperty(name, `${millimetres * MM}px`)
    set('--page-width', size.width)
    set('--page-height', size.height)
    set('--margin-top', setup.margins.top)
    set('--margin-right', setup.margins.right)
    set('--margin-bottom', setup.margins.bottom)
    set('--margin-left', setup.margins.left)
    this.host.style.setProperty('--page-gap', `${GAP}px`)
    this.style.textContent = printStyle(setup)
  }

  /** One sheet per page behind the text, with its header, footer and page number. */
  private drawSheets(setup: PageSetup, height: number): void {
    const pages = this.result?.pages ?? 1
    this.host.style.setProperty('--pages-height', `${pages * (height + GAP) - GAP}px`)
    while (this.sheets.children.length > pages) this.sheets.lastElementChild!.remove()
    while (this.sheets.children.length < pages) {
      const sheet = document.createElement('div')
      sheet.className = 'page-sheet'
      for (const part of ['header', 'footer', 'number']) {
        const element = document.createElement('div')
        element.className = `page-sheet__${part}`
        sheet.append(element)
      }
      this.sheets.append(sheet)
    }
    // Only what changed is written: a long document has many sheets and this runs as one types.
    const write = (element: Element, text: string) => {
      if (element.textContent !== text) element.textContent = text
    }
    const numberAtFooter = setup.pageNumbers === 'bottom-center' && setup.footer !== ''
    ;[...this.sheets.children].forEach((sheet, index) => {
      const element = sheet as HTMLElement
      const top = `${index * (height + GAP)}px`
      if (element.style.top !== top) element.style.top = top
      const [header, footer, number] = [...element.children] as HTMLElement[]
      const numberText = setup.pageNumbers === 'none' ? '' : pageNumberText(setup, index + 1, pages)
      write(header, setup.header)
      // A number in the middle of the footer follows the footer's text, as on paper.
      write(footer, numberAtFooter ? `${setup.footer}   ${numberText}` : setup.footer)
      write(number, numberAtFooter ? '' : numberText)
      if (number.dataset.place !== setup.pageNumbers) number.dataset.place = setup.pageNumbers
    })
  }
}
